import { unitIntervalsBySeed } from "@some-ui/core-utils"
import { describe, expect, it } from "vitest"

import {
  BEAT_BLEND_MS,
  EMOTIONS,
  hostAt,
  PLACEMENTS,
  SHOTS,
  type Area,
  type Beat,
  type BeatOf,
  type EmotionOf,
  type HostCharacter,
} from "../host"
import {
  EMOTION_REFRACTORY_MS,
  livenessAt,
  NOTES_POLICY,
  pointAt,
  pulsesOf,
  type NoteScene,
  type SpokenWordOf,
} from "../host-live"

/** The two frames a host is drawn over, above their captions. */
const AREAS = {
  landscape: { x: 96, y: 86, width: 1728, height: 614 },
  portrait: { x: 60, y: 160, width: 960, height: 1090 },
} as const satisfies Readonly<Record<string, Area>>

/** A stream of `n` words from `fromMs`, seeded: each 150-450 ms, with pauses, stresses and, if asked, notes. */
function wordsBy<C extends HostCharacter = "mochi">(
  seed: number,
  n: number,
  fromMs: number,
  notes: (i: number, r: () => number) => SpokenWordOf<C>["notes"] = () =>
    undefined
): ReadonlyArray<SpokenWordOf<C>> {
  const r = unitIntervalsBySeed(seed)
  const out: Array<SpokenWordOf<C>> = []
  let t = fromMs + 300
  for (let i = 0; i < n; i++) {
    const len = 150 + 300 * r()
    const stress = r()
    const ns = notes(i, r)
    out.push({
      startMs: t,
      endMs: t + len,
      stress,
      ...(ns === undefined ? {} : { notes: ns }),
    })
    t += len + (r() < 0.15 ? 600 + 900 * r() : 60 * r())
  }
  return out
}

const MOCHI = EMOTIONS.mochi
const sceneOf = (
  words: ReadonlyArray<SpokenWordOf<"mochi">>,
  intro: EmotionOf<"mochi"> = "curious"
): NoteScene<"mochi"> => ({
  startMs: 0,
  endMs: (words.at(-1)?.endMs ?? 0) + 1000,
  intro,
  words,
})

describe("emotion as notes (HOST5, #3526), over generated word streams", () => {
  const streams = Array.from({ length: 120 }, (_, seed) =>
    wordsBy(seed, 40 + (seed % 7) * 30, 0, (i, r) =>
      r() < 0.12
        ? [
            {
              emotion: MOCHI[Math.floor(r() * MOCHI.length)] ?? "happy",
              weight: 0.4 + 0.6 * r(),
            },
          ]
        : undefined
    )
  )

  it("never changes the emotion showing inside the dwell", () => {
    for (const words of streams) {
      const pulses = pulsesOf(sceneOf(words))
      for (let i = 1; i < pulses.length; i++) {
        const [a, b] = [pulses[i - 1], pulses[i]]
        if (a !== undefined && b !== undefined && a.emotion !== b.emotion)
          expect(b.atMs - a.atMs).toBeGreaterThanOrEqual(NOTES_POLICY.dwellMs)
      }
    }
  })

  it("never pulses an emotion again inside its refractory time", () => {
    for (const words of streams) {
      const last = new Map<string, number>()
      for (const p of pulsesOf(sceneOf(words))) {
        const before = last.get(p.emotion)
        if (before !== undefined)
          expect(p.atMs - before).toBeGreaterThanOrEqual(
            EMOTION_REFRACTORY_MS[p.emotion]
          )
        last.set(p.emotion, p.atMs)
      }
    }
  })

  it("keeps under the ceiling, even when every word carries a different emotion", () => {
    const extreme = wordsBy(99, 400, 0, (i) => [
      { emotion: MOCHI[i % MOCHI.length] ?? "happy", weight: 1 },
    ])
    for (const words of [...streams, extreme]) {
      const scene = sceneOf(words)
      const most =
        1 +
        Math.floor(
          ((scene.endMs - scene.startMs) / 60_000) * NOTES_POLICY.perMinute
        )
      expect(pulsesOf(scene).length).toBeLessThanOrEqual(most)
    }
  })

  it("gives a long scene with a stress peak and no note one note mid-scene (the floor)", () => {
    const words = wordsBy(5, 120, 0).map((w, i) =>
      i === 60 ? { ...w, stress: 1 } : { ...w, stress: 0.2 }
    )
    const scene = sceneOf(words)
    expect(scene.endMs).toBeGreaterThan(NOTES_POLICY.floorSceneMs)
    const pulses = pulsesOf(scene)
    expect(pulses).toHaveLength(2)
    expect(pulses[1]?.atMs).toBe(words[60]?.startMs)
  })

  it("shows only its intro when it has no notes and no stress peak", () => {
    const words = wordsBy(6, 120, 0).map((w) => ({ ...w, stress: 0.1 }))
    expect(pulsesOf(sceneOf(words, "happy"))).toEqual([
      { atMs: 0, emotion: "happy", weight: 1 },
    ])
  })
})

describe("attention: a point only toward a target, on a cue (HOST5)", () => {
  it("never raises a point without a target, and never without a cue word", () => {
    const words = wordsBy(3, 80, 0).map((w, i) =>
      i % 9 === 0 ? { ...w, cue: true } : w
    )
    const plain = wordsBy(3, 80, 0)
    for (let t = 0; t < 30_000; t += 50) {
      expect(pointAt(words, false, t)).toBe(0)
      expect(pointAt(plain, true, t)).toBe(0)
    }
    expect(
      Math.max(
        ...Array.from({ length: 600 }, (_, k) => pointAt(words, true, k * 50))
      )
    ).toBeGreaterThan(0.9)
  })

  it("turns Tin Bird's wing toward a target up and to its right", () => {
    const words = wordsBy<"tin-owlet">(3, 80, 0).map((w, i) =>
      i === 20 ? { ...w, cue: true } : w
    )
    const peak = Array.from({ length: 600 }, (_, k) => k * 50).reduce(
      (best, t) =>
        pointAt(words, true, t) > pointAt(words, true, best) ? t : best,
      0
    )
    const beat = tinSpeaker({
      placement: "bottom-left",
      words,
      target: { x: 0.95, y: 0.05 },
    })
    const svg = hostAt([beat], 7, peak, AREAS.landscape)?.svg ?? ""
    const wing = /data-part="wing-right"[^>]*transform="([^"]*)"/.exec(svg)
    const turns = [...(wing?.[1] ?? "").matchAll(/rotate\((-?[\d.]+)/g)]
    const total = turns.reduce((sum, m) => sum + Number(m[1]), 0)
    const facing = ((((total + 180) % 360) + 360) % 360) - 180
    expect(facing).toBeGreaterThan(-90)
    expect(facing).toBeLessThan(0)
  })
})

describe("play only in a pause (HOST5)", () => {
  it("never plays while a word is being said", () => {
    const words = [0, 1000, 2000].map((at) => ({
      startMs: at,
      endMs: at + 200,
    }))
    for (let seed = 0; seed < 50; seed++)
      for (let t = 1000; t < 1200; t += 20) {
        expect(livenessAt("tin-owlet", words, seed, t).play).toBeNull()
        expect(livenessAt("mochi", words, seed, t).play).toBeNull()
      }
  })
})

const speaker = (over: Partial<BeatOf<"mochi">> = {}): BeatOf<"mochi"> => ({
  atMs: 0,
  character: "mochi",
  emotion: "intuition",
  shot: "medium",
  placement: "bottom-left",
  speaking: true,
  words: wordsBy(11, 60, 0, (i) =>
    i === 30 ? [{ emotion: "happy", weight: 1 }] : undefined
  ),
  ...over,
})

const tinSpeaker = (
  over: Partial<BeatOf<"tin-owlet">> = {}
): BeatOf<"tin-owlet"> => ({
  atMs: 0,
  character: "tin-owlet",
  emotion: "curious",
  shot: "medium",
  placement: "bottom-right",
  speaking: true,
  role: "analyst",
  words: wordsBy<"tin-owlet">(12, 60, 0),
  ...over,
})

const figures = (svg: string): number =>
  (svg.match(/data-part="figure"/g) ?? []).length

describe("the living cast, over every shot × placement × frame (HOST5)", () => {
  for (const [aspect, area] of Object.entries(AREAS))
    for (const shot of SHOTS)
      for (const placement of PLACEMENTS)
        for (const who of ["mochi", "tin-owlet"] as const)
          it(`${who} ${shot} at ${placement} in ${aspect}: speaks, never stills, keeps its bubble to a corner`, () => {
            const beat: Beat =
              who === "mochi"
                ? speaker({ shot, placement })
                : tinSpeaker({ shot, placement })
            const end = beat.words?.at(-1)?.endMs ?? 0
            const mouths: Array<number> = []
            for (let t = 0; t < end; t += 100) {
              const f = hostAt([beat], 7, t, area)
              if (f === null) throw new Error("no frame")
              mouths.push(f.live?.mouth ?? 0)
              // no bubble away from a corner, and none on a close-up (C1548)
              if (shot === "close-up" || placement === "center")
                expect(f.bubble).toBe(0)
              else expect(f.bubble).toBe(1)
              // inside its area, which stops above the captions
              expect(f.box.x).toBeGreaterThanOrEqual(area.x - 1e-9)
              expect(f.box.y + f.box.height).toBeLessThanOrEqual(
                area.y + area.height + 1e-9
              )
              expect(figures(f.svg)).toBe(1)
              if (t >= 1000)
                expect(f.svg).not.toBe(hostAt([beat], 7, t - 1000, area)?.svg)
            }
            expect(Math.max(...mouths) - Math.min(...mouths)).toBeGreaterThan(
              0.5
            )
          })
})

describe("one drawing from two poses (#3564)", () => {
  const mochi = (
    emotion: EmotionOf<"mochi">,
    atMs: number,
    over: Partial<BeatOf<"mochi">> = {}
  ): BeatOf<"mochi"> => ({
    atMs,
    character: "mochi",
    emotion,
    shot: "medium",
    placement: "center",
    speaking: false,
    ...over,
  })
  const area = AREAS.landscape

  it("blends angry into happy over the blend, never snapping, and draws one body", () => {
    const beats = [mochi("angry", 0), mochi("happy", 2000)]
    const before = hostAt(beats, 7, 1999, area)?.svg ?? ""
    const mid = hostAt(beats, 7, 2000 + BEAT_BLEND_MS / 2, area)?.svg ?? ""
    const after = hostAt(beats, 7, 2000 + BEAT_BLEND_MS + 400, area)?.svg ?? ""
    expect(mid).not.toBe(before)
    expect(mid).not.toBe(after)
    expect(figures(mid)).toBe(1)
    // the vein is fading, neither gone nor whole
    const vein = /data-part="vein"[^>]*opacity="([\d.]+)"/.exec(mid)
    if (vein !== null) expect(Number(vein[1])).toBeLessThan(1)
  })

  it("blends a paint as a colour, never as a broken number", () => {
    const beats = [mochi("angry", 0), mochi("happy", 2000)]
    for (let t = 2000; t < 2000 + BEAT_BLEND_MS; t += 25) {
      const svg = hostAt(beats, 7, t, area)?.svg ?? ""
      for (const [, paint] of svg.matchAll(/"(#[^"]*)"/g))
        expect(paint).toMatch(/^#[\da-f]{3}(?:[\da-f]{3})?$/i)
    }
    const living = speaker({ placement: "center", emotion: "happy" })
    for (let t = 0; t < 1500; t += 25)
      for (const [, paint] of (
        hostAt([living], 7, t, area)?.svg ?? ""
      ).matchAll(/"(#[^"]*)"/g))
        expect(paint).toMatch(/^#[\da-f]{3}(?:[\da-f]{3})?$/i)
  })

  it("keeps a ceremony's run when only the emotion under it changes", () => {
    const arms = (svg: string): string =>
      /data-part="arm-left"[^>]*>/.exec(svg)?.[0] ?? ""
    const changed = [
      mochi("happy", 0, { animation: "nfl-celebration" }),
      mochi("curious", 2000, { animation: "nfl-celebration" }),
    ]
    const kept = [mochi("happy", 0, { animation: "nfl-celebration" })]
    for (const t of [2000, 2400, 2800])
      expect(arms(hostAt(changed, 7, t + BEAT_BLEND_MS, area)?.svg ?? "")).toBe(
        arms(hostAt(kept, 7, t + BEAT_BLEND_MS, area)?.svg ?? "")
      )
  })

  it("blends a note in and out over its calm self in one drawing", () => {
    const beat = speaker({ placement: "center" })
    for (let t = 0; t < 6000; t += 50)
      expect(figures(hostAt([beat], 7, t, area)?.svg ?? "")).toBe(1)
  })
})

describe("the same bytes for the same inputs (HOST5)", () => {
  it("draws every moment of a living beat the same, twice", () => {
    const area = AREAS.landscape
    const beats: ReadonlyArray<Beat> = [
      speaker(),
      tinSpeaker({ atMs: 25_000, target: { x: 0.5, y: 0.3 } }),
    ]
    for (let t = 0; t < 40_000; t += 333)
      expect(hostAt(beats, 9, t, area)?.svg).toBe(
        hostAt(beats, 9, t, area)?.svg
      )
  })
})
