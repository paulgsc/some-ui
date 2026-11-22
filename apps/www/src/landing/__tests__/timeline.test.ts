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
    // Whole outside its scene; wiped from the scene's start; streamed from
    // its own start to its end.
    const two = frames(lineTwo.keyframes)
    expect(two.map((f) => f.css.includes("100%"))).toEqual([
      false,
      true,
      true,
      false,
      false,
    ])
    expect(two[1].at).toBe(pct(second))
    expect(two[3].at).toBe(pct(landed))
    expect(frames(lineOne.keyframes)[2].at).toBe(pct(second + TITLE_S))
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

  it("fades the last episode's pair as the cycle wraps, its copy still shown into the turn", () => {
    const last = timeline.episodes[2]
    const pair = frames(last.pair.keyframes)
    expect(pair[0]).toMatchObject({ at: 0 })
    expect(pair[0].css).toContain("opacity: 1")
    expect(pair[1].css).toContain("opacity: 0")
    expect(pair[1].at).toBe(pct(EPISODE_TURN_S / 2))
    const lastBlock = frames(last.scenes[1].block.keyframes)
    expect(lastBlock[0].css).toContain("opacity: 1")
    expect(lastBlock[1].at).toBe(pct(EPISODE_TURN_S / 2))
    // Its cubes go back to their first face once out of view.
    for (const cube of last.cubes) {
      const back = frames(cube.keyframes).find(
        (f) => f.at > 0 && f.css.includes("rotateX(0deg)")
      )
      expect(back?.at).toBeGreaterThan(pct(EPISODE_TURN_S / 2))
      expect(back?.at).toBeLessThan(pct(EPISODE_TURN_S))
    }
  })
})

describe("showTimeline over any shape", () => {
  const episodesOf = (counts: ReadonlyArray<number>): Array<ResolvedEpisode> =>
    counts.map((n, k) => ({
      id: (["extensions", "android", "server"] as const)[k % 3] ?? "server",
      kicker: "k",
      title: "t",
      scenes: Array.from({ length: n }, (_, i) => ({
        title: `s${String(i)}`,
        narration: ["a line", "another line"],
        draft: false,
        faces: [face("a"), face("b")] as const,
      })),
    }))

  it("keeps every track's keyframes in order, none at the same moment", () => {
    for (const counts of [
      [1, 1],
      [4, 4],
      [1, 4, 1],
      [4, 1, 4],
      [2, 2, 2, 2],
    ]) {
      for (const track of tracksOf(showTimeline(episodesOf(counts)))) {
        const at = frames(track.keyframes).map((f) => f.at)
        for (let i = 1; i < at.length; i++)
          expect(
            at[i] ?? 0,
            `${track.name} in ${counts.join(",")}`
          ).toBeGreaterThan(at[i - 1] ?? 0)
      }
    }
  })
})
