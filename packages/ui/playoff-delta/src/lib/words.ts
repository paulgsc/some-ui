/**
 * The short's vocabulary (owner, 2026-10-28): every word it says about a
 * week, and every band and threshold behind one, in one pure table. A word
 * here works like a chess piece's name: taught once, in the legend episode,
 * then used every week to mean the same thing (`__tests__/words.test.ts`).
 *
 * All of it comes from the image the show started with: driving through a
 * suburb, making or missing each light.
 *
 * - **Pieces** are games, named only by who plays, so a noun never changes.
 * - **Material** is what a piece is worth this week: its price, in points of
 *   the share of the ways in.
 * - **The week** is a band of its rank: of the ways the week could have gone,
 *   how many would have left us worse. The share is a fair game, so a band's
 *   width is also how rare it is.
 * - **Next week** is a band of its spread; **the verdict** is a policy (keep
 *   driving, park it) or a proof (arrived, dead end), and they look different.
 *
 * Words say what is counted ("of the ways the week could go"), never a
 * forecast (CLAUDE.md, "Say what it is").
 */

import type { StoryKind, StoryPiece } from "./story"

/** A piece's noun: who plays decides it, and so how its result can move us. */
export type PieceNoun = StoryKind | "outside"

export const PIECES: Readonly<
  Record<
    PieceNoun,
    {
      readonly noun: string
      readonly plural: string
      /** Who plays it. */
      readonly who: string
      /** How its result can move us: the rule that never changes. */
      readonly moves: string
    }
  >
> = {
  own: {
    noun: "our light",
    plural: "our lights",
    who: "Us.",
    moves: "A win always helps.",
  },
  exported: {
    noun: "one-way",
    plural: "one-ways",
    who: "A team in our race against the other conference.",
    moves:
      "It only goes one way: their loss takes a win out of our race, so it helps us or does nothing.",
  },
  inside: {
    noun: "crossroads",
    plural: "crossroads",
    who: "Two teams in our race.",
    moves:
      "Either way: one of them gets the win, and which is better for us depends on who can afford it without passing us.",
  },
  outside: {
    noun: "side street",
    plural: "side streets",
    who: "Two teams outside our race.",
    moves: "Never on our route.",
  },
}

/** The order the legend teaches the pieces in. */
export const PIECE_ORDER: ReadonlyArray<PieceNoun> = [
  "own",
  "exported",
  "inside",
  "outside",
]

export type Material = "major" | "minor" | "idle"

/** A piece's price, in share (points / 100), from which it is major. */
const MAJOR = 0.01
/** A piece's price from which it is minor: below it, too small to tell from zero. */
const MINOR = 0.0025

/**
 * What a piece is worth this week: major from a point, minor from a quarter
 * of a point, idle below that, or when its price is no bigger than its
 * sampling error.
 */
export function materialOf(
  piece: Pick<StoryPiece, "price" | "error">
): Material {
  if (piece.price <= piece.error || piece.price < MINOR) return "idle"
  return piece.price >= MAJOR ? "major" : "minor"
}

/** Whether a piece is worth watching this week: major or minor. */
export const live = (piece: Pick<StoryPiece, "price" | "error">): boolean =>
  materialOf(piece) !== "idle"

export const MATERIAL: Readonly<
  Record<
    Material,
    { readonly word: string; readonly plural: string; readonly worth: string }
  >
> = {
  major: { word: "major", plural: "majors", worth: "1 point or more" },
  minor: { word: "minor", plural: "minors", worth: "¼ to 1 point" },
  idle: {
    word: "idle",
    plural: "idle",
    worth: "under ¼ point: too small to tell from zero",
  },
}

/** The verbs: what a piece's result did, and what our result did to a piece. */
export const VERBS = {
  made: {
    word: "made",
    means: "it went the way the best week wanted",
  },
  missed: {
    word: "missed",
    means: "it went the other way",
  },
  woke: {
    word: "woke",
    means: "idle before our result, major or minor after it",
  },
} as const

export type Band =
  | "all-greens"
  | "mostly-green"
  | "stop-and-go"
  | "mostly-red"
  | "all-reds"

/**
 * The week's bands, best first, each from the rank it starts at: of the
 * week's ways, the share that would have left us worse. The share is a fair
 * game, so each band's width (10, 25, 30, 25, 10 of every 100) is how often a
 * week lands in it.
 */
export const BANDS: ReadonlyArray<{
  readonly band: Band
  readonly from: number
  readonly phrase: string
}> = [
  { band: "all-greens", from: 0.9, phrase: "All greens" },
  { band: "mostly-green", from: 0.65, phrase: "Mostly green" },
  { band: "stop-and-go", from: 0.35, phrase: "Stop-and-go" },
  { band: "mostly-red", from: 0.1, phrase: "Mostly red" },
  { band: "all-reds", from: 0, phrase: "All reds" },
]

/** The band a rank lands in. */
export function bandOf(rank: number): Band {
  return BANDS.find((b) => rank >= b.from)?.band ?? "all-reds"
}

export const phraseOf = (band: Band): string =>
  BANDS.find((b) => b.band === band)?.phrase ?? ""

/** How wide a band is: how many of every 100 weeks land in it. */
export function widthOf(band: Band): number {
  const i = BANDS.findIndex((b) => b.band === band)
  const top = i === 0 ? 1 : (BANDS[i - 1]?.from ?? 1)
  return Math.round((top - (BANDS[i]?.from ?? 0)) * 100)
}

/** Earned, and literal: no major or minor piece missed. */
export const CLEAN_RUN = "a clean run"

export type Stakes = "rush-hour" | "traffic" | "empty-road"

/** Next week's spread, in share, from which it is rush hour, then traffic. */
const RUSH_HOUR = 0.05
const TRAFFIC = 0.01

export function stakesOf(spread: number): Stakes {
  if (spread >= RUSH_HOUR) return "rush-hour"
  if (spread >= TRAFFIC) return "traffic"
  return "empty-road"
}

export const STAKES: Readonly<
  Record<Stakes, { readonly phrase: string; readonly means: string }>
> = {
  "rush-hour": {
    phrase: "Rush hour",
    means: "next week can move us 5 points or more",
  },
  traffic: { phrase: "Traffic", means: "next week can move us 1 to 5 points" },
  "empty-road": {
    phrase: "Empty road",
    means: "next week can move us less than a point",
  },
}

export type Call = "keep-driving" | "park-it" | "arrived" | "dead-end"

/**
 * The verdict's words. A policy is the owner's rule for when to stop
 * watching; a proof is a fact about every way the season can go. They are
 * said, and marked, differently.
 */
export const CALLS: Readonly<
  Record<
    Call,
    {
      readonly phrase: string
      readonly kind: "policy" | "proof"
      readonly means: string
    }
  >
> = {
  "keep-driving": {
    phrase: "Keep driving",
    kind: "policy",
    means: "keep watching",
  },
  "park-it": {
    phrase: "Park it",
    kind: "policy",
    means: "98% or more of the ways in, or 2% or less: we stop watching",
  },
  arrived: {
    phrase: "Arrived",
    kind: "proof",
    means: "in, whatever happens",
  },
  "dead-end": {
    phrase: "Dead end",
    kind: "proof",
    means: "no way in is left",
  },
}

const MEDALS = ["gold", "silver", "bronze"] as const

/** The medal a podium place earns: "gold" for 1. */
export const medalOf = (place: number): string => MEDALS[place - 1] ?? ""

/** "one" to "ten" in words, digits past that. */
export function numberWord(n: number): string {
  const words = [
    "no",
    "one",
    "two",
    "three",
    "four",
    "five",
    "six",
    "seven",
    "eight",
    "nine",
    "ten",
  ]
  return words[n] ?? String(n)
}

/** "1st", "2nd", "23rd". */
export function ordinal(n: number): string {
  const tens = n % 100
  if (tens >= 11 && tens <= 13) return `${n}th`
  const suffix = ["th", "st", "nd", "rd"][n % 10] ?? "th"
  return `${n}${suffix}`
}
