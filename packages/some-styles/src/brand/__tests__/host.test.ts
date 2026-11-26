/**
 * The living cast (HOST1, #3522): the closed unions keyed by character, the
 * placement over an area (C1485), and the deterministic contract, the same
 * beat, seed and t giving the same SVG bytes.
 */
import { describe, expect, it } from "vitest"

import {
  EMOTIONS,
  HOST_CHARACTERS,
  hostAt,
  hostSvg,
  idleAt,
  placedBox,
  PLACEMENTS,
  SHARED_EMOTIONS,
  SHOTS,
  type Area,
  type Beat,
  type BeatOf,
} from "../host"

const LANDSCAPE_SAFE: Area = { x: 96, y: 86, width: 1728, height: 864 }

const tin = (over: Partial<BeatOf<"tin-owlet">> = {}): Beat => ({
  atMs: 0,
  character: "tin-owlet",
  emotion: "neutral",
  shot: "long",
  placement: "bottom-right",
  speaking: false,
  ...over,
})

const inside = (inner: Area, outer: Area): boolean =>
  inner.x >= outer.x - 1e-9 &&
  inner.y >= outer.y - 1e-9 &&
  inner.x + inner.width <= outer.x + outer.width + 1e-9 &&
  inner.y + inner.height <= outer.y + outer.height + 1e-9

describe("the host's closed unions", () => {
  it("give both characters the shared emotions, and Mochi its own beats after them", () => {
    expect(EMOTIONS["tin-owlet"]).toEqual(SHARED_EMOTIONS)
    expect(EMOTIONS.mochi).toEqual([
      ...SHARED_EMOTIONS,
      "question",
      "confusion",
      "issue",
      "intuition",
      "hesitation",
    ])
    expect(SHARED_EMOTIONS).toEqual(
      expect.arrayContaining([
        "anxious",
        "frustrated",
        "angry",
        "ceremonious",
        "happy",
        "perplexed",
      ])
    )
  })

  it("refuse, in the type, an emotion or ceremony that isn't the character's", () => {
    const mochi: Beat = {
      atMs: 0,
      character: "mochi",
      emotion: "hesitation",
      animation: "nfl-celebration",
      shot: "close-up",
      placement: "center",
      speaking: true,
    }
    // @ts-expect-error: a hesitation is Mochi's own beat, not Tin Bird's
    const wrong: Beat = { ...tin(), emotion: "hesitation" }
    // @ts-expect-error: Tin Bird has no ceremony yet
    const ceremony: Beat = { ...tin(), animation: "nfl-celebration" }
    expect([mochi, wrong, ceremony]).toHaveLength(3)
  })
})

describe("where the host sits (C1485)", () => {
  it.each(SHOTS.flatMap((shot) => PLACEMENTS.map((p) => [shot, p] as const)))(
    "keeps a %s at %s inside its area",
    (shot, placement) => {
      expect(
        inside(placedBox(LANDSCAPE_SAFE, shot, placement), LANDSCAPE_SAFE)
      ).toBe(true)
    }
  )

  it("sits flush in its corner, and grows from long to medium to close-up", () => {
    expect(placedBox(LANDSCAPE_SAFE, "long", "bottom-right")).toEqual({
      x: 96 + 1728 - 864 * 0.37,
      y: 86 + 864 - 864 * 0.37,
      width: 864 * 0.37,
      height: 864 * 0.37,
    })
    const sizes = SHOTS.map((s) => placedBox(LANDSCAPE_SAFE, s, "center").width)
    expect(sizes).toEqual([...sizes].sort((a, b) => b - a))
  })

  it("arrives at a new beat over 380 ms when the character stays, and cuts when it changes", () => {
    const beats: ReadonlyArray<Beat> = [
      tin(),
      tin({ atMs: 1000, placement: "top-left", opacity: 0.4 }),
      {
        atMs: 2000,
        character: "mochi",
        emotion: "question",
        shot: "medium",
        placement: "bottom-left",
        speaking: true,
      },
    ]
    const at = (t: number): ReturnType<typeof hostAt> =>
      hostAt(beats, 7, t, LANDSCAPE_SAFE)
    const corner = placedBox(LANDSCAPE_SAFE, "long", "top-left")
    expect(at(1000)?.box).toEqual(
      placedBox(LANDSCAPE_SAFE, "long", "bottom-right")
    )
    expect(at(1190)?.box.x).toBeGreaterThan(corner.x)
    expect(at(1380)?.box).toEqual(corner)
    expect(at(1380)?.opacity).toBeCloseTo(0.4)
    expect(at(2000)?.box).toEqual(
      placedBox(LANDSCAPE_SAFE, "medium", "bottom-left")
    )
    expect(at(2000)?.beat.character).toBe("mochi")
    expect(at(2000)?.opacity).toBe(1)
  })

  it("starts an interrupted arrival from what was on screen, never jumping", () => {
    const beats: ReadonlyArray<Beat> = [
      tin(),
      tin({ atMs: 1000, placement: "top-left", opacity: 0 }),
      tin({ atMs: 1100, placement: "bottom-left", opacity: 1 }),
    ]
    const just = hostAt(beats, 7, 1099, LANDSCAPE_SAFE)
    const then = hostAt(beats, 7, 1100, LANDSCAPE_SAFE)
    // One millisecond's motion, at most: the old start jumped about 1250 px.
    const moved = Math.hypot(
      (then?.box.x ?? NaN) - (just?.box.x ?? NaN),
      (then?.box.y ?? NaN) - (just?.box.y ?? NaN)
    )
    expect(moved).toBeLessThan(10)
    expect(
      Math.abs((then?.opacity ?? NaN) - (just?.opacity ?? NaN))
    ).toBeLessThan(0.01)
    expect(hostAt(beats, 7, 1480, LANDSCAPE_SAFE)?.box).toEqual(
      placedBox(LANDSCAPE_SAFE, "long", "bottom-left")
    )
  })

  it("draws nothing without beats, or before the first", () => {
    expect(hostAt([], 7, 0, LANDSCAPE_SAFE)).toBeNull()
    expect(hostAt([tin({ atMs: 3000 })], 7, 2999, LANDSCAPE_SAFE)).toBeNull()
    expect(
      hostAt([tin({ atMs: 3000 })], 7, 3000, LANDSCAPE_SAFE)
    ).not.toBeNull()
  })
})

describe("the deterministic contract", () => {
  const beats: ReadonlyArray<Beat> = [
    tin({ speaking: true }),
    tin({ atMs: 4000, lookAt: { x: 0.1, y: 0.1 } }),
  ]
  const times = Array.from({ length: 60 }, (_, i) => i * 167)

  it("gives the same SVG bytes for the same beats, seed and t", () => {
    for (const t of times) {
      expect(hostAt(beats, 7, t, LANDSCAPE_SAFE)).toEqual(
        hostAt(beats, 7, t, LANDSCAPE_SAFE)
      )
    }
  })

  it("is alive: the drawing moves over time, and another seed moves it otherwise", () => {
    const svgs = new Set(
      times.map((t) => hostAt(beats, 7, t, LANDSCAPE_SAFE)?.svg)
    )
    expect(svgs.size).toBeGreaterThan(times.length / 2)
    const other = times.map((t) => hostAt(beats, 8, t, LANDSCAPE_SAFE)?.svg)
    expect(other).not.toEqual(
      times.map((t) => hostAt(beats, 7, t, LANDSCAPE_SAFE)?.svg)
    )
  })

  it("blinks now and then, each blink brief", () => {
    const closed = Array.from(
      { length: 3000 },
      (_, i) => idleAt(7, i * 10).blink
    )
    const shut = closed.filter((b) => b > 0.5).length
    expect(shut).toBeGreaterThan(0)
    expect(shut / closed.length).toBeLessThan(0.1)
  })

  it("looks where a beat is given to look, whatever its idle glance", () => {
    const frame = hostAt(beats, 7, 5000, LANDSCAPE_SAFE)
    expect(frame?.svg).toMatch(
      /data-part="eyes" transform="translate\(-[\d.]+ -[\d.]+\)/
    )
  })

  it("draws both characters with their eyes and Tin Bird's key moved, and no `-0`", () => {
    for (const character of HOST_CHARACTERS) {
      const svg = hostSvg(
        character === "mochi"
          ? {
              atMs: 0,
              character,
              emotion: "issue",
              shot: "long",
              placement: "bottom-right",
              speaking: false,
            }
          : tin(),
        1234,
        7,
        200,
        { x: 0.3, y: -0.2 }
      )
      expect(svg).toMatch(
        /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="0 0 96 96" width="200" height="200">/
      )
      expect(svg).toContain('data-part="eyes" transform=')
      expect(svg).not.toMatch(/[ (]-0[ )]/)
      if (character === "tin-owlet")
        expect(svg).toContain('data-part="key" transform=')
    }
  })
})
