/**
 * The show's one clock (C1182): each scene's copy lands before its cubes
 * turn, each pair is in view for its own episode only, and every track
 * shares one cycle.
 */
import type { ResolvedEpisode } from "@/landing/show"
import {
  EPISODE_TURN_S,
  HOLD_S,
  showTimeline,
  STREAM_CPS,
  TITLE_S,
  tracksOf,
  TURN_S,
} from "@/landing/timeline"
import { describe, expect, it } from "vitest"

const face = (key: string): { key: string; label: string } => ({
  key,
  label: key,
})
const EPISODES: ReadonlyArray<ResolvedEpisode> = (
  ["extensions", "android", "server"] as const
).map((id) => ({
  id,
  kicker: id,
  title: id,
  scenes: [1, 2].map((n) => ({
    title: `${id} ${String(n)}`,
    narration: ["x".repeat(38), "y".repeat(76)],
    draft: false,
    faces: [face(`a${String(n)}`), face(`b${String(n)}`)] as const,
  })),
}))

/** Each keyframe's percentage and its declarations, in order. */
const frames = (keyframes: string): Array<{ at: number; css: string }> =>
  [...keyframes.matchAll(/([\d.]+)% \{ ([^}]*) \}/g)].map((m) => ({
    at: Number(m[1]),
    css: m[2],
  }))

describe("showTimeline", () => {
  const timeline = showTimeline(EPISODES)
  const pct = (s: number): number =>
    Number(((s / timeline.cycleS) * 100).toFixed(3))
  // A scene: its title, then 3 s of copy, the turn, the hold.
  const scene = TITLE_S + 114 / STREAM_CPS + TURN_S + HOLD_S
  const episode = EPISODE_TURN_S + 2 * scene

  it("plays every episode in turn, in one cycle", () => {
    expect(timeline.cycleS).toBeCloseTo(3 * episode, 6)
  })

  it("turns a scene's cubes only once its copy has landed, then types each label", () => {
    const first = timeline.episodes[0]
    const second = EPISODE_TURN_S + scene
    const landed = second + TITLE_S + 114 / STREAM_CPS
    const [lineOne, lineTwo] = first.scenes[1].lines
    expect(
      frames(lineTwo.keyframes).find((f) =>
        f.css.startsWith("clip-path: inset(0 0 0 0)")
      )?.at
    ).toBe(pct(landed))
    expect(frames(lineOne.keyframes)[1].at).toBe(pct(second + TITLE_S))
    for (const cube of first.cubes) {
      const turn = frames(cube.keyframes).find((f) =>
        f.css.includes("ease-in-out")
      )
      expect(turn?.at).toBe(pct(landed))
      expect(
        frames(cube.keyframes).find((f) => f.css.includes("rotateX(90deg)"))?.at
      ).toBe(pct(landed + TURN_S))
    }
    const label = frames(first.scenes[1].labels[0].keyframes)
    expect(label.find((f) => f.css.includes("steps(2, end)"))?.at).toBe(
      pct(landed + TURN_S)
    )
  })

  it("keeps each episode's pair in view for its own episode only", () => {
    timeline.episodes.forEach((e, k) => {
      const shown = frames(e.pair.keyframes).filter((f) =>
        f.css.startsWith("opacity: 1")
      )
      const start = k * episode
      for (const f of shown) {
        if (k === 2 && f.at === 0) continue // the last episode fades as the cycle begins again
        expect(f.at).toBeGreaterThanOrEqual(pct(start))
        expect(f.at).toBeLessThanOrEqual(pct(start + episode))
      }
    })
  })

  it("turns the copy block to each episode as it begins, the cycle wrapping whole", () => {
    const copy = frames(timeline.copy.keyframes)
    expect(copy[0].css).toContain("rotateY(120deg)")
    expect(copy.find((f) => f.at === pct(EPISODE_TURN_S))?.css).toContain(
      "rotateY(0deg)"
    )
    expect(copy.at(-1)?.at).toBe(100)
    expect(copy.at(-1)?.css).toContain("rotateY(-240deg)")
  })

  it("names every track once, and holds each point until the next unless it says how to move", () => {
    const tracks = tracksOf(timeline)
    expect(new Set(tracks.map((t) => t.name)).size).toBe(tracks.length)
    for (const t of tracks)
      for (const f of frames(t.keyframes))
        expect(f.css).toMatch(/animation-timing-function: [^;]+;$/)
  })
})
