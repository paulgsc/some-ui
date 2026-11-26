/** Tin Bird's loops (HOST3, #3524). */
import { createHash } from "node:crypto"
import { describe, expect, it } from "vitest"

import {
  BEAT_BLEND_MS,
  emotionsOf,
  hostAt,
  hostSvg,
  type Area,
  type Beat,
  type BeatOf,
  type EmotionOf,
} from "../host"

const AREA: Area = { x: 96, y: 86, width: 1728, height: 864 }

const beat = (
  emotion: EmotionOf<"tin-owlet">,
  over: Partial<Omit<BeatOf<"tin-owlet">, "emotion">> = {}
): BeatOf<"tin-owlet"> => ({
  atMs: 0,
  character: "tin-owlet",
  emotion,
  shot: "medium",
  placement: "bottom-right",
  speaking: false,
  // the floor alone: no bubble around it (C1548)
  frame: "none",
  ...over,
})

const EMOTIONS = emotionsOf("tin-owlet")

/** A loop's frames: four seconds at ten a second. */
const frames = (b: Beat): ReadonlyArray<string> =>
  Array.from({ length: 40 }, (_, i) => hostAt([b], 7, i * 100, AREA)?.svg ?? "")

const sha = (svgs: ReadonlyArray<string>): string =>
  createHash("sha256").update(svgs.join("\n")).digest("hex").slice(0, 16)

/**
 * Each emotion's four seconds, hashed. A new value here means the loop's
 * drawing, or the idle or placement it rides on, changed: update it with
 * the contact sheet in the same PR.
 */
const PINNED: Readonly<Record<EmotionOf<"tin-owlet">, string>> = {
  neutral: "cb90bdce768296ce",
  curious: "3a3e6aba7cdba240",
  taciturn: "4366f015bd550cd4",
  happy: "4144a50318e0d878",
  perplexed: "0607b7c3634aed17",
  anxious: "e7f45d8662d69dc2",
  frustrated: "857e3281d48fd873",
  angry: "eae3c25f673cd2b2",
  ceremonious: "481fe7e380df3847",
  hungry: "68cb63dd21ef0810",
}

describe("Tin Bird's loops", () => {
  it.each(EMOTIONS)(
    "draws %s as the same bytes for the same beat, seed and t",
    (emotion) => {
      expect(sha(frames(beat(emotion)))).toBe(PINNED[emotion])
    }
  )

  it("draws every emotion apart from every other at each moment", () => {
    for (const t of [400, 1300, 2300]) {
      const svgs = EMOTIONS.map((e) => hostAt([beat(e)], 7, t, AREA)?.svg)
      expect(new Set(svgs).size).toBe(EMOTIONS.length)
    }
  })

  it("points the near wing where the beat looks (up-left, down-right), and folds both given nowhere", () => {
    const wing = (svg: string, side: string): number => {
      const m = new RegExp(
        `data-part="wing-${side}" transform="rotate\\((-?[\\d.]+)\\)"`
      ).exec(svg)
      return Number(m?.[1])
    }
    const left = hostSvg(
      beat("happy", { lookAt: { x: 0, y: 0 } }),
      1000,
      7,
      200,
      { x: -Math.SQRT1_2, y: -Math.SQRT1_2 }
    )
    expect(Math.abs(wing(left, "left") + 135)).toBeLessThan(4)
    const right = hostSvg(
      beat("neutral", { lookAt: { x: 1, y: 1 } }),
      1000,
      7,
      200,
      { x: Math.SQRT1_2, y: Math.SQRT1_2 }
    )
    expect(Math.abs(wing(right, "right") - 45)).toBeLessThan(4)
    const still = hostSvg(beat("neutral"), 1000, 7, 200, { x: 0, y: 0 })
    expect(wing(still, "left")).toBe(0)
    expect(wing(still, "right")).toBe(180)
  })
})

describe("a loop's own time", () => {
  it("opens at its beat's start, wherever the beat falls", () => {
    const at = (atMs: number, t: number): string =>
      hostSvg(beat("happy", { atMs }), t, 7, 200, { x: 0, y: 0 })
    const figure = (svg: string): string =>
      /data-part="figure" transform="([^"]+)"/.exec(svg)?.[1] ?? ""
    expect(figure(at(0, 300))).toBe(figure(at(5000, 5300)))
  })

  it("carries on through a beat that keeps the emotion, and restarts at one that changes it", () => {
    const figure = (svg: string | undefined): string =>
      /data-part="figure" transform="([^"]+)"/.exec(svg ?? "")?.[1] ?? ""
    const at = (beats: ReadonlyArray<Beat>, t: number): string =>
      figure(hostAt(beats, 7, t, AREA)?.svg)
    const happy = beat("happy")
    const moved = beat("happy", { atMs: 1700, placement: "top-left" })
    const angry = beat("angry", { atMs: 1700 })
    expect(at([happy, moved], 2000)).toBe(at([happy], 2000))
    // a change of emotion blends over BEAT_BLEND_MS (#3564), then the new run is its own
    expect(
      at(
        [happy, angry, beat("happy", { atMs: 3000 })],
        3000 + BEAT_BLEND_MS + 300
      )
    ).toBe(at([happy], BEAT_BLEND_MS + 300))
  })
})
