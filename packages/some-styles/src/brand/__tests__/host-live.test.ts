import { createHash } from "node:crypto"
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
  type HostFrame,
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

/** Words at the given times, each stressed fully, with the notes named. */
const at = (
  ...marks: ReadonlyArray<readonly [number, EmotionOf<"mochi"> | null, number?]>
): ReadonlyArray<SpokenWordOf<"mochi">> =>
  marks.map(([t, emotion, weight]) => ({
    startMs: t,
    endMs: t + 250,
    stress: 1,
    ...(emotion === null ? {} : { notes: [{ emotion, weight: weight ?? 1 }] }),
  }))

/** One emotion fired, faded and fired again past its rest, then another a beat later: seeded times. */
function refiredThenChanged(
  seed: number
): ReadonlyArray<SpokenWordOf<"mochi">> {
  const r = unitIntervalsBySeed(seed + 1000)
  const first = MOCHI[1 + Math.floor(r() * (MOCHI.length - 1))] ?? "happy"
  const other = MOCHI.find((e) => e !== first && e !== "neutral") ?? "curious"
  const a = 4500 + 2000 * r()
  const b = a + EMOTION_REFRACTORY_MS[first] + 50 + 400 * r()
  const c = b + 300 + 1500 * r()
  return at(
    [a, first, 0.6],
    [b, first, 0.5 + 0.2 * r()],
    [c, other, 1],
    [60_000, null]
  )
}

describe("emotion as notes (HOST5, #3526), over generated word streams", () => {
  const streams = [
    ...Array.from({ length: 120 }, (_, seed) =>
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
    ),
    // biased toward the state a uniform stream rarely reaches: an emotion fired
    // again after it faded, then another a moment later (the review's probe)
    ...Array.from({ length: 60 }, (_, seed) => refiredThenChanged(seed)),
  ]

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

  it("measures the dwell from the pulse that last changed what shows (the review's stream)", () => {
    const words = at(
      [5000, "happy", 0.6],
      [11_100, "happy", 0.5],
      [12_200, "curious", 1],
      [60_000, null]
    )
    const pulses = pulsesOf(sceneOf(words))
    expect(pulses.map((p) => [p.atMs, p.emotion])).toEqual([
      [0, "curious"],
      [5000, "happy"],
      [11_100, "happy"],
    ])
  })

  it("owes the floor when the only note is too weak to fire", () => {
    const words = wordsBy(8, 80, 0).map((w) => ({ ...w, stress: 0.2 }))
    const peakAt = 15_000
    const weak: SpokenWordOf<"mochi"> = {
      startMs: 2000,
      endMs: 2300,
      stress: 1,
      notes: [{ emotion: "happy", weight: 0.3 }],
    }
    const scene: NoteScene<"mochi"> = {
      startMs: 0,
      endMs: 31_000,
      intro: "curious",
      words: [
        weak,
        ...words.filter(
          (w) =>
            w.startMs > 2300 &&
            w.startMs < 30_000 &&
            Math.abs(w.startMs - peakAt) > 400
        ),
        { startMs: peakAt, endMs: peakAt + 300, stress: 1 },
      ].sort((a, b) => a.startMs - b.startMs),
    }
    expect(pulsesOf(scene).map((p) => p.atMs)).toEqual([0, peakAt])
  })

  it("owes the floor even when it is the intro's own emotion inside its rest", () => {
    const scene: NoteScene<"mochi"> = {
      startMs: 0,
      endMs: 20_000,
      intro: "angry",
      words: at([3000, null], [8200, null], [12_000, null]).map((w, i) => ({
        ...w,
        stress: i === 1 ? 1 : 0.2,
      })),
    }
    expect(pulsesOf(scene).map((p) => [p.atMs, p.emotion])).toEqual([
      [0, "angry"],
      [8200, "angry"],
    ])
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
              mouths.push(f.live.mouth)
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

describe("a silent listener is never a still sticker (HOST5 review)", () => {
  const listener = (
    who: "mochi" | "tin-owlet",
    shot: (typeof SHOTS)[number],
    placement: (typeof PLACEMENTS)[number]
  ): Beat =>
    who === "mochi"
      ? {
          atMs: 0,
          character: "mochi",
          emotion: "angry",
          shot,
          placement,
          speaking: false,
        }
      : {
          atMs: 0,
          character: "tin-owlet",
          emotion: "perplexed",
          role: "analyst",
          shot,
          placement,
          speaking: false,
        }

  for (const who of ["mochi", "tin-owlet"] as const)
    for (const shot of SHOTS)
      for (const placement of PLACEMENTS)
        it(`${who} ${shot} at ${placement}, saying nothing, never holds a pose for a second`, () => {
          const beat = listener(who, shot, placement)
          const area = AREAS.landscape
          // the body's own motion, under the breath: breathing alone is not living
          const motion = (t: number): string =>
            /transform="([^"]*translate\(48 88\) rotate[^"]*)"/.exec(
              hostAt([beat], 7, t, area)?.svg ?? ""
            )?.[1] ?? ""
          for (let t = 1000; t < 30_000; t += 250) {
            expect(motion(t)).not.toBe("")
            expect(motion(t)).not.toBe(motion(t - 1000))
          }
        })

  it("pulses its sign and lets it fade, rather than holding it the whole beat", () => {
    const f = (t: number): HostFrame | null =>
      hostAt([listener("mochi", "medium", "center")], 7, t, AREAS.landscape)
    expect(f(1500)?.note.emotion).toBe("angry")
    expect(f(1500)?.note.weight).toBe(1)
    expect(f(6000)?.note.emotion).toBeNull()
  })

  it("plays in its silence, now and then, and never while another beat's words run", () => {
    const beat = listener("tin-owlet", "medium", "bottom-right")
    const acts = Array.from(
      { length: 300 },
      (_, k) => hostAt([beat], 7, k * 100, AREAS.landscape)?.live.play
    )
    expect(acts.some((a) => a !== null)).toBe(true)
    expect(acts.filter((a) => a !== null).length).toBeLessThan(acts.length / 2)
  })
})

describe("the bubble's clip (HOST5 review)", () => {
  it("clips every frame the bubble shows in, tightening as it grows, so nothing pops", () => {
    const area = AREAS.landscape
    const beats: ReadonlyArray<Beat> = [
      {
        atMs: 0,
        character: "mochi",
        emotion: "happy",
        shot: "medium",
        placement: "center",
        speaking: false,
      },
      {
        atMs: 2000,
        character: "mochi",
        emotion: "happy",
        shot: "medium",
        placement: "bottom-left",
        speaking: false,
      },
    ]
    let last = Infinity
    for (let t = 2000; t <= 2000 + BEAT_BLEND_MS; t += 10) {
      const f = hostAt(beats, 7, t, area)
      if (f === null || f.bubble <= 0.01) continue
      expect(f.svg).toContain('clip-path="url(#')
      const reach = Number(
        /clipPath[^>]*><path[^>]*scale\(([\d.]+)\)/.exec(f.svg)?.[1]
      )
      expect(reach).toBeLessThanOrEqual(last)
      last = reach
    }
    expect(last).toBe(1)
  })
})

describe("the same bytes for the same inputs (HOST5)", () => {
  it("draws every moment of a living beat the same, twice", () => {
    const area = AREAS.landscape
    const beats: ReadonlyArray<Beat> = [
      speaker(),
      tinSpeaker({ atMs: 25_000, target: { x: 0.5, y: 0.3 } }),
    ]
    const frames = Array.from(
      { length: 121 },
      (_, k) => hostAt(beats, 9, k * 333, area)?.svg ?? ""
    )
    for (const [k, svg] of frames.entries())
      expect(hostAt(beats, 9, k * 333, area)?.svg).toBe(svg)
    // pinned: a new value means the living cast's drawing changed; show it in a preview in the same PR
    expect(
      createHash("sha256").update(frames.join("\n")).digest("hex").slice(0, 16)
    ).toBe("d68c9eb6293cf784")
  })
})
