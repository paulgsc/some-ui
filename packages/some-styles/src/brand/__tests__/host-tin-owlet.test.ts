/** Tin Bird's loops (HOST3, #3524). */
import { createHash } from "node:crypto"
import { describe, expect, it } from "vitest"

import {
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
 * drawing changed: update it with the contact sheet in the same PR.
 */
const PINNED: Readonly<Record<EmotionOf<"tin-owlet">, string>> = {
  neutral: "06f5e84d0714aa15",
  curious: "ebb2878aeca659e3",
  taciturn: "0ea69db7bd7910c4",
  happy: "3673c39de2058c73",
  perplexed: "b073ef20e56d8193",
  anxious: "1e9c12ed876f7fb7",
  frustrated: "a145bba03b81db98",
  angry: "63157596e1821596",
  ceremonious: "e221c4bf8b64908f",
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
})
