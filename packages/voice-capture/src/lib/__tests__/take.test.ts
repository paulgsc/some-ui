import type { Take } from "@voice-capture/lib/recorder"
import type { TakePhase } from "@voice-capture/lib/take"
import {
  discardTake,
  finishTake,
  openTake,
  stepTake,
} from "@voice-capture/lib/take"
import { describe, expect, it } from "vitest"

const LIMITS = { minMs: 1_000, maxMs: 60_000 }
const recording: TakePhase = {
  kind: "recording",
  startedAt: 0,
  elapsed: 0,
  level: 0,
}

function take(durationMs: number, bytes = "abc"): Take {
  return { blob: new Blob([bytes]), mimeType: "audio/webm", durationMs }
}

describe("a take", () => {
  it("opens the microphone, then records from when it opened", () => {
    expect(openTake()).toEqual({
      kind: "taking",
      phase: { kind: "opening" },
      effects: [{ type: "openMic" }],
    })
    expect(
      stepTake({ kind: "opening" }, { type: "micOpened", at: 5 }, LIMITS)
    ).toEqual({
      kind: "taking",
      phase: { kind: "recording", startedAt: 5, elapsed: 0, level: 0 },
      effects: [{ type: "startClock" }],
    })
  })

  it("stops itself at the limit, keeping what was said", () => {
    expect(
      stepTake(recording, { type: "ticked", now: 60_000, level: 0.5 }, LIMITS)
    ).toEqual({
      kind: "taking",
      phase: { kind: "finishing" },
      effects: [{ type: "stopClock" }, { type: "finishTake" }],
    })
  })

  it("keeps a take long enough and not empty, and nothing else", () => {
    const finishing: TakePhase = { kind: "finishing" }
    expect(
      stepTake(finishing, { type: "taken", take: take(5_000) }, LIMITS).kind
    ).toBe("kept")
    expect(
      stepTake(finishing, { type: "taken", take: take(999) }, LIMITS).kind
    ).toBe("short")
    expect(
      stepTake(finishing, { type: "taken", take: take(5_000, "") }, LIMITS).kind
    ).toBe("short")
  })

  it("finishes or discards only a take that is recording", () => {
    expect(finishTake({ kind: "opening" })).toMatchObject({ kind: "taking" })
    expect(discardTake(recording)).toEqual({
      kind: "discarded",
      effects: [{ type: "stopClock" }, { type: "discardTake" }],
    })
  })
})
