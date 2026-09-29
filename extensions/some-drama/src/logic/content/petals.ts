// ── Petals ────────────────────────────────────────────────────────────────────
// What the blossom layer looks like: which glyphs, how many, and how they move,
// for the current mood and rating — plus the one-shot bursts a change sets off.
// Pure: every random draw goes through `rand`, so a test can pin it.

import type { MoodType } from "@drama/types"

export type PetalLook = { mood: MoodType | null; rating: number }

/** One particle's static parameters; particles.ts writes them as --b-* vars. */
export type PetalSpec = {
  glyph: string
  px: number // offset from the layer origin
  py: number
  tx: number // drift over one cycle
  ty: number
  rot: number
  dur: number // seconds
  delay: number // seconds
}

type Span = readonly [number, number]

type Motion = {
  glyphs: ReadonlyArray<string>
  tx: Span
  ty: Span // negative rises, positive falls
  rot: Span
  dur: Span
}

// Each mood moves differently, not only in another colour: joy floats up and
// spins, sadness falls slowly, tension darts short and fast, cringe squirms
// sideways, meh barely moves.
const MOTION: Record<MoodType | "none", Motion> = {
  none: {
    glyphs: ["🌸", "🌺", "🌼", "✿", "❀"],
    tx: [-70, 70],
    ty: [-110, -35],
    rot: [-210, 210],
    dur: [5, 9],
  },
  joy: {
    glyphs: ["🌼", "✨", "🌻", "✿", "❀"],
    tx: [-60, 60],
    ty: [-140, -70],
    rot: [-360, 360],
    dur: [4, 7],
  },
  love: {
    glyphs: ["🌸", "💗", "❀", "🌺", "💕"],
    tx: [-80, 80],
    ty: [-120, -50],
    rot: [-240, 240],
    dur: [5, 8],
  },
  sadness: {
    glyphs: ["💧", "❀", "🍂", "💧", "✿"],
    tx: [-25, 25],
    ty: [70, 140],
    rot: [-60, 60],
    dur: [7, 11],
  },
  tension: {
    glyphs: ["⚡", "✦", "🍁", "✧", "❁"],
    tx: [-35, 35],
    ty: [-50, 20],
    rot: [-540, 540],
    dur: [2, 4],
  },
  cringe: {
    glyphs: ["🫧", "✾", "🫧", "❀", "✿"],
    tx: [-110, 110],
    ty: [-40, 10],
    rot: [-90, 90],
    dur: [4, 7],
  },
  neutral: {
    glyphs: ["🍃", "✿", "☁️", "❀", "·"],
    tx: [-40, 40],
    ty: [-30, -10],
    rot: [-45, 45],
    dur: [8, 12],
  },
}

/** The rating decides how lush the layer is: 3 petals at 0, 10 at 10. */
export function petalCount(rating: number): number {
  const r = Math.min(10, Math.max(0, rating))
  return Math.round(3 + r * 0.7)
}

/** The brightest a petal gets, 0..1: a low rating leaves them faint. */
export function petalPeak(rating: number): number {
  const r = Math.min(10, Math.max(0, rating))
  return Math.round((0.35 + r * 0.055) * 100) / 100
}

const draw =
  (rand: () => number) =>
  ([lo, hi]: Span): number =>
    lo + rand() * (hi - lo)

export function petalsFor(
  look: PetalLook,
  rand: () => number = Math.random
): Array<PetalSpec> {
  const m = MOTION[look.mood ?? "none"]
  const r = draw(rand)
  return Array.from({ length: petalCount(look.rating) }, (_, i) => ({
    glyph: m.glyphs[i % m.glyphs.length] ?? "✿",
    px: r([-20, 40]),
    py: r([-30, 30]),
    tx: r(m.tx),
    ty: r(m.ty),
    rot: r(m.rot),
    dur: r(m.dur),
    delay: r([0, 4]),
  }))
}

// ── Bursts ────────────────────────────────────────────────────────────────────
// A burst plays once, from the card, the moment something changes: the mood's
// own petals for a beat (more for a harder hit), stars for a rating, sprouts
// or dead leaves for a likelihood to finish.

export type Burst =
  | { kind: "mood"; mood: MoodType; intensity: 1 | 2 | 3 }
  | { kind: "rating" | "finish"; rising: boolean }

const BURST_GLYPHS = {
  "rating-rise": ["⭐", "✨", "★", "🌟"],
  "rating-fall": ["☆", "·", "✧"],
  "finish-rise": ["🌱", "✨", "🍀"],
  "finish-fall": ["🍂", "🥀", "💤"],
} as const

/** The longest a burst particle lives, delay included — its removal timer. */
export const BURST_MAX_S = 2.2

export function burstFor(
  burst: Burst,
  rand: () => number = Math.random
): Array<PetalSpec> {
  const r = draw(rand)
  let glyphs: ReadonlyArray<string>
  let count: number
  let rise: boolean
  if (burst.kind === "mood") {
    const m = MOTION[burst.mood]
    glyphs = m.glyphs
    count = 4 * burst.intensity
    rise = m.ty[0] + m.ty[1] < 0
  } else {
    glyphs = BURST_GLYPHS[`${burst.kind}-${burst.rising ? "rise" : "fall"}`]
    count = 8
    rise = burst.rising
  }
  return Array.from({ length: count }, (_, i) => ({
    glyph: glyphs[i % glyphs.length] ?? "✦",
    px: r([-120, 10]),
    py: r([-25, 25]),
    tx: r([-90, 90]),
    ty: rise ? r([-160, -80]) : r([60, 130]),
    rot: r([-300, 300]),
    dur: r([1.2, 1.8]),
    delay: r([0, BURST_MAX_S - 1.8]),
  }))
}
