import type { Take } from "@voice-capture/lib/recorder"
import type {
  VoiceNoteEvent,
  VoiceNoteState,
} from "@voice-capture/lib/voice-note"
import { initialVoiceNote, stepVoiceNote } from "@voice-capture/lib/voice-note"
import { describe, expect, it } from "vitest"

const SOUNDBITE_MAX_MS = 60_000
const LIMITS = { minMs: 1_000, maxMs: SOUNDBITE_MAX_MS }

function take(durationMs: number, bytes = "abc"): Take {
  return { blob: new Blob([bytes]), mimeType: "audio/webm", durationMs }
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

describe("a voice reflection", () => {
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

  it("keeps nothing from a stray tap, or from a take that came back empty", () => {
    expect(
      run([...recording, { type: "stop" }, { type: "taken", take: take(400) }])
        .state
    ).toEqual({ kind: "idle", last: "short" })
    expect(
      run([
        ...recording,
        { type: "stop" },
        { type: "taken", take: take(5_000, "") },
      ]).state
    ).toEqual({ kind: "idle", last: "short" })
  })

  it("stops itself at the limit and keeps it", () => {
    const { state, effects } = run([
      ...recording,
      { type: "ticked", now: 1_000 + SOUNDBITE_MAX_MS, level: 0 },
    ])
    expect(state).toMatchObject({
      kind: "taking",
      phase: { kind: "finishing" },
    })
    expect(effects.slice(-2)).toEqual(["stopClock", "finishTake"])
  })

  it("keeps a take when the sheet closes mid-sentence", () => {
    expect(run([...recording, { type: "left" }]).state).toEqual({
      kind: "taking",
      phase: { kind: "finishing" },
      atMs: 252_000,
    })
  })

  it("discards a microphone that opens after the person left", () => {
    const { state, effects } = run([
      { type: "start", atMs: null },
      { type: "left" },
      { type: "micOpened", at: 0 },
    ])
    expect(state).toEqual({ kind: "idle", last: null })
    expect(effects).toEqual(["openMic", "discardTake"])
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
