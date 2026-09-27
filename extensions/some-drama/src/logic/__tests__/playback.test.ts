import { formatTimestamp, livePosition } from "@drama/logic/playback"
import type { SourceReport } from "@drama/types"
import { describe, expect, it } from "vitest"

const report = (over: Partial<SourceReport> = {}): SourceReport => ({
  playback: { videoTime: 600, duration: 3600, episode: "12화" },
  playing: true,
  lastPlayAt: 0,
  advancing: true,
  rate: 1,
  readAt: 1_000_000,
  ...over,
})

describe("livePosition", () => {
  it("moves on from the report while the video advances", () => {
    const p = livePosition(report(), 1_000_000 + 30_000)
    expect(p.videoTime).toBe(630)
    expect(p.timestamp).toBe("10:30")
    expect(p.progress).toBeCloseTo(630 / 3600)
  })

  it("stays at the reported time while paused or stalled", () => {
    expect(
      livePosition(report({ advancing: false }), 1_000_000 + 30_000).videoTime
    ).toBe(600)
  })

  it("runs at the playback rate", () => {
    expect(
      livePosition(report({ rate: 1.5 }), 1_000_000 + 10_000).videoTime
    ).toBe(615)
  })

  it("never runs past the end of the episode", () => {
    const p = livePosition(report(), 1_000_000 + 10_000_000)
    expect(p.videoTime).toBe(3600)
    expect(p.progress).toBe(1)
  })

  it("has no progress while the duration is unknown", () => {
    const pb = { videoTime: 90, duration: null, episode: "" }
    const p = livePosition(report({ playback: pb }), 1_000_000)
    expect(p.progress).toBe(0)
    expect(p.episode).toBe("")
  })

  it("names the episode canonically", () => {
    expect(livePosition(report(), 1_000_000).episode).toBe("Ep 12")
  })
})

describe("formatTimestamp", () => {
  it("adds hours past an hour", () => {
    expect(formatTimestamp(3725)).toBe("1:02:05")
    expect(formatTimestamp(65)).toBe("01:05")
    expect(formatTimestamp(Number.NaN)).toBe("00:00")
  })
})
