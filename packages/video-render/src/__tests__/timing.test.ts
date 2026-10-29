import { fitToTake, place, shotTimes } from "@video-render/timing"
import { describe, expect, it } from "vitest"

describe("fitToTake", () => {
  it("is the take with a breath either side, or the picture's minimum", () => {
    expect(
      fitToTake({ takeMs: 4000, voiceInMs: 200, tailMs: 500, minMs: 0 })
    ).toBe(4700)
    expect(
      fitToTake({ takeMs: 4000, voiceInMs: 200, tailMs: 500, minMs: 6000 })
    ).toBe(6000)
  })
})

describe("place", () => {
  it("overlaps each transition into the scene before, in whole frames", () => {
    const placed = place(
      [
        { id: "A", durationMs: 2000, transitionIn: "cut" },
        { id: "B", cut: "b", durationMs: 2000, transitionIn: "crossfade" },
        { id: "C", durationMs: 1000, transitionIn: "cut" },
      ],
      30
    )
    if (!placed.ok) throw new Error(placed.problems.join("\n"))
    expect(
      placed.shots.map((s) => [s.startFrame, s.frames, s.overlapFrames])
    ).toEqual([
      [0, 60, 0],
      [48, 60, 12],
      [108, 30, 0],
    ])
    expect(placed.totalFrames).toBe(138)
    expect(shotTimes(placed.shots, 30)).toEqual([
      { id: "A", cut: null, startMs: 0, durationMs: 2000 },
      { id: "B", cut: "b", startMs: 1600, durationMs: 2000 },
      { id: "C", cut: null, startMs: 3600, durationMs: 1000 },
    ])
  })

  it("refuses a transition longer than half a scene", () => {
    const placed = place(
      [
        { id: "A", durationMs: 800, transitionIn: "cut" },
        { id: "B", durationMs: 2000, transitionIn: "dip-to-black" },
      ],
      30
    )
    expect(placed.ok ? [] : placed.problems).toEqual([
      "B: the dip-to-black into it is longer than half a scene",
    ])
  })
})
