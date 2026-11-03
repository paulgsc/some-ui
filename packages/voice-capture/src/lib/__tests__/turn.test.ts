/** @vitest-environment node */
import { RECORDING_FAILURE_COPY } from "@voice-capture/lib/recorder"
import type {
  Listened,
  TurnEffect,
  TurnEvent,
  TurnIntent,
  TurnPhase,
  TurnState,
} from "@voice-capture/lib/turn"
import {
  initialTurn,
  isUnderway,
  nextTurn,
  stepTurn,
} from "@voice-capture/lib/turn"
import { TURN_WORDS, turnNoticeSaid } from "@voice-capture/lib/turn-words"
import * as fc from "fast-check"
import { describe, expect, it } from "vitest"

const AT = "2026-11-03T10:00:00.000Z"

const tap = (intent: TurnIntent): TurnEvent => ({ ...intent, at: AT })

/** Runs events through `stepTurn`, collecting the effects. */
function run(
  events: ReadonlyArray<TurnEvent>,
  start: TurnState = initialTurn
): { state: TurnState; effects: ReadonlyArray<TurnEffect> } {
  let state = start
  const effects: Array<TurnEffect> = []
  for (const event of events) {
    const next = stepTurn(state, event)
    state = next.state
    effects.push(...next.effects)
  }
  return { state, effects }
}

const READY: ReadonlyArray<TurnEvent> = [
  { type: "voiceChecked", available: true },
]

const keeps = (effects: ReadonlyArray<TurnEffect>): ReadonlyArray<unknown> =>
  effects.flatMap((effect) => (effect.type === "keep" ? [effect.versions] : []))

describe("a turn", () => {
  it("shows the words as they're heard, and keeps them once they're right", () => {
    const { state, effects } = run([
      ...READY,
      tap({ type: "talk" }),
      { type: "partial", seq: 1, words: "a short" },
      { type: "partial", seq: 1, words: "a short about bites" },
      { type: "listened", seq: 1, result: { kind: "heard", words: "" } },
      tap({ type: "meant" }),
    ])
    expect(keeps(effects)).toEqual([
      [{ at: AT, how: "heard", words: "a short about bites" }],
    ])
    expect(state.phase.kind).toBe("keeping")
    expect(stepTurn(state, { type: "kept" }).state.phase).toEqual({
      kind: "kept",
      versions: [{ at: AT, how: "heard", words: "a short about bites" }],
    })
  })

  it("keeps the words first heard beside a fix", () => {
    const { effects } = run([
      ...READY,
      tap({ type: "talk" }),
      { type: "listened", seq: 1, result: { kind: "heard", words: "a shirt" } },
      tap({ type: "fix" }),
      tap({ type: "draft", text: "a short" }),
      tap({ type: "save" }),
    ])
    expect(keeps(effects)).toEqual([
      [
        { at: AT, how: "heard", words: "a shirt" },
        { at: AT, how: "fixed", words: "a short" },
      ],
    ])
  })

  it("takes typed words when it can't listen", () => {
    const { state, effects } = run([
      { type: "voiceChecked", available: false },
      tap({ type: "talk" }),
      tap({ type: "draft", text: "typed idea" }),
      tap({ type: "save" }),
    ])
    expect(keeps(effects)).toEqual([
      [{ at: AT, how: "typed", words: "typed idea" }],
    ])
    expect(nextTurn(stepTurn(state, { type: "kept" }).state).phase).toEqual({
      kind: "typing",
      draft: "",
    })
  })

  it("turns to typing, keeping what it heard, when listening is unavailable", () => {
    const { state } = run([
      ...READY,
      tap({ type: "talk" }),
      { type: "partial", seq: 1, words: "half" },
      { type: "listened", seq: 1, result: { kind: "unavailable" } },
    ])
    expect(state.voice).toBe("unavailable")
    expect(state.phase).toEqual({ kind: "typing", draft: "half" })
  })

  it("offers Say it again once it can listen, only while nothing is typed", () => {
    const unavailable = run([{ type: "voiceChecked", available: false }]).state
    expect(
      stepTurn(unavailable, { type: "voiceChecked", available: true }).state
        .phase
    ).toEqual({ kind: "idle" })
    const { state } = run(
      [
        tap({ type: "draft", text: "half typed" }),
        { type: "voiceChecked", available: true },
      ],
      unavailable
    )
    expect(state.phase).toEqual({ kind: "typing", draft: "half typed" })
  })

  it("says nothing was heard, and stays on the turn", () => {
    const { state } = run([
      ...READY,
      tap({ type: "talk" }),
      { type: "listened", seq: 1, result: { kind: "heard", words: " " } },
    ])
    expect(state.phase.kind).toBe("idle")
    expect(state.notice).toBe("notHeard")
  })

  it("returns to the words, saying so, when they couldn't be kept", () => {
    const typed = run([
      tap({ type: "type" }),
      tap({ type: "draft", text: "idea" }),
      tap({ type: "save" }),
    ]).state
    const refused = stepTurn(typed, { type: "notKept" }).state
    expect(refused.notice).toBe("notKept")
    expect(refused.phase).toEqual({ kind: "typing", draft: "idea" })
  })

  it("says where a take whose words didn't come is kept, and asks again what can listen when home didn't answer", () => {
    const { state, effects } = run([
      ...READY,
      tap({ type: "talk" }),
      { type: "hearing", seq: 1 },
      {
        type: "listened",
        seq: 1,
        result: { kind: "kept", on: "phone", why: "away" },
      },
    ])
    expect(state.phase).toEqual({ kind: "typing", draft: "" })
    expect(state.notice).toBe("awayOnPhone")
    expect(effects.at(-1)).toEqual({ type: "checkVoice" })
  })

  describe("every tap that starts or stops listening is answered on screen", () => {
    const listening = (): TurnState =>
      run([...READY, tap({ type: "talk" })]).state

    it("is getting ready until the listener says it is listening", () => {
      const started = listening()
      expect(started.phase).toMatchObject({
        kind: "listening",
        seq: 1,
        ready: false,
      })
      const ready = stepTurn(started, { type: "ready", seq: 1 })
      expect(ready.state.phase).toMatchObject({
        kind: "listening",
        ready: true,
      })
      expect(ready.effects).toEqual([])
    })

    it("takes typed words for this turn when the listener never started", () => {
      const { state } = run([
        ...READY,
        tap({ type: "talk" }),
        { type: "listened", seq: 1, result: { kind: "notStarted" } },
      ])
      expect(state.notice).toBe("listenNotStarted")
      expect(state.phase.kind).toBe("typing")
      // The next turn may try the voice again.
      expect(state.voice).toBe("ready")
    })

    it.each([
      ["before ready", []],
      ["after ready", [{ type: "ready", seq: 1 } as const]],
      ["mid-speech", [{ type: "partial", seq: 1, words: "so far" } as const]],
    ])(
      "shows Done talking finishing, %s, until the words come",
      (_, before) => {
        const stopped = run([...READY, tap({ type: "talk" }), ...before])
        const finishing = stepTurn(stopped.state, tap({ type: "stopTalking" }))
        expect(finishing.effects).toEqual([{ type: "stopListening" }])
        expect(finishing.state.phase).toMatchObject({
          kind: "finishing",
          seq: 1,
        })
        // A second Done talking does nothing more.
        expect(
          stepTurn(finishing.state, tap({ type: "stopTalking" })).effects
        ).toEqual([])
        const heard = stepTurn(finishing.state, {
          type: "listened",
          seq: 1,
          result: { kind: "heard", words: "all of it" },
        })
        expect(heard.state.phase).toEqual({ kind: "heard", words: "all of it" })
      }
    )

    it("keeps the words so far when a stop brings nothing more", () => {
      const { state } = run([
        ...READY,
        tap({ type: "talk" }),
        { type: "ready", seq: 1 },
        { type: "partial", seq: 1, words: "so far" },
        tap({ type: "stopTalking" }),
        { type: "partial", seq: 1, words: "so far and more" },
        { type: "listened", seq: 1, result: { kind: "heard", words: "" } },
      ])
      expect(state.phase).toEqual({ kind: "heard", words: "so far and more" })
    })

    it.each([
      ["heard", "notHeard", "idle"],
      ["failed", "listenFailed", "idle"],
      ["notStarted", "listenNotStarted", "typing"],
    ] as const)(
      "says so when a stop before any words ends as %s",
      (kind, notice, phase) => {
        const result: Listened =
          kind === "heard" ? { kind, words: "" } : { kind }
        const { state } = run([
          ...READY,
          tap({ type: "talk" }),
          tap({ type: "stopTalking" }),
          { type: "listened", seq: 1, result },
        ])
        expect(state.notice).toBe(notice)
        expect(state.phase.kind).toBe(phase)
      }
    )

    it("turns to typing with the words so far, letting the listening go, from finishing", () => {
      const finishing = run([
        ...READY,
        tap({ type: "talk" }),
        { type: "partial", seq: 1, words: "half" },
        tap({ type: "stopTalking" }),
      ]).state
      const typing = stepTurn(finishing, tap({ type: "type" }))
      expect(typing.effects).toEqual([{ type: "cancelListening" }])
      expect(typing.state.phase).toEqual({ kind: "typing", draft: "half" })
    })

    it("stops a listening when the page hides, and lets a finishing one go when the screen goes", () => {
      const hidden = stepTurn(listening(), { type: "hidden" })
      expect(hidden.effects).toEqual([{ type: "stopListening" }])
      expect(hidden.state.phase.kind).toBe("finishing")
      const left = stepTurn(hidden.state, { type: "left" })
      expect(left.effects).toEqual([{ type: "cancelListening" }])
      expect(left.state.phase.kind).toBe("idle")
    })
  })
})

/** Every event a turn can be sent, its listenings numbered 0 to 3. */
const SEQ = fc.integer({ min: 0, max: 3 })
const WORDS = fc.constantFrom("", " ", "a short", "a shirt")
const LISTENED: fc.Arbitrary<Listened> = fc.oneof(
  WORDS.map((words) => ({ kind: "heard" as const, words })),
  fc.constantFrom<Listened>(
    { kind: "unavailable" },
    { kind: "notStarted" },
    { kind: "failed" },
    { kind: "kept", on: "home", why: "late" },
    { kind: "kept", on: "phone", why: "away" },
    { kind: "kept", on: "home", why: "noWords" },
    { kind: "notKept", why: "full" },
    { kind: "refused", reason: "denied" }
  )
)
const EVENT: fc.Arbitrary<TurnEvent> = fc.oneof(
  fc
    .constantFrom<TurnIntent>(
      { type: "talk" },
      { type: "stopTalking" },
      { type: "meant" },
      { type: "fix" },
      { type: "type" },
      { type: "save" }
    )
    .map(tap),
  WORDS.map((text) => tap({ type: "draft", text })),
  fc.boolean().map((available) => ({
    type: "voiceChecked" as const,
    available,
  })),
  SEQ.map((seq) => ({ type: "ready" as const, seq })),
  SEQ.map((seq) => ({ type: "hearing" as const, seq })),
  fc.tuple(SEQ, WORDS).map(([seq, words]) => ({
    type: "partial" as const,
    seq,
    words,
  })),
  fc.tuple(SEQ, LISTENED).map(([seq, result]) => ({
    type: "listened" as const,
    seq,
    result,
  })),
  fc.constantFrom<TurnEvent>(
    { type: "kept" },
    { type: "notKept" },
    { type: "hidden" },
    { type: "left" }
  )
)

/** The words the turn shows as heard, if any. */
function heardOf(phase: TurnPhase): string | null {
  if (phase.kind === "heard") return phase.words
  if (phase.kind === "fixing") return phase.heard
  return null
}

const SEQ_EVENTS = new Set(["ready", "hearing", "partial", "listened"])

describe("TALK1: every ordering of hearing, confirming, keeping and leaving", () => {
  it("keeps only confirmed words, once, and nothing late moves a kept turn", () => {
    fc.assert(
      fc.property(fc.array(EVENT, { maxLength: 40 }), (events) => {
        let state = initialTurn
        for (const event of events) {
          const { state: next, effects } = stepTurn(state, event)
          const kept = effects.filter((effect) => effect.type === "keep")
          if (kept.length > 0) {
            // Only That's right on words heard, or a save, keeps.
            expect(kept).toHaveLength(1)
            expect(["meant", "save"]).toContain(event.type)
            expect(["heard", "fixing", "typing"]).toContain(state.phase.kind)
            const [keep] = kept
            if (keep?.type !== "keep") throw new Error("keep")
            for (const version of keep.versions) {
              expect(version.words.trim()).not.toBe("")
            }
            // A fix keeps the words first heard beside it, first.
            const heard = heardOf(state.phase)
            if (heard !== null) {
              expect(keep.versions[0]).toMatchObject({
                how: "heard",
                words: heard,
              })
            }
            expect(next.phase.kind).toBe("keeping")
          }
          // Kept is kept: nothing moves it.
          if (state.phase.kind === "kept") expect(next.phase).toBe(state.phase)
          // While keeping, nothing else is kept.
          if (state.phase.kind === "keeping") {
            expect(kept).toEqual([])
          }
          // A result for a listening not under way changes nothing.
          if (
            SEQ_EVENTS.has(event.type) &&
            "seq" in event &&
            !(isUnderway(state.phase) && state.phase.seq === event.seq)
          ) {
            expect(next).toBe(state)
          }
          // Leaving lets go of a listening under way, and leaves none.
          if (event.type === "left") {
            expect(isUnderway(next.phase)).toBe(false)
            expect(effects).toEqual(
              isUnderway(state.phase) ? [{ type: "cancelListening" }] : []
            )
          }
          // A listening is numbered after every one before it.
          for (const effect of effects) {
            if (effect.type === "listen") {
              expect(effect.seq).toBe(state.seq + 1)
              expect(next.seq).toBe(effect.seq)
            }
          }
          state = next
        }
      })
    )
  })
})

/** How a turn must never talk to the person: how it works, not what it does. */
const MACHINERY =
  /\b(idle|phase|state|seq|listener|confirm\w*|prime|null|undefined|error|status|request|retry|sync\w*|server|api|effect|dispatch|answers)\b/i

describe("the turn's words", () => {
  it("say every line in the person's terms", () => {
    const { notice, ...taps } = TURN_WORDS
    const lines = [...Object.values(taps), ...Object.values(notice)]
    expect(lines.filter((line) => line.trim() === "")).toEqual([])
    expect(lines.filter((line) => MACHINERY.test(line))).toEqual([])
    expect(turnNoticeSaid("notHeard")).toBe(notice.notHeard)
    expect(turnNoticeSaid({ refused: "busy" })).toBe(
      RECORDING_FAILURE_COPY.busy
    )
    expect(turnNoticeSaid(null)).toBe("")
  })
})
