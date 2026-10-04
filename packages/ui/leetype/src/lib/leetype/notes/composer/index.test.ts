import type { NoteAnchor } from "@leetype/lib/leetype/notes"
import type {
  ComposerEvent,
  ComposerState,
} from "@leetype/lib/leetype/notes/composer"
import {
  COMPOSER_NOTICES,
  draftOf,
  initialComposerState,
  step,
} from "@leetype/lib/leetype/notes/composer"
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
      { type: "listenFailed", seq: 1, reason: "silent" },
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
    expect(done.effects).toEqual(["finishListening"])
    expect(done.state.composer.phase).toBe("noted")
    const landed = run(
      [{ type: "transcribed", seq: 1, text: "last words" }],
      done.state
    )
    expect(landed.effects).toEqual(["save:last words"])
    expect(landed.state.composer.phase).toBe("closed")
  })

  it("closes on a second Done when the transcript never lands, keeping what was heard", () => {
    const { state, effects } = run([
      ...OPENED,
      { type: "micPressed" },
      { type: "heard", seq: 1, heard: "half a thought" },
      { type: "donePressed" },
      { type: "donePressed" },
      { type: "transcribed", seq: 1, text: "too late" },
    ])
    expect(effects).toEqual([
      "save:",
      "listen",
      "finishListening",
      "save:half a thought",
      "cancelListening",
    ])
    expect(state.composer.phase).toBe("closed")
  })

  it("keeps words heard before a failure, and says why when there were none", () => {
    const kept = run([
      ...OPENED,
      { type: "micPressed" },
      { type: "heard", seq: 1, heard: "half a" },
      { type: "listenFailed", seq: 1, reason: "failed" },
    ])
    expect(kept.effects.at(-1)).toBe("save:half a")
    expect(kept.state.notice).toBe("")
    const denied = run([
      ...OPENED,
      { type: "micPressed" },
      { type: "listenFailed", seq: 1, reason: "denied" },
    ])
    expect(denied.state.notice).toBe(COMPOSER_NOTICES.denied)
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

  it("closes on leaving the round, and writes nothing that lands afterwards", () => {
    const { state, effects } = run([
      ...OPENED,
      { type: "micPressed" },
      { type: "roundLeft" },
      { type: "transcribed", seq: 1, text: "too late" },
    ])
    expect(effects).toEqual(["save:", "listen", "cancelListening"])
    expect(state.composer.phase).toBe("closed")
  })

  it("does not listen while hidden, and finishes an utterance on hiding", () => {
    const hidden = run([...OPENED, { type: "hidden" }, { type: "micPressed" }])
    expect(hidden.effects).toEqual(["save:"])
    const midway = run([...OPENED, { type: "micPressed" }, { type: "hidden" }])
    expect(midway.effects.at(-1)).toBe("finishListening")
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
