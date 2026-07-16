import type { RecordingState } from "@interview/types/interview"
import { afterEach, describe, expect, it, vi } from "vitest"

import { recordingReducer } from "."

// ═══════════════════════════════════════════════════════════════════════════
// Deterministic PRNG (mulberry32) - mirrors the pattern used in
// core/session-reducer.test.ts so the property test below is reproducible.
// ═══════════════════════════════════════════════════════════════════════════
function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * The reducer never reads `stream`/the blob contents - it just carries them
 * through to the next state - so an empty placeholder that satisfies the
 * type is enough, without implementing a real MediaStream/Blob.
 */
function fakeMediaStream(): MediaStream {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- see comment above
  return {} as MediaStream
}
function makeFakeBlob(): Blob {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- see comment above
  return {} as Blob
}

const fakeStream = fakeMediaStream()
const fakeBlob = makeFakeBlob()

describe("recordingReducer", () => {
  describe("START_RECORDING", () => {
    it.each<RecordingState>([
      { type: "idle" },
      { type: "error", error: "boom", canRetry: true },
      { type: "permission_denied", error: "denied" },
    ])("moves %o to requesting_permission", (state) => {
      const result = recordingReducer(state, { type: "START_RECORDING" })
      expect(result).toEqual({ type: "requesting_permission" })
    })

    it.each<RecordingState>([
      { type: "requesting_permission" },
      { type: "recording", startTime: 0 },
      { type: "paused", startTime: 0, elapsedBeforePause: 0 },
      { type: "processing" },
      { type: "success", audioBlob: fakeBlob, audioUrl: "blob:x", duration: 1 },
    ])("no-ops from %o", (state) => {
      const result = recordingReducer(state, { type: "START_RECORDING" })
      expect(result).toBe(state)
    })
  })

  describe("PERMISSION_GRANTED", () => {
    it("moves requesting_permission -> recording, stamping startTime", () => {
      vi.useFakeTimers()
      vi.setSystemTime(1000)
      const result = recordingReducer(
        { type: "requesting_permission" },
        { type: "PERMISSION_GRANTED", stream: fakeStream }
      )
      expect(result).toEqual({ type: "recording", startTime: 1000 })
      vi.useRealTimers()
    })

    it("no-ops outside requesting_permission", () => {
      const state: RecordingState = { type: "idle" }
      const result = recordingReducer(state, {
        type: "PERMISSION_GRANTED",
        stream: fakeStream,
      })
      expect(result).toBe(state)
    })
  })

  describe("PERMISSION_DENIED", () => {
    it("moves requesting_permission -> permission_denied with the error", () => {
      const result = recordingReducer(
        { type: "requesting_permission" },
        { type: "PERMISSION_DENIED", error: "denied by user" }
      )
      expect(result).toEqual({
        type: "permission_denied",
        error: "denied by user",
      })
    })

    it("no-ops outside requesting_permission", () => {
      const state: RecordingState = { type: "recording", startTime: 0 }
      const result = recordingReducer(state, {
        type: "PERMISSION_DENIED",
        error: "denied",
      })
      expect(result).toBe(state)
    })
  })

  describe("PAUSE / RESUME elapsed-time arithmetic", () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    it("PAUSE captures whole-second elapsed time since startTime", () => {
      vi.useFakeTimers()
      vi.setSystemTime(0)
      const state: RecordingState = { type: "recording", startTime: 0 }
      vi.setSystemTime(4500)

      const result = recordingReducer(state, { type: "PAUSE" })
      expect(result).toEqual({
        type: "paused",
        startTime: 0,
        elapsedBeforePause: 4, // floored, not rounded
      })
    })

    it("no-ops outside recording", () => {
      const state: RecordingState = { type: "idle" }
      expect(recordingReducer(state, { type: "PAUSE" })).toBe(state)
    })

    it("RESUME rewinds startTime so elapsed time before pause is preserved", () => {
      vi.useFakeTimers()
      vi.setSystemTime(10_000)
      const state: RecordingState = {
        type: "paused",
        startTime: 0,
        elapsedBeforePause: 7,
      }
      const result = recordingReducer(state, { type: "RESUME" })
      expect(result).toEqual({ type: "recording", startTime: 10_000 - 7_000 })
    })

    it("no-ops outside paused", () => {
      const state: RecordingState = { type: "processing" }
      expect(recordingReducer(state, { type: "RESUME" })).toBe(state)
    })

    it("property: elapsed time accumulates correctly across N pause/resume cycles", () => {
      vi.useFakeTimers()
      vi.setSystemTime(0)

      const rand = mulberry32(0xfeed)
      const randInt = (min: number, max: number): number =>
        Math.floor(rand() * (max - min + 1)) + min

      let state: RecordingState = { type: "recording", startTime: Date.now() }
      let totalElapsedSeconds = 0

      for (let cycle = 0; cycle < 50; cycle++) {
        const advanceSeconds = randInt(1, 30)
        vi.advanceTimersByTime(advanceSeconds * 1000)
        totalElapsedSeconds += advanceSeconds

        state = recordingReducer(state, { type: "PAUSE" })
        expect(state).toEqual({
          type: "paused",
          startTime: expect.any(Number),
          elapsedBeforePause: totalElapsedSeconds,
        })

        state = recordingReducer(state, { type: "RESUME" })
        expect(state.type).toBe("recording")

        // Advancing zero time and pausing immediately again must reproduce
        // the exact same cumulative elapsed count - the round trip is lossless.
        const rePaused = recordingReducer(state, { type: "PAUSE" })
        expect(rePaused).toEqual({
          type: "paused",
          startTime: expect.any(Number),
          elapsedBeforePause: totalElapsedSeconds,
        })
        state = recordingReducer(rePaused, { type: "RESUME" })
      }
    })
  })

  describe("STOP", () => {
    it.each<RecordingState>([
      { type: "recording", startTime: 0 },
      { type: "paused", startTime: 0, elapsedBeforePause: 3 },
    ])("moves %o to processing", (state) => {
      expect(recordingReducer(state, { type: "STOP" })).toEqual({
        type: "processing",
      })
    })

    it("no-ops outside recording/paused", () => {
      const state: RecordingState = { type: "idle" }
      expect(recordingReducer(state, { type: "STOP" })).toBe(state)
    })
  })

  describe("RECORDING_COMPLETE", () => {
    it("moves processing -> success carrying the recorded artifacts", () => {
      const result = recordingReducer(
        { type: "processing" },
        {
          type: "RECORDING_COMPLETE",
          audioBlob: fakeBlob,
          audioUrl: "blob:done",
          duration: 42,
        }
      )
      expect(result).toEqual({
        type: "success",
        audioBlob: fakeBlob,
        audioUrl: "blob:done",
        duration: 42,
      })
    })

    it("no-ops outside processing", () => {
      const state: RecordingState = { type: "recording", startTime: 0 }
      const result = recordingReducer(state, {
        type: "RECORDING_COMPLETE",
        audioBlob: fakeBlob,
        audioUrl: "blob:done",
        duration: 42,
      })
      expect(result).toBe(state)
    })
  })

  describe("ERROR / RESET - unconditional transitions", () => {
    it.each<RecordingState>([
      { type: "idle" },
      { type: "requesting_permission" },
      { type: "recording", startTime: 0 },
      { type: "paused", startTime: 0, elapsedBeforePause: 1 },
      { type: "processing" },
      { type: "success", audioBlob: fakeBlob, audioUrl: "x", duration: 1 },
    ])("ERROR fires from any state (%o), no guard", (state) => {
      const result = recordingReducer(state, {
        type: "ERROR",
        error: "device lost",
        canRetry: false,
      })
      expect(result).toEqual({
        type: "error",
        error: "device lost",
        canRetry: false,
      })
    })

    it.each<RecordingState>([
      { type: "recording", startTime: 0 },
      { type: "success", audioBlob: fakeBlob, audioUrl: "x", duration: 1 },
      { type: "error", error: "e", canRetry: true },
    ])("RESET fires from any state (%o), no guard", (state) => {
      expect(recordingReducer(state, { type: "RESET" })).toEqual({
        type: "idle",
      })
    })
  })

  describe("RETRY", () => {
    it.each<RecordingState>([
      { type: "error", error: "e", canRetry: true },
      { type: "permission_denied", error: "denied" },
    ])("moves %o back to idle", (state) => {
      expect(recordingReducer(state, { type: "RETRY" })).toEqual({
        type: "idle",
      })
    })

    it("no-ops outside error/permission_denied", () => {
      const state: RecordingState = { type: "processing" }
      expect(recordingReducer(state, { type: "RETRY" })).toBe(state)
    })
  })
})
