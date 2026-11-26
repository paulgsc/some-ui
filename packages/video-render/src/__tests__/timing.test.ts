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

  // HOST18 (#3571): joined by `hold`, every scene starts where a cut would
  // start it, and the scene before each join runs on through it.
  it("holds the scene before a join on through it, so no scene moves", () => {
    const scenes = (into: "cut" | "crossfade" | "dip-to-black") =>
      [
        { id: "A", durationMs: 2000, transitionIn: "cut" as const },
        { id: "B", durationMs: 2000, transitionIn: into },
        { id: "C", durationMs: 1000, transitionIn: "dip-to-black" as const },
      ] as const
    const cut = place(scenes("cut"), 30, "hold")
    const held = place(scenes("crossfade"), 30, "hold")
    if (!cut.ok || !held.ok) throw new Error("not placed")
    expect(
      held.value.shots.map((s) => [s.startFrame, s.frames, s.overlapFrames])
    ).toEqual([
      [0, 72, 0],
      [60, 75, 12],
      [120, 30, 15],
    ])
    expect(held.value.shots.map((s) => s.startFrame)).toEqual(
      cut.value.shots.map((s) => s.startFrame)
    )
    expect(held.value.totalFrames).toBe(cut.value.totalFrames)
    expect(shotTimes(held.value.shots, 30).map((t) => t.startMs)).toEqual([
      0, 2000, 4000,
    ])
    // Its half-scene bound is on the scenes as written, not as held.
    expect(
      place(
        [
          { id: "A", durationMs: 800, transitionIn: "cut" },
          { id: "B", durationMs: 2000, transitionIn: "dip-to-black" },
        ],
        30,
        "hold"
      ).ok
    ).toBe(false)
  })
})
