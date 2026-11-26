/**
 * HOST12 (#3554): the owner's takes, conditioned. The screener's family, by
 * dimension: a record button's click at the start, the end, both or
 * neither; a word starting within 100 ms of an edge, voiced or with a
 * broadband (fricative) onset, right after a click or with none; the same
 * take quieter, so the threshold is the speaking level's; a floor above
 * the bound or under it. Then the gaps, a turn's span against its words,
 * the captions through the cut, the WAV read by its chunks, and the ffmpeg
 * step's bytes.
 */
import { createHash } from "node:crypto"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { TimedWord } from "@video-render/cut-list"
import { nodePorts } from "@video-render/node"
import {
  conditionTake,
  DEFAULT_CONDITIONING,
  framesOf,
  joinsOf,
  keptStretches,
  retimed,
  samePath,
  screenEdges,
  spanOf,
  spanProblems,
  TAKE_POLICY,
} from "@video-render/owner-takes"
import type { Stretch } from "@video-render/owner-takes"
import { samplesOf, wavMs } from "@video-render/wav"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

const RATE = 48_000

/** A deterministic hiss: a small LCG's noise at `amp`. */
function hiss(n: number, amp: number, seed = 7): Float32Array {
  const out = new Float32Array(n)
  let x = seed
  for (let i = 0; i < n; i++) {
    x = (x * 1103515245 + 12345) % 2147483648
    out[i] = ((x / 2147483648) * 2 - 1) * amp
  }
  return out
}

type Piece =
  | { readonly kind: "word"; readonly fromMs: number; readonly toMs: number }
  | { readonly kind: "click"; readonly fromMs: number; readonly toMs: number }
  | {
      readonly kind: "fricative"
      readonly fromMs: number
      readonly toMs: number
    }
  /** A breath: quiet broadband noise, well under the voice and over the hiss. */
  | { readonly kind: "breath"; readonly fromMs: number; readonly toMs: number }

const at = (ms: number): number => Math.round((ms * RATE) / 1000)

/** A take `ms` long: hiss under it, and each piece laid on it. */
function takeOf(
  ms: number,
  pieces: ReadonlyArray<Piece>,
  { scale = 1, hissAmp = 0.001 } = {}
): Float32Array {
  const out = hiss(at(ms), hissAmp)
  for (const p of pieces) {
    const from = at(p.fromMs)
    const to = at(p.toMs)
    const burst = hiss(
      to - from,
      p.kind === "breath" ? 0.008 : 0.6,
      p.fromMs + 1
    )
    for (let i = from; i < to && i < out.length; i++) {
      const t = (i - from) / RATE
      const ramp = Math.min(1, (i - from) / at(5), (to - i) / at(5))
      const voice =
        0.3 *
        ramp *
        (Math.sin(2 * Math.PI * 150 * t) +
          0.5 * Math.sin(2 * Math.PI * 300 * t) +
          0.25 * Math.sin(2 * Math.PI * 450 * t))
      out[i] =
        (out[i] ?? 0) + (p.kind === "word" ? voice : (burst[i - from] ?? 0))
    }
  }
  return scale === 1 ? out : out.map((x) => x * scale)
}

const screened = (samples: Float32Array): ReturnType<typeof screenEdges> =>
  screenEdges(framesOf(samples, RATE))

const within = (inner: Stretch, outer: Stretch): boolean =>
  inner.fromMs >= outer.fromMs && inner.toMs <= outer.toMs

const meets = (a: Stretch, b: Stretch): boolean =>
  a.fromMs < b.toMs && b.fromMs < a.toMs

describe("screenEdges (HOST12)", () => {
  const words: ReadonlyArray<Piece> = [
    { kind: "word", fromMs: 400, toMs: 1400 },
    { kind: "word", fromMs: 1900, toMs: 2600 },
  ]
  const startClick: Piece = { kind: "click", fromMs: 20, toMs: 25 }
  const endClick: Piece = { kind: "click", fromMs: 2950, toMs: 2955 }
  const cases: ReadonlyArray<{
    readonly name: string
    readonly pieces: ReadonlyArray<Piece>
    readonly clicks: readonly [boolean, boolean]
  }> = [
    { name: "neither", pieces: words, clicks: [false, false] },
    {
      name: "a click at the start",
      pieces: [startClick, ...words],
      clicks: [true, false],
    },
    {
      name: "a click at the end",
      pieces: [...words, endClick],
      clicks: [false, true],
    },
    {
      name: "both",
      pieces: [startClick, ...words, endClick],
      clicks: [true, true],
    },
  ]

  it.each(cases)(
    "finds the clicks by shape, and keeps every word: $name",
    ({ pieces, clicks }) => {
      const s = screened(takeOf(3_000, pieces))
      expect([s.clicks.start !== null, s.clicks.end !== null]).toEqual(clicks)
      for (const p of pieces) {
        if (p.kind === "word") expect(within(p, s.kept)).toBe(true)
        else expect(meets(p, s.kept)).toBe(false)
      }
      // The hiss before the first word is gone: the turn starts within 0.1 s of it.
      expect(400 - s.kept.fromMs).toBeLessThanOrEqual(100)
      expect(s.kept.toMs - 2600).toBeLessThanOrEqual(TAKE_POLICY.tailMs + 10)
      expect(s.noisy).toBe(false)
    }
  )

  it.each([
    {
      name: "a voiced word at 40 ms",
      pieces: [{ kind: "word", fromMs: 40, toMs: 900 }],
    },
    {
      name: "a word at 70 ms, after a click",
      pieces: [
        { kind: "click", fromMs: 0, toMs: 5 },
        { kind: "word", fromMs: 70, toMs: 900 },
      ],
    },
    {
      name: "a word at 30 ms with a broadband onset, as an s is",
      pieces: [
        { kind: "fricative", fromMs: 30, toMs: 55 },
        { kind: "word", fromMs: 55, toMs: 900 },
      ],
    },
  ] satisfies ReadonlyArray<{ name: string; pieces: ReadonlyArray<Piece> }>)(
    "never clips a word that starts within 100 ms of the edge: $name",
    ({ pieces }) => {
      const s = screened(takeOf(1_200, pieces))
      const first = pieces.find((p) => p.kind !== "click")
      if (first === undefined) throw new Error("no word")
      expect(s.kept.fromMs).toBeLessThanOrEqual(first.fromMs)
      expect(s.clicks.start === null).toBe(pieces[0]?.kind !== "click")
    }
  )

  it("takes its threshold from the speaking level: the same take quieter is cut the same", () => {
    const pieces = [startClick, ...words, endClick]
    const loud = screened(takeOf(3_000, pieces))
    const quiet = screened(takeOf(3_000, pieces, { scale: 0.05 }))
    expect(quiet.kept).toEqual(loud.kept)
    expect(quiet.clicks).toEqual(loud.clicks)
    expect(quiet.speakingDb).toBeLessThan(loud.speakingDb - 20)
  })

  it("measures the speaking level by the words alone: a short answer in a long, hissing take", () => {
    // 500 ms said in ten seconds: under a tenth of the take is speech.
    const word: Piece = { kind: "word", fromMs: 4_000, toMs: 4_500 }
    const s = screened(takeOf(10_000, [word]))
    expect(s.speakingDb).toBeGreaterThan(-30)
    expect(within(word, s.kept)).toBe(true)
    expect(s.kept.fromMs).toBeGreaterThanOrEqual(3_900)
    expect(s.kept.toMs).toBeLessThanOrEqual(4_500 + TAKE_POLICY.tailMs + 10)
    expect(s.floorDb).toBeLessThan(TAKE_POLICY.noiseFloorMostDb)
    expect(s.floorDb).toBeGreaterThan(-120)
  })

  it("flags a take whose silences are above the floor, never failing it", () => {
    const noisy = screened(takeOf(3_000, words, { hissAmp: 0.008 }))
    expect(noisy.noisy).toBe(true)
    expect(noisy.floorDb).toBeGreaterThan(TAKE_POLICY.noiseFloorMostDb)
    const clean = screened(takeOf(3_000, words))
    expect(clean.floorDb).toBeLessThan(TAKE_POLICY.noiseFloorMostDb)
  })
})

describe("keptStretches (HOST12)", () => {
  it("shortens each long silence to the gap cap from its middle, every join in silence", () => {
    const pieces: ReadonlyArray<Piece> = [
      { kind: "word", fromMs: 300, toMs: 900 },
      { kind: "word", fromMs: 2_000, toMs: 2_400 },
      { kind: "word", fromMs: 2_550, toMs: 3_000 },
    ]
    const s = screened(takeOf(3_400, pieces))
    const kept = keptStretches(s)
    // The 1100 ms silence is cut to 280; the 150 ms one is kept whole.
    const joins = joinsOf(kept)
    expect(joins).toHaveLength(1)
    const [join] = joins
    if (join === undefined) throw new Error("no join")
    expect(join.fromMs - 900).toBeGreaterThanOrEqual(
      TAKE_POLICY.gapMostMs / 2 - 10
    )
    expect(2_000 - join.toMs).toBeGreaterThanOrEqual(
      TAKE_POLICY.gapMostMs / 2 - 10
    )
    for (const p of pieces) expect(kept.some((k) => within(p, k))).toBe(true)
    // Every join's two sides are silence, by the screener's own frames.
    const f = TAKE_POLICY.frameMs
    for (const j of joins)
      for (const ms of [j.fromMs - f, j.toMs])
        expect(s.voiced[Math.floor(ms / f)]).toBe(false)
  })

  it("places the words on the cut, sped-up audio", () => {
    const kept: ReadonlyArray<Stretch> = [
      { fromMs: 100, toMs: 1_100 },
      { fromMs: 2_000, toMs: 3_000 },
    ]
    const words: ReadonlyArray<TimedWord> = [
      { text: "One", startMs: 200, endMs: 500 },
      { text: "two.", startMs: 2_100, endMs: 2_400 },
    ]
    expect(retimed(words, kept, 2)).toEqual([
      { text: "One", startMs: 50, endMs: 200 },
      { text: "two.", startMs: 550, endMs: 700 },
    ])
  })

  it("never drops a word: an edge in cut silence is drawn to the nearest kept edge", () => {
    // The review's probe: a transcript's padded start before the first
    // voiced frame, and a sentence's end padded into a long pause.
    const kept: ReadonlyArray<Stretch> = [
      { fromMs: 340, toMs: 1_540 },
      { fromMs: 2_400, toMs: 3_000 },
    ]
    const words: ReadonlyArray<TimedWord> = [
      { text: "Well,", startMs: 200, endMs: 700 },
      { text: "done.", startMs: 1_200, endMs: 1_900 },
      { text: "ok", startMs: 2_500, endMs: 2_800 },
    ]
    expect(retimed(words, kept, 1)).toEqual([
      { text: "Well,", startMs: 0, endMs: 360 },
      { text: "done.", startMs: 860, endMs: 1_200 },
      { text: "ok", startMs: 1_300, endMs: 1_600 },
    ])
  })
})

describe("retimed captions (HOST12)", () => {
  it("shows a word drawn to nothing for a moment at its edge, never over the next, never past the end", () => {
    // The review's probe: "um" and "uh" wholly inside a cut, and a word
    // past the take's end.
    const kept: ReadonlyArray<Stretch> = [
      { fromMs: 0, toMs: 1_000 },
      { fromMs: 2_000, toMs: 2_500 },
    ]
    const words: ReadonlyArray<TimedWord> = [
      { text: "So", startMs: 100, endMs: 900 },
      { text: "um", startMs: 1_200, endMs: 1_400 },
      { text: "uh", startMs: 1_500, endMs: 1_700 },
      { text: "then", startMs: 2_000, endMs: 2_300 },
      { text: "bye", startMs: 2_600, endMs: 2_800 },
    ]
    const out = retimed(words, kept, 1)
    expect(out.map((w) => w.text)).toEqual(words.map((w) => w.text))
    for (const w of out)
      expect(w.endMs - w.startMs).toBeGreaterThanOrEqual(
        TAKE_POLICY.captionLeastMs
      )
    for (const [i, w] of out.slice(1).entries())
      expect(w.startMs).toBeGreaterThanOrEqual(out[i]?.endMs ?? 0)
    expect(out.at(-1)?.endMs).toBe(1_500)
  })
})

describe("breaths (HOST12)", () => {
  const f = TAKE_POLICY.frameMs
  /** Whether the breath's frames are all kept, or all cut, never split. */
  const whole = (
    kept: ReadonlyArray<Stretch>,
    breath: Stretch
  ): "kept" | "cut" | "split" => {
    const ins: Array<boolean> = []
    for (let ms = breath.fromMs + f; ms < breath.toMs - f; ms += f)
      ins.push(kept.some((k) => ms >= k.fromMs && ms < k.toMs))
    return ins.every(Boolean) ? "kept" : ins.some(Boolean) ? "split" : "cut"
  }

  it.each([
    // Across where the cut would end, 120 ms before the voice: kept whole,
    // the cut drawn back off it, never nearer the voice than half the cap.
    {
      name: "across the cut's end, near the next word",
      breath: { fromMs: 1_700, toMs: 1_980 },
      is: "kept",
    },
    // The inhale right before the next word: kept whole.
    {
      name: "just before the voice",
      breath: { fromMs: 1_850, toMs: 2_090 },
      is: "kept",
    },
    // A soft tail starting right after a word: kept whole.
    {
      name: "just after the voice",
      breath: { fromMs: 910, toMs: 1_100 },
      is: "kept",
    },
    // The review's probe: a quiet run 50 ms after a word's end, across
    // where the cut would start: kept whole, the release with it.
    {
      name: "across the cut's start, after a word",
      breath: { fromMs: 950, toMs: 1_100 },
      is: "kept",
    },
    // Wholly inside the cut: it goes with the silence.
    {
      name: "wholly inside a long pause",
      breath: { fromMs: 1_300, toMs: 1_600 },
      is: "cut",
    },
  ] as const)("keeps or drops a breath whole: $name", ({ breath, is }) => {
    const pieces: ReadonlyArray<Piece> = [
      { kind: "word", fromMs: 300, toMs: 900 },
      { kind: "breath", ...breath },
      { kind: "word", fromMs: 2_100, toMs: 2_700 },
    ]
    const s = screened(takeOf(3_000, pieces))
    // The breath is read as one: quiet, over the floor, under the voice.
    const frames = s.breath.slice(breath.fromMs / f + 2, breath.toMs / f - 2)
    expect(frames.every(Boolean)).toBe(true)
    const kept = keptStretches(s)
    expect(whole(kept, breath)).toBe(is)
    // No cut edge falls nearer the voice than half the gap cap.
    for (const j of joinsOf(kept)) {
      expect(j.fromMs - 900).toBeGreaterThanOrEqual(TAKE_POLICY.gapMostMs / 2)
      expect(2_100 - j.toMs).toBeGreaterThanOrEqual(TAKE_POLICY.gapMostMs / 2)
    }
  })
})

describe("a turn's span in a long take (TAKE1, #3582)", () => {
  // The take's real words, each with silence after it; the transcript's
  // times for them are loose, as a transcriber's are.
  const REAL: ReadonlyArray<Stretch> = [
    { fromMs: 300, toMs: 700 },
    { fromMs: 900, toMs: 1_300 },
    { fromMs: 1_500, toMs: 1_900 },
    { fromMs: 2_100, toMs: 2_500 },
  ]
  const TEXTS = ["The", "third.", "The", "fourth."]
  /**
   * The transcript's times for the real words, their boundaries related as
   * a transcriber emits them: abutting inside the first word's audio (the
   * owner's m4: the boundary is the next word's start, and the audio runs
   * past it), overlapping, or with a gap.
   */
  const RELATIONS = {
    abut: (a: Stretch, _b: Stretch) => ({
      end: a.toMs - 50,
      start: a.toMs - 50,
    }),
    overlap: (a: Stretch, _b: Stretch) => ({
      end: a.toMs - 20,
      start: a.toMs - 80,
    }),
    gap: (a: Stretch, b: Stretch) => ({
      end: a.toMs - 100,
      start: b.fromMs + 100,
    }),
  } as const
  const wordsOf = (
    relation: keyof typeof RELATIONS
  ): ReadonlyArray<TimedWord> =>
    REAL.map((w, i) => {
      const before = REAL[i - 1]
      const after = REAL[i + 1]
      return {
        text: TEXTS[i] ?? "",
        startMs:
          before === undefined
            ? w.fromMs
            : RELATIONS[relation](before, w).start,
        endMs: after === undefined ? w.toMs : RELATIONS[relation](w, after).end,
      }
    })
  const pieces: ReadonlyArray<Piece> = REAL.map((w) => ({ kind: "word", ...w }))
  /** Whether `ms` is in the waveform's silence: neither voice nor breath. */
  const silentAt = (s: ReturnType<typeof screened>, ms: number): boolean => {
    const i = Math.floor(ms / TAKE_POLICY.frameMs)
    return s.voiced[i] === false && s.breath[i] === false
  }

  const family = (["abut", "overlap", "gap"] as const).flatMap((relation) =>
    [1, 0.05].flatMap((scale) =>
      [1, 2, 3].map((split) => ({ relation, scale, split }))
    )
  )

  it.each(family)(
    "cuts every edge in the waveform's silence: $relation, at $scale, split after word $split",
    ({ relation, scale, split }) => {
      const s = screened(takeOf(2_800, pieces, { scale }))
      const words = wordsOf(relation)
      const a = spanOf(s, words, 0, split - 1)
      const b = spanOf(s, words, split, words.length - 1)
      if (!a.ok || !b.ok) throw new Error("no span")
      expect(a.value.toMs).toBeLessThanOrEqual(b.value.fromMs)
      expect(silentAt(s, a.value.toMs)).toBe(true)
      expect(silentAt(s, b.value.fromMs)).toBe(true)
      // Every real word wholly in one turn: none cut, none spilling over.
      REAL.forEach((w, i) =>
        expect(within(w, i < split ? a.value : b.value)).toBe(true)
      )
      expect([
        ...spanProblems(
          { id: "a", text: TEXTS.slice(0, split).join(" ") },
          s,
          words,
          a.value
        ),
        ...spanProblems(
          { id: "b", text: TEXTS.slice(split).join(" ") },
          s,
          words,
          b.value
        ),
      ]).toEqual([])
    }
  )

  it("never cuts at the transcript's time: the old midpoint lands in the word", () => {
    const s = screened(takeOf(2_800, pieces))
    const [first, second] = wordsOf("abut")
    if (first === undefined || second === undefined) throw new Error("no words")
    // The owner's m4: the transcript's boundary is inside the first word.
    expect(silentAt(s, (first.endMs + second.startMs) / 2)).toBe(false)
  })

  it("finds the silence 400 ms from the transcript's boundary", () => {
    // The owner's m2: the transcript's times off the voice by about 0.4 s.
    const real: ReadonlyArray<Stretch> = [
      { fromMs: 300, toMs: 1_100 },
      { fromMs: 1_300, toMs: 2_100 },
    ]
    const s = screened(
      takeOf(
        2_500,
        real.map((w) => ({ kind: "word" as const, ...w }))
      )
    )
    const words: ReadonlyArray<TimedWord> = [
      { text: "Late", startMs: 300, endMs: 1_600 },
      { text: "boundary.", startMs: 1_600, endMs: 2_100 },
    ]
    const a = spanOf(s, words, 0, 0)
    const b = spanOf(s, words, 1, 1)
    if (!a.ok || !b.ok) throw new Error("no span")
    expect(silentAt(s, a.value.toMs)).toBe(true)
    expect(within(real[0]!, a.value)).toBe(true)
    expect(within(real[1]!, b.value)).toBe(true)
  })

  it("holds a span cut in silence to its words, the transcript 0.45 s off at both edges", () => {
    const real: ReadonlyArray<Stretch> = [
      { fromMs: 300, toMs: 700 },
      { fromMs: 1_000, toMs: 1_400 },
      { fromMs: 1_500, toMs: 1_900 },
      { fromMs: 2_200, toMs: 2_600 },
    ]
    const s = screened(
      takeOf(
        2_900,
        real.map((w) => ({ kind: "word" as const, ...w }))
      )
    )
    // Each edge of the middle turn in the silence before and after it; the
    // transcript late by up to 0.45 s, so "two" has its middle past the
    // turn's end.
    const span: Stretch = { fromMs: 850, toMs: 2_050 }
    const words: ReadonlyArray<TimedWord> = [
      { text: "Zero", startMs: 300, endMs: 1_150 },
      { text: "one", startMs: 1_150, endMs: 2_000 },
      { text: "two.", startMs: 2_000, endMs: 2_350 },
      { text: "Three", startMs: 2_350, endMs: 2_600 },
    ]
    expect(silentAt(s, span.fromMs) && silentAt(s, span.toMs)).toBe(true)
    expect(spanProblems({ id: "b", text: "One two." }, s, words, span)).toEqual(
      []
    )
    // A word said well inside the turn can't be left out of its text.
    expect(
      spanProblems({ id: "b", text: "Two." }, s, words, span)
    ).toHaveLength(1)
  })

  it("keeps a breath between two words whole, on one side of the edge", () => {
    const real: ReadonlyArray<Stretch> = [
      { fromMs: 300, toMs: 900 },
      { fromMs: 1_800, toMs: 2_200 },
    ]
    const breath: Stretch = { fromMs: 1_450, toMs: 1_600 }
    const s = screened(
      takeOf(2_600, [
        { kind: "word", ...real[0]! },
        { kind: "breath", ...breath },
        { kind: "word", ...real[1]! },
      ])
    )
    const words: ReadonlyArray<TimedWord> = [
      { text: "One", startMs: 300, endMs: 1_500 },
      { text: "two.", startMs: 1_500, endMs: 2_200 },
    ]
    const a = spanOf(s, words, 0, 0)
    if (!a.ok) throw new Error(a.problems.join("\n"))
    expect(silentAt(s, a.value.toMs)).toBe(true)
    expect(a.value.toMs <= breath.fromMs || a.value.toMs >= breath.toMs).toBe(
      true
    )
  })

  it("refuses words that run together, naming them, rather than cut one", () => {
    const s = screened(
      takeOf(2_000, [
        { kind: "word", fromMs: 300, toMs: 900 },
        { kind: "word", fromMs: 900, toMs: 1_500 },
      ])
    )
    const words: ReadonlyArray<TimedWord> = [
      { text: "Run", startMs: 300, endMs: 900 },
      { text: "together.", startMs: 900, endMs: 1_500 },
    ]
    expect(spanOf(s, words, 0, 0)).toEqual({
      ok: false,
      problems: [
        '"Run" and "together." run together near 900 ms: no silence to cut the turn in',
      ],
    })
    expect(spanOf(s, words, 1, 0).ok).toBe(false)
  })

  it("names a sentence moved into the wrong turn, and an edge in the voice", () => {
    const s = screened(takeOf(2_800, pieces))
    const words = wordsOf("gap")
    expect(
      spanProblems({ id: "o3", text: "The third." }, s, words, {
        fromMs: 0,
        toMs: 2_700,
      })
    ).toEqual([
      'o3: its span says "the third the fourth", and the turn "the third"',
    ])
    expect(
      spanProblems({ id: "o4", text: "The fourth." }, s, words, {
        fromMs: 1_700,
        toMs: 2_700,
      })
    ).toEqual(["o4: its span's edge at 1700 ms is in the voice or a breath"])
  })
})

/** A 16-bit mono WAV of `samples`, its sizes 0xFFFFFFFF as a stream writes them when `streamed`. */
function wavOf(samples: Float32Array, streamed = false): Uint8Array {
  const data = samples.length * 2
  const out = new Uint8Array(44 + data)
  const view = new DataView(out.buffer)
  const ascii = (o: number, s: string): void => {
    for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i))
  }
  ascii(0, "RIFF")
  view.setUint32(4, streamed ? 0xffffffff : 36 + data, true)
  ascii(8, "WAVE")
  ascii(12, "fmt ")
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, RATE, true)
  view.setUint32(28, RATE * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  ascii(36, "data")
  view.setUint32(40, streamed ? 0xffffffff : data, true)
  samples.forEach((x, i) =>
    view.setInt16(
      44 + i * 2,
      Math.max(-32768, Math.min(32767, Math.round(x * 32767))),
      true
    )
  )
  return out
}

describe("a take's WAV, read by its chunks", () => {
  it("measures a streamed WAV by what it holds, never by its header's 0xFFFFFFFF", () => {
    const samples = takeOf(1_000, [{ kind: "word", fromMs: 100, toMs: 900 }])
    for (const streamed of [false, true]) {
      const wav = wavOf(samples, streamed)
      expect(wavMs(wav)).toBe(1_000)
      expect(samplesOf(wav)?.samples.length).toBe(samples.length)
    }
  })
})

describe("conditionTake (HOST12)", () => {
  let root = ""
  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), "owner-takes-"))
  })
  afterAll(async () => {
    if (root) await rm(root, { recursive: true, force: true })
  })

  it("never writes over the take it conditions", async () => {
    const wav = wavOf(takeOf(1_000, [{ kind: "word", fromMs: 100, toMs: 900 }]))
    const ports = nodePorts(root)
    for (const out of [
      "take.wav",
      "./take.wav",
      "work/../take.wav",
      `${root}/take.wav`,
    ]) {
      const done = await conditionTake(
        ports,
        { file: "take.wav", wav },
        DEFAULT_CONDITIONING,
        "work",
        out,
        root
      )
      expect(done.ok ? [] : done.problems).toEqual([
        "take.wav: conditioning would write over the take itself",
      ])
    }
    expect(samePath("a/./b.wav", "a//c/../b.wav")).toBe(true)
    expect(samePath("/w/a/b.wav", "a/b.wav", "/w")).toBe(true)
    expect(samePath("/x/a/b.wav", "a/b.wav", "/w")).toBe(false)
  })

  it("cuts, speeds and levels a take, the same bytes each time", async () => {
    const pieces: ReadonlyArray<Piece> = [
      { kind: "click", fromMs: 20, toMs: 25 },
      { kind: "word", fromMs: 400, toMs: 1_400 },
      { kind: "word", fromMs: 2_600, toMs: 3_400 },
      { kind: "click", fromMs: 3_900, toMs: 3_905 },
    ]
    const wav = wavOf(takeOf(4_000, pieces), true)
    await writeFile(join(root, "take.wav"), wav)
    const ports = nodePorts(root)
    const sums: Array<string> = []
    for (const k of [1, 2]) {
      await ports.mkdir(`work-${String(k)}`)
      const done = await conditionTake(
        ports,
        {
          file: "take.wav",
          wav,
          words: [{ text: "Hello", startMs: 400, endMs: 1_400 }],
        },
        DEFAULT_CONDITIONING,
        `work-${String(k)}`,
        `out-${String(k)}.wav`,
        root
      )
      if (!done.ok) throw new Error(done.problems.join("\n"))
      const kept = done.value.kept.reduce((n, s) => n + s.toMs - s.fromMs, 0)
      const out = new Uint8Array(
        await readFile(join(root, `out-${String(k)}.wav`))
      )
      // The kept audio, played 1.2 times as fast.
      expect(
        Math.abs((wavMs(out) ?? 0) - kept / DEFAULT_CONDITIONING.tempo)
      ).toBeLessThan(30)
      expect(done.value.words?.[0]?.startMs).toBeLessThanOrEqual(100)
      sums.push(createHash("sha256").update(out).digest("hex"))
    }
    expect(sums[0]).toBe(sums[1])
  }, 60_000)
})
