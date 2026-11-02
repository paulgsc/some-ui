import type { Take } from "@voice-capture/lib/recorder"
import type {
  VoiceNoteEvent,
  VoiceNoteState,
} from "@voice-capture/lib/voice-note"
import { initialVoiceNote, stepVoiceNote } from "@voice-capture/lib/voice-note"
import { describe, expect, it } from "vitest"

const LIMITS = { minMs: 1_000, maxMs: 60_000 }

function take(durationMs: number): Take {
  return { blob: new Blob(["abc"]), mimeType: "audio/webm", durationMs }
}

function run(events: ReadonlyArray<VoiceNoteEvent>): {
  state: VoiceNoteState
  effects: Array<string>
} {
  let state = initialVoiceNote
  const effects: Array<string> = []
  for (const event of events) {
    const next = stepVoiceNote(state, event, LIMITS)
    state = next.state
    effects.push(...next.effects.map((e) => e.type))
  }
  return { state, effects }
}

const recording: ReadonlyArray<VoiceNoteEvent> = [
  { type: "start", atMs: 252_000 },
  { type: "micOpened", at: 1_000 },
]

describe("a voice note", () => {
  it("records from the moment the microphone opens and saves what was said, stamped where it started", () => {
    const { state, effects } = run([
      ...recording,
      { type: "ticked", now: 6_000, level: 0 },
      { type: "stop" },
      { type: "taken", take: take(5_000) },
    ])
    expect(state).toEqual({ kind: "saving" })
    expect(effects).toEqual([
      "openMic",
      "startClock",
      "stopClock",
      "finishTake",
      "save",
    ])
    const saved = stepVoiceNote(
      { kind: "taking", phase: { kind: "finishing" }, atMs: 252_000 },
      { type: "taken", take: take(5_000) },
      LIMITS
    ).effects
    expect(saved).toEqual([{ type: "save", take: take(5_000), atMs: 252_000 }])
  })

  it("keeps nothing from a stray tap", () => {
    expect(
      run([...recording, { type: "stop" }, { type: "taken", take: take(400) }])
        .state
    ).toEqual({ kind: "idle", last: "short" })
  })

  it("keeps a take when the sheet closes mid-sentence", () => {
    expect(run([...recording, { type: "left" }]).state).toEqual({
      kind: "taking",
      phase: { kind: "finishing" },
      atMs: 252_000,
    })
  })

  it("lets go of a microphone still opening when the person leaves, and of one that opens anyway", () => {
    const { state, effects } = run([
      { type: "start", atMs: null },
      { type: "left" },
      { type: "micOpened", at: 0 },
    ])
    expect(state).toEqual({ kind: "idle", last: "early" })
    expect(effects).toEqual(["openMic", "discardTake", "discardTake"])
  })

  it("says why the microphone did not open, and can try again", () => {
    const blocked = run([
      { type: "start", atMs: null },
      { type: "micFailed", reason: "denied" },
    ]).state
    expect(blocked).toEqual({ kind: "blocked", reason: "denied" })
    expect(
      stepVoiceNote(blocked, { type: "start", atMs: null }, LIMITS).state
    ).toMatchObject({
      kind: "taking",
      phase: { kind: "opening" },
    })
  })

  it("reports how the save ended", () => {
    expect(
      stepVoiceNote(
        { kind: "saving" },
        { type: "saved", outcome: "full" },
        LIMITS
      ).state
    ).toEqual({ kind: "idle", last: "full" })
  })
})
