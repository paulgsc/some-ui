/**
 * The show's one clock (C1182): each scene's copy lands before its cubes
 * turn, each pair is in view for its own episode only, and every track
 * shares one cycle.
 */
import type { ResolvedEpisode, ResolvedFace } from "@/landing/show"
import {
  copyFaceOf,
  copyScaleAt,
  copyTurnS,
  faceOn,
  HOLD_S,
  QUARTER_TURN_S,
  showTimeline,
  STREAM_CPS,
  TITLE_S,
  tracksOf,
  TURN_S,
} from "@/landing/timeline"
import { describe, expect, it } from "vitest"

const face = (key: string): ResolvedFace => ({
  key,
  label: key,
  slot: "still",
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
    row: null,
  })),
  pool: null,
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
  // Three episodes on the copy cube's four faces: the first turn, which
  // begins the cycle again from the last through the blank face, is two
  // quarters long, the others one (C1424).
  const turnOf = (k: number): number => copyTurnS(k, 3)
  const startOf = (k: number): number =>
    Array.from({ length: k }, (_, j) => turnOf(j) + 2 * scene).reduce(
      (a, b) => a + b,
      0
    )

  it("has each scene's faces up from their turn in until they turn away, the last lingering into the next round (C1422)", () => {
    const scenes = timeline.episodes.flatMap((e) => e.scenes)
    // Every moment of the cycle has exactly two scenes up at most, and
    // the first scene's faces are up once its pair turns in.
    const first = scenes[0]
    expect(first.on[0]).toBeCloseTo(turnOf(0) + TITLE_S + 114 / STREAM_CPS)
    // A scene is up until the next has turned in over it.
    for (const [k, e] of timeline.episodes.entries()) {
      const [a, b] = e.scenes
      expect(a.on[1]).toBeCloseTo(b.on[0] + TURN_S)
      // The episode's last faces stay up while its pair fades.
      const end =
        k === timeline.episodes.length - 1
          ? timeline.cycleS
          : (timeline.episodes[k + 1]?.start ?? 0)
      expect(b.on[1]).toBeCloseTo(end + turnOf((k + 1) % 3) / 2)
    }
    const last = scenes.at(-1)
    const on = `${String(last?.on[0])} ${String(last?.on[1])}`
    // The last episode's last faces are up at the cycle's start too.
    expect(faceOn(on, 0.1, timeline.cycleS)).toBe(true)
    expect(faceOn(on, turnOf(0), timeline.cycleS)).toBe(false)
    expect(faceOn(on, timeline.cycleS - 0.1, timeline.cycleS)).toBe(true)
    // A window the page didn't write is never up.
    expect(faceOn("", 1, timeline.cycleS)).toBe(false)
  })

  it("plays every episode in turn, in one cycle", () => {
    expect(timeline.cycleS).toBeCloseTo(startOf(3), 6)
    expect(timeline.openS).toBe(2 * QUARTER_TURN_S)
  })

  it("turns a scene's cubes only once its copy has landed, then types each label", () => {
    const first = timeline.episodes[0]
    const second = turnOf(0) + scene
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
      const start = startOf(k)
      for (const f of shown) {
        if (k === 2 && f.at === 0) continue // the last episode fades as the cycle begins again
        expect(f.at).toBeGreaterThanOrEqual(pct(start))
        expect(f.at).toBeLessThanOrEqual(pct(startOf(k + 1)))
      }
    })
  })

  it("turns the copy cube to each episode as it begins, a face a quarter turn on, the cycle wrapping whole (C1424)", () => {
    const copy = frames(timeline.copy.keyframes)
    // Three episodes on faces 0, 1 and 2: the show begins again from past
    // the last, through the blank fourth face (-180 and 180 are one angle).
    expect(copy[0].css).toContain("rotateY(180deg)")
    expect(copy.find((f) => f.at === pct(turnOf(0)))?.css).toContain(
      "rotateY(0deg)"
    )
    expect(copy.map((f) => f.css).join(" ")).toContain("rotateY(-90deg)")
    expect(copy.at(-1)?.at).toBe(100)
    expect(copy.at(-1)?.css).toContain("rotateY(-180deg)")
  })

  it("shrinks the copy cube as it turns just enough to stay within its block, and not at all square-on", () => {
    for (const deg of [0, 90, -90, 180, -270])
      expect(copyScaleAt(deg)).toBeCloseTo(1, 6)
    expect(copyScaleAt(45)).toBeCloseTo(0.811, 2)
    expect(copyScaleAt(-135)).toBeCloseTo(0.811, 2)
    for (let deg = -360; deg <= 360; deg += 5) {
      const s = copyScaleAt(deg)
      expect(s).toBeGreaterThan(0.79)
      expect(s).toBeLessThanOrEqual(1)
    }
    // Every frame of the turn carries its scale; at rest it is whole.
    const copy = frames(timeline.copy.keyframes)
    expect(copy.every((f) => /scale\([\d.]+\)/.test(f.css))).toBe(true)
    expect(copy.find((f) => f.at === pct(turnOf(0)))?.css).toContain(
      "scale(1) rotateY(0deg)"
    )
  })

  it("turns the copy cube at one speed: a quarter's time a quarter, the wrap through the blank face included", () => {
    expect([0, 1, 2].map((k) => copyTurnS(k, 3))).toEqual([
      2 * QUARTER_TURN_S,
      QUARTER_TURN_S,
      QUARTER_TURN_S,
    ])
    // Two episodes face each other: every turn is two quarters.
    expect([0, 1].map((k) => copyTurnS(k, 2))).toEqual([
      2 * QUARTER_TURN_S,
      2 * QUARTER_TURN_S,
    ])
    expect([0, 1, 2, 3].map((k) => copyTurnS(k, 4))).toEqual(
      Array.from({ length: 4 }, () => QUARTER_TURN_S)
    )
    // In the keyframes, the wrap's half way is 90 degrees in, and comes at
    // a quarter's time.
    const copy = frames(timeline.copy.keyframes)
    const half = copy.find((f) => f.at === pct(QUARTER_TURN_S))
    expect(half?.css).toContain("rotateY(90deg)")
  })

  it("puts two episodes on facing faces of the copy cube, and more one after another", () => {
    expect([0, 1].map((k) => copyFaceOf(k, 2))).toEqual([0, 2])
    expect([0, 1, 2].map((k) => copyFaceOf(k, 3))).toEqual([0, 1, 2])
    expect([0, 1, 2, 3].map((k) => copyFaceOf(k, 4))).toEqual([0, 1, 2, 3])
    const two = frames(showTimeline(EPISODES.slice(0, 2)).copy.keyframes)
    expect(two.map((f) => f.css).join(" ")).toContain("rotateY(-180deg)")
  })

  it("names every track once, and holds each point until the next unless it says how to move", () => {
    const tracks = tracksOf(timeline)
    expect(new Set(tracks.map((t) => t.name)).size).toBe(tracks.length)
    for (const t of tracks)
      for (const f of frames(t.keyframes))
        expect(f.css).toMatch(/animation-timing-function: [^;]+;$/)
  })

  it("keeps each episode's last copy shown through the copy block's whole turn", () => {
    // A ring of three or more faces turns a face edge-on only near its
    // turn's end, so the copy holds until the turn is done, and the face's
    // hidden back takes it away.
    for (const [k, e] of timeline.episodes.entries()) {
      const block = frames(e.scenes[1].block.keyframes)
      const shownAt = pct(startOf(k) + turnOf(k) + scene)
      const shown = block.find((f) => f.at === shownAt)
      expect(shown?.css, `episode ${String(k)}`).toContain("opacity: 1")
      if (k < 2) {
        // Hidden only as the next episode's first scene shows.
        const hidden = block.at(-2)
        expect(hidden?.at).toBe(pct(startOf(k + 1) + turnOf(k + 1)))
        expect(hidden?.css).toContain("opacity: 0")
      } else {
        // The last: shown to the cycle's end, and on through the turn
        // that begins the next.
        expect(block.at(-1)).toMatchObject({ at: 100 })
        expect(block.at(-1)?.css).toContain("opacity: 1")
        expect(block[0].css).toContain("opacity: 1")
        expect(block[1]).toMatchObject({ at: pct(turnOf(0)) })
        expect(block[1].css).toContain("opacity: 0")
      }
    }
  })

  it("stands each episode's skeletons from when the last pair has gone until its own turns in over them", () => {
    for (const [k, e] of timeline.episodes.entries()) {
      const start = startOf(k)
      const enters = start + turnOf(k) + TITLE_S + 114 / STREAM_CPS
      const skeleton = frames(e.skeleton.keyframes)
      const at = (s: number): string =>
        skeleton.find((f) => f.at === pct(s))?.css ?? ""
      // Hidden until the last episode's pair has gone, halfway through
      // the copy block's turn, then in by the turn's end.
      const lastGone = start + turnOf(k) / 2
      for (const f of skeleton.filter((f) => f.at < pct(lastGone)))
        expect(f.css, `episode ${String(k)}`).toContain("opacity: 0")
      expect(at(lastGone)).toContain("opacity: 0")
      const previous = timeline.episodes.at(k - 1)
      expect(
        frames(previous?.pair.keyframes ?? "").find(
          (f) => f.at === pct(lastGone)
        )?.css
      ).toContain("opacity: 0")
      expect(at(start + turnOf(k))).toContain("opacity: 1")
      expect(at(enters)).toContain("opacity: 1")
      expect(at(enters + TURN_S)).toContain("opacity: 0")
      // The pair comes into view over them in that same second.
      const pair = frames(e.pair.keyframes)
      expect(pair.find((f) => f.at === pct(enters))?.css).toContain(
        "opacity: 0"
      )
      expect(pair.find((f) => f.at === pct(enters + TURN_S))?.css).toContain(
        "opacity: 1"
      )
      // Gone for the rest of the cycle.
      expect(skeleton.at(-1)?.css).toContain("opacity: 0")
    }
  })

  it("fades the last episode's pair as the cycle wraps", () => {
    const last = timeline.episodes[2]
    const pair = frames(last.pair.keyframes)
    expect(pair[0]).toMatchObject({ at: 0 })
    expect(pair[0].css).toContain("opacity: 1")
    expect(pair[1].css).toContain("opacity: 0")
    expect(pair[1].at).toBe(pct(turnOf(0) / 2))
    // Its cubes go back to their first face once out of view.
    for (const cube of last.cubes) {
      const back = frames(cube.keyframes).find(
        (f) => f.at > 0 && f.css.includes("rotateX(0deg)")
      )
      expect(back?.at).toBeGreaterThan(pct(turnOf(0) / 2))
      expect(back?.at).toBeLessThan(pct(turnOf(0)))
    }
  })
})

describe("the dashboard band's plates (C1443)", () => {
  const timeline = showTimeline(EPISODES)
  it("gives each place a plate: shown from its faces' turn in to the next's, the last held round the cycle", () => {
    for (const [k, e] of timeline.episodes.entries()) {
      expect(e.plates).toHaveLength(EPISODES[k]?.scenes.length ?? -1)
      const [first, last] = [e.plates.at(0), e.plates.at(-1)]
      // Before the first place, the cycle opens on the last plate held.
      expect(last?.loop.keyframes).toMatch(/ 0% \{ opacity: 1;/)
      expect(first?.loop.keyframes).toMatch(/ 0% \{ opacity: 0;/)
      // On the page's first round the first shows and the last does not,
      // until the first place's faces turn in.
      expect(first?.intro?.keyframes).toContain("from { opacity: 1; }")
      expect(last?.intro?.keyframes).toContain("from { opacity: 0; }")
      expect(first?.introS).toBe(e.scenes.at(0)?.on[0])
      for (const middle of e.plates.slice(1, -1))
        expect(middle.intro).toBeNull()
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
        // No narration, one long line, or two short ones.
        narration:
          [[], ["z".repeat(400)], ["a line", "another line"]][i % 3] ?? [],
        draft: false,
        faces: [face("a"), face("b")] as const,
        row: null,
      })),
      pool: null,
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
