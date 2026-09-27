import { pickSource } from "@drama/logic/source"
import type { SourceReport } from "@drama/types"
import { describe, expect, it } from "vitest"

const report = (
  videoTime: number,
  playing: boolean,
  lastPlayAt: number
): SourceReport => ({
  playback: { videoTime, duration: 3600, episode: "12" },
  playing,
  lastPlayAt,
})

describe("pickSource", () => {
  it("is null when no source tab answered", () => {
    expect(pickSource([])).toBeNull()
  })

  it("prefers a playing video over a paused one that played later", () => {
    const picked = pickSource([report(10, false, 900), report(20, true, 100)])
    expect(picked?.videoTime).toBe(20)
  })

  it("between two playing tabs, takes the one that started last", () => {
    const picked = pickSource([report(10, true, 500), report(20, true, 100)])
    expect(picked?.videoTime).toBe(10)
  })

  it("falls back to the paused tab that played last — a beat while paused keeps its time", () => {
    const picked = pickSource([report(10, false, 100), report(20, false, 500)])
    expect(picked?.videoTime).toBe(20)
  })
})
