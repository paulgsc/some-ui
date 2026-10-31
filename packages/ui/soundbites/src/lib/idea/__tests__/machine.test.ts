/** @vitest-environment node */
import type {
  IdeaEvent,
  IdeaIntent,
  IdeaState,
} from "@soundbites/lib/idea/machine"
import { apply, initialIdeaState, step } from "@soundbites/lib/idea/machine"
import type { Idea } from "@soundbites/lib/idea/model"
import {
  grows,
  openQuestion,
  waiting,
  withReply,
} from "@soundbites/lib/idea/model"
import { describe, expect, it } from "vitest"

const AT = "2026-10-30T10:00:00.000Z"

/** Runs events through `step`, applying each keep to `ideas` as a store would. */
function run(
  events: ReadonlyArray<IdeaEvent>,
  start: IdeaState = initialIdeaState("idea-1"),
  ideas: Array<Idea> = []
): { state: IdeaState; ideas: ReadonlyArray<Idea>; listens: Array<number> } {
  let state = start
  let kept: ReadonlyArray<Idea> = ideas
  const listens: Array<number> = []
  const queue = [...events]
  while (queue.length > 0) {
    const event = queue.shift()
    if (event === undefined) break
    const next = step(state, event)
    state = next.state
    for (const effect of next.effects) {
      if (effect.type === "keep") {
        const after = apply(kept, effect.op, effect.at)
        expect(grows(kept, after)).toBe(true)
        kept = after
        queue.unshift({ type: "kept", ideas: kept })
      }
      if (effect.type === "listen") listens.push(effect.seq)
    }
  }
  return { state, ideas: kept, listens }
}

const tap = (intent: Exclude<IdeaIntent, { type: "another" }>): IdeaEvent => ({
  ...intent,
  at: AT,
})

const OPENED: ReadonlyArray<IdeaEvent> = [
  { type: "entered", at: AT },
  { type: "listed", ideas: [] },
  { type: "voiceChecked", available: true },
]

function screenOf(state: IdeaState): string {
  const { screen } = state
  return screen.kind === "ask"
    ? `ask:${screen.question}:${screen.phase.kind}`
    : screen.kind
}

describe("catching an idea", () => {
  it("opens at the first question, ready to talk", () => {
    expect(screenOf(run(OPENED).state)).toBe("ask:what:idle")
  })

  it("shows the words as they're heard, and keeps them once they're right", () => {
    const { state, ideas } = run([
      ...OPENED,
      tap({ type: "talk" }),
      { type: "partial", seq: 1, words: "a short" },
      { type: "partial", seq: 1, words: "a short about bites" },
      { type: "listened", seq: 1, result: { kind: "heard", words: "" } },
      tap({ type: "right" }),
    ])
    expect(ideas).toHaveLength(1)
    expect(ideas[0]?.answers[0]?.versions).toEqual([
      { at: AT, how: "heard", words: "a short about bites" },
    ])
    expect(screenOf(state)).toBe("ask:takeaway:idle")
  })

  it("keeps the words first heard beside a fix", () => {
    const { ideas } = run([
      ...OPENED,
      tap({ type: "talk" }),
      { type: "listened", seq: 1, result: { kind: "heard", words: "a shirt" } },
      tap({ type: "fix" }),
      tap({ type: "draft", text: "a short" }),
      tap({ type: "save" }),
    ])
    const [answer] = ideas[0]?.answers ?? []
    expect(answer?.versions.map((version) => version.how)).toEqual([
      "heard",
      "fixed",
    ])
    expect(answer?.versions.at(-1)?.words).toBe("a short")
  })

  it("keeps nothing it heard until it is confirmed", () => {
    const { ideas, listens } = run([
      ...OPENED,
      tap({ type: "talk" }),
      { type: "listened", seq: 1, result: { kind: "heard", words: "wrong" } },
      tap({ type: "talk" }),
      { type: "listened", seq: 2, result: { kind: "heard", words: "right" } },
    ])
    expect(ideas).toEqual([])
    expect(listens).toEqual([1, 2])
  })

  it("ignores what an earlier listening hears", () => {
    const { state } = run([
      ...OPENED,
      tap({ type: "talk" }),
      tap({ type: "type" }),
      { type: "listened", seq: 1, result: { kind: "heard", words: "late" } },
    ])
    expect(screenOf(state)).toBe("ask:what:typing")
  })

  it("takes typed words when the phone can't listen", () => {
    const { state, ideas } = run([
      { type: "entered", at: AT },
      { type: "listed", ideas: [] },
      { type: "voiceChecked", available: false },
      tap({ type: "talk" }),
      tap({ type: "draft", text: "typed idea" }),
      tap({ type: "save" }),
    ])
    expect(ideas[0]?.answers[0]?.versions[0]?.how).toBe("typed")
    expect(screenOf(state)).toBe("ask:takeaway:typing")
  })

  it("turns to typing, keeping what it heard, when listening is unavailable", () => {
    const { state } = run([
      ...OPENED,
      tap({ type: "talk" }),
      { type: "partial", seq: 1, words: "half" },
      { type: "listened", seq: 1, result: { kind: "unavailable" } },
    ])
    expect(state.voice).toBe("unavailable")
    expect(state.screen).toMatchObject({
      phase: { kind: "typing", draft: "half" },
    })
  })

  it("says nothing was heard, and stays on the question", () => {
    const { state } = run([
      ...OPENED,
      tap({ type: "talk" }),
      { type: "listened", seq: 1, result: { kind: "heard", words: " " } },
    ])
    expect(screenOf(state)).toBe("ask:what:idle")
    expect(state.notice).toBe("notHeard")
  })

  it("never skips the first question, and skips the others", () => {
    const first = run([...OPENED, tap({ type: "skip" })])
    expect(screenOf(first.state)).toBe("ask:what:idle")

    const { state, ideas } = run([
      ...OPENED,
      tap({ type: "talk" }),
      { type: "listened", seq: 1, result: { kind: "heard", words: "idea" } },
      tap({ type: "right" }),
      tap({ type: "skip" }),
      tap({ type: "skip" }),
      tap({ type: "skip" }),
    ])
    expect(screenOf(state)).toBe("kept")
    expect(ideas[0]?.passed).toEqual(["takeaway", "spark", "picture"])
  })

  it("answers a skipped question later, from the kept screen", () => {
    const skipped = run([
      ...OPENED,
      tap({ type: "type" }),
      tap({ type: "draft", text: "idea" }),
      tap({ type: "save" }),
      tap({ type: "skip" }),
      tap({ type: "skip" }),
      tap({ type: "skip" }),
    ])
    const { state, ideas } = run(
      [
        tap({ type: "answerSkipped" }),
        tap({ type: "type" }),
        tap({ type: "draft", text: "the point" }),
        tap({ type: "save" }),
      ],
      skipped.state,
      [...skipped.ideas]
    )
    expect(screenOf(state)).toBe("kept")
    expect(ideas[0]?.answers.map((answer) => answer.question)).toEqual([
      "what",
      "takeaway",
    ])
  })

  it("resumes the newest idea still open, at its open question", () => {
    const open: Idea = {
      id: "idea-0",
      at: AT,
      questions: 1,
      answers: [
        { question: "what", versions: [{ at: AT, how: "typed", words: "x" }] },
      ],
      passed: ["takeaway"],
    }
    const { state } = run([
      { type: "entered", at: AT },
      { type: "listed", ideas: [open] },
    ])
    expect(state.ideaId).toBe("idea-0")
    expect(screenOf(state)).toBe("ask:spark:idle")
  })

  it("says so, and keeps the words on screen, when the phone refuses them", () => {
    const opened = run([
      ...OPENED,
      tap({ type: "type" }),
      tap({ type: "draft", text: "idea" }),
    ]).state
    const saved = step(opened, tap({ type: "save" }))
    const refused = step(saved.state, { type: "kept", ideas: null })
    expect(refused.state.notice).toBe("notKept")
    expect(refused.state.screen).toMatchObject({
      phase: { kind: "typing", draft: "idea" },
    })
  })

  describe("LS1: every tap that starts or stops listening is answered on screen", () => {
    const listening = (): IdeaState =>
      run([...OPENED, tap({ type: "talk" })]).state

    it("is getting ready until the recognizer says it is listening", () => {
      const started = listening()
      expect(started.screen).toMatchObject({
        phase: { kind: "listening", seq: 1, ready: false },
      })
      const ready = step(started, { type: "ready", seq: 1 })
      expect(ready.state.screen).toMatchObject({
        phase: { kind: "listening", ready: true },
      })
      expect(ready.effects).toEqual([])
      // An earlier listening's ready changes nothing.
      expect(step(started, { type: "ready", seq: 0 }).state).toBe(started)
    })

    it("takes typed words for this question when the recognizer never started", () => {
      const { state } = run([
        ...OPENED,
        tap({ type: "talk" }),
        { type: "listened", seq: 1, result: { kind: "notStarted" } },
      ])
      expect(state.notice).toBe("listenNotStarted")
      expect(screenOf(state)).toBe("ask:what:typing")
      // The next question may try the voice again.
      expect(state.voice).toBe("ready")
    })

    it.each([
      ["before ready", []],
      ["after ready", [{ type: "ready", seq: 1 } as const]],
      ["mid-speech", [{ type: "partial", seq: 1, words: "so far" } as const]],
    ])(
      "shows Done talking finishing, %s, until the words come",
      (_, before) => {
        const stopped = run([...OPENED, tap({ type: "talk" }), ...before])
        const finishing = step(stopped.state, tap({ type: "stopTalking" }))
        expect(finishing.effects).toEqual([{ type: "stopListening" }])
        expect(finishing.state.screen).toMatchObject({
          phase: { kind: "finishing", seq: 1 },
        })
        // A second Done talking does nothing more.
        expect(
          step(finishing.state, tap({ type: "stopTalking" })).effects
        ).toEqual([])
        const heard = step(finishing.state, {
          type: "listened",
          seq: 1,
          result: { kind: "heard", words: "all of it" },
        })
        expect(heard.state.screen).toMatchObject({
          phase: { kind: "heard", words: "all of it" },
        })
      }
    )

    it("keeps the words so far when a stop brings nothing more", () => {
      const { state } = run([
        ...OPENED,
        tap({ type: "talk" }),
        { type: "ready", seq: 1 },
        { type: "partial", seq: 1, words: "so far" },
        tap({ type: "stopTalking" }),
        { type: "partial", seq: 1, words: "so far and more" },
        { type: "listened", seq: 1, result: { kind: "heard", words: "" } },
      ])
      expect(state.screen).toMatchObject({
        phase: { kind: "heard", words: "so far and more" },
      })
    })

    it("says nothing was heard when a stop before any words brings nothing", () => {
      const { state } = run([
        ...OPENED,
        tap({ type: "talk" }),
        tap({ type: "stopTalking" }),
        { type: "listened", seq: 1, result: { kind: "heard", words: "" } },
      ])
      expect(screenOf(state)).toBe("ask:what:idle")
      expect(state.notice).toBe("notHeard")
    })

    it.each([
      ["failed", "listenFailed", "ask:what:idle"],
      ["notStarted", "listenNotStarted", "ask:what:typing"],
    ] as const)("says so when a stop ends as %s", (kind, notice, screen) => {
      const { state } = run([
        ...OPENED,
        tap({ type: "talk" }),
        tap({ type: "stopTalking" }),
        { type: "listened", seq: 1, result: { kind } },
      ])
      expect(state.notice).toBe(notice)
      expect(screenOf(state)).toBe(screen)
    })

    it("turns to typing with the words so far, letting the listening go, from finishing", () => {
      const finishing = run([
        ...OPENED,
        tap({ type: "talk" }),
        { type: "partial", seq: 1, words: "half" },
        tap({ type: "stopTalking" }),
      ]).state
      const typing = step(finishing, tap({ type: "type" }))
      expect(typing.effects).toEqual([{ type: "cancelListening" }])
      expect(typing.state.screen).toMatchObject({
        phase: { kind: "typing", draft: "half" },
      })
    })

    it("stops a listening when the page hides, and lets a finishing one go when the screen goes", () => {
      const hidden = step(listening(), { type: "hidden" })
      expect(hidden.effects).toEqual([{ type: "stopListening" }])
      expect(hidden.state.screen).toMatchObject({
        phase: { kind: "finishing" },
      })
      const left = step(hidden.state, { type: "left" })
      expect(left.effects).toEqual([{ type: "cancelListening" }])
      expect(screenOf(left.state)).toBe("ask:what:idle")
    })
  })

  it("lets go of the listening when the screen goes", () => {
    const listening = run([...OPENED, tap({ type: "talk" })]).state
    expect(step(listening, { type: "left" }).effects).toEqual([
      { type: "cancelListening" },
    ])
  })

  it("offers an earlier idea's skipped questions on a new idea's first screen", () => {
    const earlier: Idea = {
      id: "idea-0",
      at: AT,
      questions: 1,
      answers: [
        { question: "what", versions: [{ at: AT, how: "typed", words: "x" }] },
      ],
      passed: ["takeaway", "spark", "picture"],
    }
    const opened = run([
      { type: "entered", at: AT },
      { type: "listed", ideas: [earlier] },
      { type: "voiceChecked", available: true },
    ])
    expect(opened.state.idea).toBeNull()
    expect(opened.state.skipped?.id).toBe("idea-0")
    const { state, ideas } = run(
      [
        tap({ type: "answerSkipped" }),
        tap({ type: "type" }),
        tap({ type: "draft", text: "the point" }),
        tap({ type: "save" }),
      ],
      opened.state,
      [earlier]
    )
    expect(ideas).toHaveLength(1)
    expect(ideas[0]?.answers.map((answer) => answer.question)).toEqual([
      "what",
      "takeaway",
    ])
    expect(screenOf(state)).toBe("kept")
  })

  it("starts another idea once one is kept", () => {
    const done = run([
      ...OPENED,
      tap({ type: "type" }),
      tap({ type: "draft", text: "idea" }),
      tap({ type: "save" }),
      tap({ type: "skip" }),
      tap({ type: "skip" }),
      tap({ type: "skip" }),
    ])
    const next = step(done.state, { type: "another", at: AT, id: "idea-2" })
    expect(next.state.ideaId).toBe("idea-2")
    expect(next.state.idea).toBeNull()
    expect(screenOf(next.state)).toBe("ask:what:idle")
    expect(done.ideas[0] && openQuestion(done.ideas[0])).toBeNull()
  })

  it("asks Claude's questions about one idea only when opened on it (ST19)", () => {
    const base = run([
      ...OPENED,
      tap({ type: "type" }),
      tap({ type: "draft", text: "a short" }),
      tap({ type: "save" }),
    ]).ideas[0]
    const asked =
      base &&
      withReply(base, { primer: null, ask: ["Which week?", "Why now?"] }, AT)
    if (!asked) throw new Error("asked")
    // New idea resumes at the idea's own next question, never Claude's.
    expect(
      screenOf(
        run([...OPENED.slice(0, 1), { type: "listed", ideas: [asked] }]).state
      )
    ).toBe("ask:takeaway:idle")

    const focused = run(
      [
        { type: "entered", at: AT },
        { type: "listed", ideas: [asked] },
        { type: "voiceChecked", available: true },
        tap({ type: "talk" }),
        {
          type: "listened",
          seq: 1,
          result: { kind: "heard", words: "week 8" },
        },
        tap({ type: "right" }),
        tap({ type: "skip" }),
      ],
      initialIdeaState("unused", "idea-1"),
      [asked]
    )
    expect(screenOf(focused.state)).toBe("kept")
    const kept = focused.ideas[0]
    expect(kept?.answers.at(-1)).toEqual({
      question: "ask-1",
      versions: [{ at: AT, how: "heard", words: "week 8" }],
    })
    expect(kept?.passed).toEqual(["ask-2"])

    // Skipped, it waits on nothing, and is still answered when asked for,
    // as a skipped question of the idea's own is.
    if (!kept) throw new Error("kept")
    expect(waiting(kept)).toBe(0)
    expect(
      screenOf(step(focused.state, tap({ type: "answerSkipped" })).state)
    ).toBe("ask:ask-2:idle")
    const reopened = run(
      [
        { type: "entered", at: AT },
        { type: "listed", ideas: [kept] },
      ],
      initialIdeaState("unused", "idea-1"),
      [kept]
    )
    expect(screenOf(reopened.state)).toBe("ask:ask-2:idle")
  })
})
