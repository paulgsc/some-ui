/**
 * The four pieces, as glyphs: our light, a one-way, a crossroads and a side
 * street (their words are `./words`' `PIECES`). Each is composed from the
 * same primitives on a 64x64 grid, keeps one hue slot from the active theme's
 * chart palette, and one motion, so a viewer learns them once.
 *
 *   you        a solid dot
 *   team       another team (a ring)
 *   conference your conference (a dashed boundary)
 *   win        a win: the token that travels from loser to winner
 */

import type { PieceNoun } from "./words"

/** One motion per moving part; the CSS names them `pd-m-<motion>`. */
export type Motion = "to-winner" | "pulse" | "lose" | "export" | "bounce"

export type Primitive =
  | {
      readonly kind: "you" | "team" | "win"
      readonly x: number
      readonly y: number
      readonly motion?: Motion
    }
  | {
      readonly kind: "conference"
      readonly x: number
      readonly y: number
      readonly w: number
      readonly h: number
    }

export type SymbolDef = {
  readonly key: PieceNoun
  /** Index into the theme's --chart-1..5, or the foreground for neutral ones. */
  readonly hue: 1 | 2 | 3 | 4 | 5 | "neutral"
  readonly parts: ReadonlyArray<Primitive>
}

const SYMBOLS: ReadonlyArray<SymbolDef> = [
  {
    key: "own",
    hue: 4,
    parts: [
      { kind: "team", x: 46, y: 32, motion: "lose" },
      { kind: "you", x: 18, y: 32, motion: "pulse" },
      { kind: "win", x: 46, y: 32, motion: "to-winner" },
    ],
  },
  {
    key: "exported",
    hue: 3,
    parts: [
      { kind: "conference", x: 4, y: 10, w: 36, h: 44 },
      { kind: "team", x: 22, y: 32, motion: "lose" },
      { kind: "team", x: 54, y: 32 },
      { kind: "win", x: 22, y: 32, motion: "export" },
    ],
  },
  {
    key: "outside",
    hue: "neutral",
    parts: [
      { kind: "conference", x: 4, y: 10, w: 22, h: 44 },
      { kind: "team", x: 38, y: 32 },
      { kind: "team", x: 56, y: 32, motion: "lose" },
    ],
  },
  {
    key: "inside",
    hue: 2,
    parts: [
      { kind: "conference", x: 4, y: 8, w: 56, h: 48 },
      { kind: "team", x: 20, y: 36 },
      { kind: "team", x: 44, y: 36 },
      { kind: "win", x: 32, y: 20, motion: "bounce" },
    ],
  },
]

export function symbolFor(key: PieceNoun): SymbolDef {
  const found = SYMBOLS.find((s) => s.key === key)
  if (!found) throw new Error(`no symbol ${key}`)
  return found
}
