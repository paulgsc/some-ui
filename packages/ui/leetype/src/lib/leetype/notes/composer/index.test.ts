import type { NoteAnchor } from "@leetype/lib/leetype/notes"
import type {
  ComposerEvent,
  ComposerState,
} from "@leetype/lib/leetype/notes/composer"
import {
  COMPOSER_NOTICES,
  draftOf,
  FAILURES_BEFORE_WITHDRAWING,
  initialComposerState,
  isListening,
  step,
} from "@leetype/lib/leetype/notes/composer"
import type { IntentError } from "@some-ui/intent-kit"
import fc from "fast-check"
import { describe, expect, it } from "vitest"

const ANCHOR: NoteAnchor = {
  roundId: "r",
  own: false,
  artifact: "algorithm",
  picked: null,
  committed: false,
  sessionId: "s",
}

/** Runs `events` from the initial state, collecting every effect. */
function run(
  events: ReadonlyArray<ComposerEvent>,
  state: ComposerState = initialComposerState(true)
): { state: ComposerState; effects: Array<string> } {
  const effects: Array<string> = []
  for (const event of events) {
    const next = step(state, event)
    state = next.state
    effects.push(
      ...next.effects.map((effect) =>
        effect.type === "save" ? `save:${effect.note.text}` : effect.type
      )
    )
  }
  return { state, effects }
}

const BLOCKED: IntentError = {
  kind: "rejected",
  retryable: false,
  summary: "The microphone is blocked for this app.",
  cause: "denied",
}
const BUSY: IntentError = {
  kind: "rejected",
  retryable: true,
  summary: "Your phone's speech service couldn't start listening.",
  cause: "busy",
}

const OPENED: ReadonlyArray<ComposerEvent> = [
  { type: "notePressed", anchor: ANCHOR },
  { type: "noteStarted", kind: "gap", id: "n1", at: "2026-10-03T00:00:00Z" },
]

describe("the note composer's step", () => {
  it("saves the note the moment its kind is picked, anchored where it opened", () => {
    const { state, effects } = run(OPENED)
    expect(effects).toEqual(["save:"])
    expect(state.composer.phase).toBe("noted")
    if (state.composer.phase !== "noted") return
    expect(state.composer.note.anchor).toEqual(ANCHOR)
    expect(state.notice).toBe(COMPOSER_NOTICES.saved)
  })

  it("appends each utterance to the note and saves it", () => {
    const { state, effects } = run([
      ...OPENED,
      { type: "micPressed" },
      { type: "heard", seq: 1, heard: "the bounds" },
      { type: "transcribed", seq: 1, text: "the bounds confuse me" },
      { type: "micPressed" },
      { type: "transcribed", seq: 2, text: "and the budget" },
    ])
    expect(effects).toEqual([
      "save:",
      "listen",
      "save:the bounds confuse me",
      "listen",
      "save:the bounds confuse me and the budget",
    ])
    expect(draftOf(state.composer)).toBe("the bounds confuse me and the budget")
    if (state.composer.phase === "noted") {
      expect(state.composer.note.spoken).toBe(true)
    }
  })

  it("shows what is being heard before it lands", () => {
    const { state } = run([
      ...OPENED,
      { type: "textEdited", text: "typed" },
      { type: "micPressed" },
      { type: "heard", seq: 1, heard: "spoken" },
    ])
    expect(draftOf(state.composer)).toBe("typed spoken")
  })

  it("drops a result for an utterance that is no longer the latest", () => {
    const { state, effects } = run([
      ...OPENED,
      { type: "micPressed" },
      { type: "transcribed", seq: 1, text: "" },
      { type: "micPressed" },
      { type: "transcribed", seq: 1, text: "late" },
      { type: "heard", seq: 1, heard: "late" },
    ])
    expect(effects).toEqual(["save:", "listen", "listen"])
    expect(draftOf(state.composer)).toBe("")
  })

  it("finishes the utterance before closing when Done is pressed mid-sentence", () => {
    const listening = run([...OPENED, { type: "micPressed" }])
    const done = run([{ type: "donePressed" }], listening.state)
    expect(done.effects).toEqual(["finishListening", "startFinishTimer"])
    expect(done.state.composer.phase).toBe("noted")
    const landed = run(
      [{ type: "transcribed", seq: 1, text: "last words" }],
      done.state
    )
    expect(landed.effects).toEqual(["save:last words"])
    expect(landed.state.composer.phase).toBe("closed")
  })

  it("waits for the transcript on a second Done, and closes with what was heard once it times out", () => {
    const { state, effects } = run([
      ...OPENED,
      { type: "micPressed" },
      { type: "heard", seq: 1, heard: "half a thought" },
      { type: "donePressed" },
      { type: "donePressed" },
    ])
    // A phone hands over its words only when done: a second press must not
    // drop them.
    expect(effects).toEqual([
      "save:",
      "listen",
      "finishListening",
      "startFinishTimer",
    ])
    expect(state.composer.phase).toBe("noted")
    const timedOut = run(
      [
        { type: "finishTimedOut", seq: 1 },
        { type: "transcribed", seq: 1, text: "too late" },
      ],
      state
    )
    expect(timedOut.effects).toEqual(["save:half a thought", "cancelListening"])
    expect(timedOut.state.composer.phase).toBe("closed")
  })

  it("ignores a timeout once the transcript has landed", () => {
    const { state, effects } = run([
      ...OPENED,
      { type: "micPressed" },
      { type: "donePressed" },
      { type: "transcribed", seq: 1, text: "landed in time" },
      { type: "finishTimedOut", seq: 1 },
    ])
    expect(effects.at(-1)).toBe("save:landed in time")
    expect(state.composer.phase).toBe("closed")
  })

  it("keeps words heard before a failure, and says what failed when there were none", () => {
    const kept = run([
      ...OPENED,
      { type: "micPressed" },
      { type: "heard", seq: 1, heard: "half a" },
      { type: "listenFailed", seq: 1, error: BUSY },
    ])
    expect(kept.effects.at(-1)).toBe("save:half a")
    expect(kept.state.notice).toBe("")
    const blocked = run([
      ...OPENED,
      { type: "micPressed" },
      { type: "listenFailed", seq: 1, error: BLOCKED },
    ])
    expect(blocked.state.notice).toBe(
      `${BLOCKED.summary} ${COMPOSER_NOTICES.withdrawn}`
    )
    expect(blocked.state.canListen).toBe(false)
  })

  it("tells a quiet learner it heard nothing, without counting it as a failure", () => {
    const { state } = run([
      ...OPENED,
      { type: "micPressed" },
      { type: "listenFailed", seq: 1, error: BUSY },
      { type: "micPressed" },
      { type: "transcribed", seq: 2, text: "" },
    ])
    expect(state.notice).toBe(COMPOSER_NOTICES.silent)
    expect(state.failures).toBe(0)
    expect(state.canListen).toBe(true)
  })

  it("ends a Stop the recognizer never answers, as a failure, not a stuck button", () => {
    const stopped = run([
      ...OPENED,
      { type: "micPressed" },
      { type: "micPressed" },
    ])
    expect(stopped.effects.slice(-2)).toEqual([
      "finishListening",
      "startFinishTimer",
    ])
    const { state, effects } = run(
      [{ type: "finishTimedOut", seq: 1 }],
      stopped.state
    )
    expect(effects).toEqual(["cancelListening"])
    expect(isListening(state.composer)).toBe(false)
    expect(state.notice).toBe(
      `${COMPOSER_NOTICES.noAnswer} ${COMPOSER_NOTICES.retry}`
    )
  })

  it("removes the note on undo, abandoning an utterance", () => {
    const { state, effects } = run([
      ...OPENED,
      { type: "micPressed" },
      { type: "undoPressed" },
      { type: "transcribed", seq: 1, text: "after undo" },
    ])
    expect(effects).toEqual(["save:", "listen", "cancelListening", "remove"])
    expect(state.composer.phase).toBe("closed")
  })

  it("finishes an utterance in progress on leaving the round, keeping the words", () => {
    const { state, effects } = run([
      ...OPENED,
      { type: "micPressed" },
      { type: "roundLeft" },
      { type: "roundLeft" },
      { type: "transcribed", seq: 1, text: "said on the old round" },
    ])
    expect(effects).toEqual([
      "save:",
      "listen",
      "finishListening",
      "startFinishTimer",
      "save:said on the old round",
    ])
    expect(state.composer.phase).toBe("closed")
  })

  it("simply closes on leaving the round when nothing is being said", () => {
    const { state, effects } = run([...OPENED, { type: "roundLeft" }])
    expect(effects).toEqual(["save:"])
    expect(state.composer.phase).toBe("closed")
  })

  it("does not listen while hidden, and finishes an utterance on hiding", () => {
    const hidden = run([...OPENED, { type: "hidden" }, { type: "micPressed" }])
    expect(hidden.effects).toEqual(["save:"])
    const midway = run([...OPENED, { type: "micPressed" }, { type: "hidden" }])
    expect(midway.effects.slice(-2)).toEqual([
      "finishListening",
      "startFinishTimer",
    ])
  })

  it("offers no microphone where there is no recognizer", () => {
    const { effects } = run(
      [...OPENED, { type: "micPressed" }],
      initialComposerState(false)
    )
    expect(effects).toEqual(["save:"])
  })

  it("ignores typing while listening, and saves typed text trimmed", () => {
    const listening = run([
      ...OPENED,
      { type: "micPressed" },
      { type: "textEdited", text: "ignored" },
    ])
    expect(listening.effects).toEqual(["save:", "listen"])
    const typed = run([...OPENED, { type: "textEdited", text: "two words " }])
    expect(typed.effects.at(-1)).toBe("save:two words")
    expect(draftOf(typed.state.composer)).toBe("two words ")
  })

  it("closes from choosing without saving anything", () => {
    const { state, effects } = run([
      { type: "notePressed", anchor: ANCHOR },
      { type: "notePressed", anchor: ANCHOR },
    ])
    expect(effects).toEqual([])
    expect(state.composer.phase).toBe("closed")
  })
})

/** One tap on the microphone, and how the recognizer answers it. */
type Attempt = {
  readonly heard: string
  readonly answer:
    | { readonly kind: "transcribed"; readonly text: string }
    | { readonly kind: "failed"; readonly error: IntentError }
    /** The learner pressed Stop, and the recognizer never answered. */
    | { readonly kind: "unanswered" }
}

const attempt: fc.Arbitrary<Attempt> = fc.record({
  heard: fc.constantFrom("", "half a"),
  answer: fc.oneof(
    fc.record({
      kind: fc.constant("transcribed" as const),
      text: fc.constantFrom("", "the bound grew"),
    }),
    fc.record({
      kind: fc.constant("failed" as const),
      error: fc.record({
        kind: fc.constantFrom(
          "unreachable" as const,
          "rejected" as const,
          "unavailable" as const,
          "unknown" as const
        ),
        retryable: fc.boolean(),
        summary: fc.constantFrom("It broke.", "It is not here."),
        cause: fc.anything(),
      }),
    }),
    fc.constant({ kind: "unanswered" as const })
  ),
})

/** What the learner can see of the panel. */
function screen(state: ComposerState): string {
  return JSON.stringify([
    draftOf(state.composer),
    state.notice,
    state.canListen,
  ])
}

describe("the note composer, for any run of answers from the recognizer", () => {
  it("ends every tap, says every failure, withdraws what cannot work, and never leaves a failed tap looking like nothing happened", () => {
    fc.assert(
      fc.property(fc.array(attempt, { maxLength: 8 }), (attempts) => {
        let { state } = run(OPENED)
        let failuresInARow = 0
        let withdrawn = false
        for (const [index, { heard, answer }] of attempts.entries()) {
          const seq = state.seq + 1
          const before = screen(state)
          const tapped = step(state, { type: "micPressed" })
          if (withdrawn) {
            // Withdrawn stays withdrawn: no tap starts a listen again.
            expect(tapped.effects).toEqual([])
            continue
          }
          const events: Array<ComposerEvent> =
            heard === "" ? [] : [{ type: "heard", seq, heard }]
          if (answer.kind === "transcribed")
            events.push({ type: "transcribed", seq, text: answer.text })
          if (answer.kind === "failed")
            events.push({ type: "listenFailed", seq, error: answer.error })
          if (answer.kind === "unanswered")
            events.push({ type: "micPressed" }, { type: "finishTimedOut", seq })
          state = run(events, tapped.state).state

          // Every tap ends: nothing is left listening or finishing.
          expect(isListening(state.composer), `attempt ${index}`).toBe(false)
          if (answer.kind === "transcribed") {
            failuresInARow = 0
            continue
          }
          failuresInARow += 1
          const retryable =
            answer.kind === "unanswered" || answer.error.retryable
          withdrawn =
            !retryable || failuresInARow >= FAILURES_BEFORE_WITHDRAWING
          // What no tap can fix, or what taps have not fixed, is withdrawn.
          expect(state.canListen).toBe(!withdrawn)
          // A failure with nothing to show for it says what failed.
          if (heard === "" || withdrawn) {
            const summary =
              answer.kind === "failed"
                ? answer.error.summary
                : COMPOSER_NOTICES.noAnswer
            expect(state.notice.startsWith(summary)).toBe(true)
          }
          // The failed tap changed what the learner sees.
          expect(screen(state)).not.toBe(before)
        }
      })
    )
  })
})
