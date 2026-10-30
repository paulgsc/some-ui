import { place, shotTimes } from "@video-render/timing"
import { describe, expect, it } from "vitest"

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
    const { shots, totalFrames } = placed.value
    expect(shots.map((s) => [s.startFrame, s.frames, s.overlapFrames])).toEqual(
      [
        [0, 60, 0],
        [48, 60, 12],
        [108, 30, 0],
      ]
    )
    expect(totalFrames).toBe(138)
    expect(shotTimes(shots, 30)).toEqual([
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

  it("refuses two takes that would meet across a transition", () => {
    const scenes = (lengthMs: number): Parameters<typeof place>[0] => [
      {
        id: "A",
        durationMs: 2000,
        transitionIn: "cut",
        take: { atMs: 200, lengthMs },
      },
      {
        id: "B",
        durationMs: 2000,
        transitionIn: "crossfade",
        take: { atMs: 200, lengthMs: 1000 },
      },
    ]
    // B starts 400 ms early, so its take does at 1800 ms.
    expect(place(scenes(1600), 30).ok).toBe(true)
    const placed = place(scenes(1800), 30)
    expect(placed.ok ? [] : placed.problems).toEqual([
      "A: its take runs into B's",
    ])
  })
})
