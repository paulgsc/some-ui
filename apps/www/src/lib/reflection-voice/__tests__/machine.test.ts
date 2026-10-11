import { SOUNDBITE_MAX_MS } from "@some-ui/soundbites/contract"
import type { Take } from "@some-ui/voice-capture"
import { describe, expect, it } from "vitest"

import type { VoiceEvent, VoiceState } from "@/lib/reflection-voice/machine"
import { initialVoice, step } from "@/lib/reflection-voice/machine"

function take(durationMs: number): Take {
  return { blob: new Blob(["a"]), mimeType: "audio/webm", durationMs }
}

function run(events: ReadonlyArray<VoiceEvent>): {
  state: VoiceState
  effects: Array<string>
} {
  let state = initialVoice
  const effects: Array<string> = []
  for (const event of events) {
    const next = step(state, event)
    state = next.state
    effects.push(...next.effects.map((e) => e.type))
  }
  return { state, effects }
}

describe("a voice reflection", () => {
  it("records from the moment the microphone opens and saves what was said, stamped where it started", () => {
    const { state, effects } = run([
      { type: "start", atMs: 252_000 },
      { type: "micOpened", at: 1_000 },
      { type: "ticked", now: 6_000 },
      { type: "stop", now: 6_100 },
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
    const save = step(
      { kind: "finishing", atMs: 252_000 },
      { type: "taken", take: take(5_000) }
    ).effects[0]
    expect(save).toMatchObject({ type: "save", atMs: 252_000 })
  })

  it("lets a stray tap go", () => {
    const { state, effects } = run([
      { type: "start", atMs: null },
      { type: "micOpened", at: 1_000 },
      { type: "ticked", now: 1_400 },
      { type: "stop", now: 1_500 },
    ])
    expect(state).toEqual({ kind: "idle", last: "short" })
    expect(effects.slice(-2)).toEqual(["stopClock", "discardTake"])
  })

  it("stops itself at the limit and keeps it", () => {
    const { state, effects } = run([
      { type: "start", atMs: null },
      { type: "micOpened", at: 0 },
      { type: "ticked", now: SOUNDBITE_MAX_MS },
    ])
    expect(state).toEqual({ kind: "finishing", atMs: null })
    expect(effects.slice(-2)).toEqual(["stopClock", "finishTake"])
  })

  it("keeps a take when the sheet closes mid-sentence, even a short one", () => {
    const { state } = run([
      { type: "start", atMs: 10 },
      { type: "micOpened", at: 0 },
      { type: "ticked", now: 3_000 },
      { type: "left" },
    ])
    expect(state).toEqual({ kind: "finishing", atMs: 10 })
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
    expect(step(blocked, { type: "start", atMs: null }).state.kind).toBe(
      "opening"
    )
  })

  it("reports how the save ended", () => {
    expect(
      step({ kind: "saving" }, { type: "saved", outcome: "full" }).state
    ).toEqual({ kind: "idle", last: "full" })
  })
})
