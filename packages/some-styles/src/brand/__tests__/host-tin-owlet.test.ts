/**
 * Tin Bird's loops (HOST3, #3524): each emotion its own loop, the same
 * bytes for the same beat, seed and t, pinned per emotion so a change to a
 * loop's drawing is a change someone made on purpose; the moving parts the
 * cast drawing tucks away; and the wing that points where the beat looks.
 */
import { createHash } from "node:crypto"
import { describe, expect, it } from "vitest"

import { castNodes, type CastNode } from "../cast"
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
  neutral: "dd5eccdbaa0287da",
  curious: "37c574eb525ce526",
  taciturn: "ee4f8de2d2e7cd3b",
  happy: "6e64464f46147e29",
  perplexed: "af7464dcf566b12c",
  anxious: "dc17f90710c17d16",
  frustrated: "84f2f924d5e1bedf",
  angry: "46e52804a8b88a9d",
  ceremonious: "bf6907ee160dafd7",
}

const walk = (nodes: ReadonlyArray<CastNode>): Array<CastNode> =>
  nodes.flatMap((node) => [node, ...walk(node.children ?? [])])

describe("Tin Bird's loops", () => {
  it.each(EMOTIONS)(
    "draws %s as the same bytes for the same beat, seed and t",
    (emotion) => {
      const once = frames(beat(emotion))
      expect(frames(beat(emotion))).toEqual(once)
      expect(sha(once)).toBe(PINNED[emotion])
    }
  )

  it.each(EMOTIONS)("moves through %s's loop", (emotion) => {
    expect(new Set(frames(beat(emotion))).size).toBeGreaterThan(20)
  })

  it("draws every emotion apart from every other at each moment", () => {
    for (const t of [400, 1300, 2300]) {
      const svgs = EMOTIONS.map((e) => hostAt([beat(e)], 7, t, AREA)?.svg)
      expect(new Set(svgs).size).toBe(EMOTIONS.length)
    }
  })

  it("names the tucked moving parts the loops move", () => {
    const parts = walk(castNodes("tin-owlet", (name) => name)).flatMap((n) =>
      typeof n.attrs["data-part"] === "string" ? [n.attrs["data-part"]] : []
    )
    expect(parts).toEqual([
      "figure",
      "wing-left",
      "wing-right",
      "key",
      "tuft-left",
      "tuft-right",
      "eyes",
      "lid-left",
      "low-lid-left",
      "lid-right",
      "low-lid-right",
      "mouth",
      "beak-low",
    ])
  })

  it("points the near wing where the beat looks, over the emotion's own wings", () => {
    const wing = (svg: string, side: string): number => {
      const m = new RegExp(
        `data-part="wing-${side}" transform="rotate\\((-?[\\d.]+)\\)"`
      ).exec(svg)
      return Number(m?.[1])
    }
    // Looking up and to the left: the left wing aims there, near -135°.
    const left = hostSvg(
      beat("happy", { lookAt: { x: 0, y: 0 } }),
      1000,
      7,
      200,
      { x: -Math.SQRT1_2, y: -Math.SQRT1_2 }
    )
    expect(Math.abs(wing(left, "left") + 135)).toBeLessThan(4)
    // Down and to the right: the right wing, near 45°.
    const right = hostSvg(
      beat("neutral", { lookAt: { x: 1, y: 1 } }),
      1000,
      7,
      200,
      { x: Math.SQRT1_2, y: Math.SQRT1_2 }
    )
    expect(Math.abs(wing(right, "right") - 45)).toBeLessThan(4)
    // Given nowhere to look, a neutral Tin Bird keeps both wings folded.
    const still = hostSvg(beat("neutral"), 1000, 7, 200, { x: 0, y: 0 })
    expect(wing(still, "left")).toBe(0)
    expect(wing(still, "right")).toBe(180)
  })
})

describe("a loop's own time", () => {
  it("opens at its beat's start, wherever the beat falls", () => {
    const at = (atMs: number, t: number): string =>
      hostSvg(beat("happy", { atMs }), t, 7, 200, { x: 0, y: 0 })
    // The same moment of the loop, the idle aside: only the hop and wings differ by when the beat began.
    const figure = (svg: string): string =>
      /data-part="figure" transform="([^"]+)"/.exec(svg)?.[1] ?? ""
    expect(figure(at(0, 300))).toBe(figure(at(5000, 5300)))
  })
})
