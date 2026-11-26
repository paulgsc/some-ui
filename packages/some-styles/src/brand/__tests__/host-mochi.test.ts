/**
 * The mochi's loops (HOST4, #3525): every emotion and the NFL celebration
 * pinned to their bytes at three moments, each loop opening on its beat's
 * start and repeating, and each one a picture of its own.
 */
import { createHash } from "node:crypto"
import { describe, expect, it } from "vitest"

import { emotionsOf, hostAt, hostSvg, type BeatOf } from "../host"
import { CELEBRATION_S } from "../host-mochi"

const mochi = (over: Partial<BeatOf<"mochi">> = {}): BeatOf<"mochi"> => ({
  atMs: 0,
  character: "mochi",
  emotion: "neutral",
  shot: "medium",
  placement: "center",
  speaking: false,
  ...over,
})

const MOMENTS = [250, 1250, 3000] as const

const draw = (beat: BeatOf<"mochi">, tMs: number): string =>
  hostSvg(beat, tMs, 7, 200, { x: 0, y: 0 })

const digest = (svg: string): string =>
  createHash("sha256").update(svg).digest("hex").slice(0, 16)

const LOOPS = [
  ...emotionsOf("mochi").map((emotion) => ({
    name: emotion,
    beat: mochi({ emotion }),
  })),
  {
    name: "nfl-celebration",
    beat: mochi({ emotion: "happy", animation: "nfl-celebration" }),
  },
] as const

describe("the mochi's loops", () => {
  it.each(LOOPS)("draws $name to the same bytes at each moment", ({ beat }) => {
    expect(MOMENTS.map((t) => digest(draw(beat, t)))).toMatchSnapshot()
  })

  it("draws every emotion, and the celebration, as a picture of its own", () => {
    const at = LOOPS.map(({ beat }) => draw(beat, 1250))
    expect(new Set(at).size).toBe(LOOPS.length)
  })

  it("runs each loop from its beat's start, wherever the beat falls", () => {
    for (const { beat } of LOOPS) {
      expect(draw({ ...beat, atMs: 40_000 }, 41_250)).toBe(draw(beat, 1250))
    }
  })

  it("celebrates in a seamless loop: its end meets its start", () => {
    const beat = mochi({ emotion: "taciturn", animation: "nfl-celebration" })
    // Every number in the celebration's own parts' transforms.
    const pose = (t: number): ReadonlyArray<number> =>
      (
        draw(beat, t).match(
          /data-part="(?:figure|arm-left|arm-right|antenna-left|antenna-right)"[^>]*/g
        ) ?? []
      ).flatMap((part) =>
        [...part.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]))
      )
    const end = pose(CELEBRATION_S * 1000 - 10)
    const start = pose(CELEBRATION_S * 1000 + 10)
    expect(end).toHaveLength(start.length)
    end.forEach((v, i) =>
      expect(Math.abs(v - (start[i] ?? NaN))).toBeLessThan(1)
    )
  })

  it("carries on celebrating through a beat that only moves it", () => {
    const area = { x: 0, y: 0, width: 1920, height: 1080 }
    const celebrating = mochi({
      emotion: "happy",
      animation: "nfl-celebration",
    })
    const own = (svg: string | undefined): ReadonlyArray<string> =>
      svg?.match(/data-part="(?:figure|arm-left|arm-right|football)"[^>]*/g) ??
      []
    const moved = hostAt(
      [celebrating, { ...celebrating, atMs: 2000, placement: "bottom-left" }],
      7,
      2500,
      area
    )
    const still = hostAt([celebrating], 7, 2500, area)
    expect(own(moved?.svg)).toEqual(own(still?.svg))
    expect(own(moved?.svg)).toHaveLength(4)
  })

  it("puts its glints where the celebration has them, whatever the emotion", () => {
    const glint = (emotion: "happy" | "taciturn"): string | undefined =>
      draw(mochi({ emotion, animation: "nfl-celebration" }), 2500).match(
        /data-part="spark-1"[^>]*/
      )?.[0]
    expect(glint("happy")).toBe(glint("taciturn"))
  })

  it("keeps its signs clear until their loop shows them", () => {
    const neutral = draw(mochi(), 1250)
    expect(neutral).toContain('data-part="question" opacity="0"')
    expect(draw(mochi({ emotion: "question" }), 1250)).toMatch(
      /data-part="question" opacity="1"/
    )
    expect(draw(mochi({ emotion: "intuition" }), 1250)).toMatch(
      /data-part="bulb" opacity="1"/
    )
  })

  it("draws no NaN", () => {
    for (const { beat } of LOOPS) {
      for (let t = 0; t < 4000; t += 97) {
        const svg = draw(beat, t)
        expect(svg).not.toMatch(/NaN|Infinity/)
      }
    }
  })
})
