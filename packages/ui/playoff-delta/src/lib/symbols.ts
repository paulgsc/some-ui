/**
 * The symbol algebra: a closed set of event types that exists before any week
 * is played. Each week only fills them. Every symbol is composed from the same
 * seven primitives on a 64x64 grid, keeps one hue slot from the active theme's
 * chart palette, and one motion, so a viewer learns the grammar once.
 *
 *   you        a solid dot
 *   team       a contender (a ring)
 *   out        an eliminated team (a dashed ring)
 *   rival      a named rival (a ring inside a ring)
 *   division   your division (a box)
 *   conference your conference (a dashed boundary)
 *   win        a win: the token that travels from loser to winner
 */

import type { TemplateKey } from "./story"

/** One motion per moving part; the CSS names them `pd-m-<motion>`. */
export type Motion =
  | "to-winner"
  | "pulse"
  | "lose"
  | "drop"
  | "fly-out"
  | "fall"
  | "export"
  | "waste"
  | "bounce"

export type Primitive =
  | {
      readonly kind: "you" | "team" | "out" | "rival" | "win"
      readonly x: number
      readonly y: number
      readonly motion?: Motion
    }
  | {
      readonly kind: "division" | "conference"
      readonly x: number
      readonly y: number
      readonly w: number
      readonly h: number
    }
  | { readonly kind: "line"; readonly y: number }

export type SymbolKey = "game" | TemplateKey

export type SymbolDef = {
  readonly key: SymbolKey
  readonly name: string
  /** The rule, in one line: the same every week. */
  readonly rule: string
  /** Index into the theme's --chart-1..5, or the foreground for neutral ones. */
  readonly hue: 1 | 2 | 3 | 4 | 5 | "neutral"
  readonly parts: ReadonlyArray<Primitive>
}

export const SYMBOLS: ReadonlyArray<SymbolDef> = [
  {
    key: "game",
    name: "Your game",
    rule: "Win and every path moves one win closer.",
    hue: 4,
    parts: [
      { kind: "team", x: 46, y: 32, motion: "lose" },
      { kind: "you", x: 18, y: 32, motion: "pulse" },
      { kind: "win", x: 46, y: 32, motion: "to-winner" },
    ],
  },
  {
    key: "division",
    name: "Division rivals",
    rule: "Every division loss is one you never have to make up.",
    hue: 2,
    parts: [
      { kind: "division", x: 8, y: 10, w: 48, h: 44 },
      { kind: "you", x: 21, y: 23 },
      { kind: "team", x: 43, y: 23 },
      { kind: "team", x: 21, y: 41 },
      { kind: "team", x: 43, y: 41, motion: "drop" },
      { kind: "win", x: 43, y: 41, motion: "fly-out" },
    ],
  },
  {
    key: "rivals",
    name: "Named rivals",
    rule: "The teams you most want to fall.",
    hue: 5,
    parts: [
      { kind: "rival", x: 32, y: 28, motion: "drop" },
      { kind: "win", x: 32, y: 28, motion: "fly-out" },
    ],
  },
  {
    key: "above",
    name: "Teams above you",
    rule: "A loss from above shrinks the gap to the seed.",
    hue: 1,
    parts: [
      { kind: "line", y: 34 },
      { kind: "you", x: 22, y: 34 },
      { kind: "team", x: 42, y: 16, motion: "fall" },
    ],
  },
  {
    key: "exported",
    name: "Exported wins",
    rule: "A conference team loses to the other conference. The win leaves the race.",
    hue: 3,
    parts: [
      { kind: "conference", x: 4, y: 10, w: 36, h: 44 },
      { kind: "team", x: 22, y: 32, motion: "lose" },
      { kind: "team", x: 54, y: 32 },
      { kind: "win", x: 22, y: 32, motion: "export" },
    ],
  },
  {
    key: "spoilers",
    name: "Spoilers",
    rule: "An eliminated team beats a contender. The win is wasted, the loss isn't.",
    hue: 2,
    parts: [
      { kind: "conference", x: 4, y: 8, w: 56, h: 48 },
      { kind: "out", x: 18, y: 32 },
      { kind: "team", x: 46, y: 32, motion: "lose" },
      { kind: "win", x: 46, y: 32, motion: "waste" },
    ],
  },
  {
    key: "forced",
    name: "Forced games",
    rule: "Two contenders meet. Someone has to win.",
    hue: "neutral",
    parts: [
      { kind: "conference", x: 4, y: 8, w: 56, h: 48 },
      { kind: "team", x: 20, y: 36 },
      { kind: "team", x: 44, y: 36 },
      { kind: "win", x: 32, y: 20, motion: "bounce" },
    ],
  },
]

/** Your game, lost: the same symbol with the roles swapped. */
export const GAME_LOST: ReadonlyArray<Primitive> = [
  { kind: "you", x: 46, y: 32, motion: "lose" },
  { kind: "team", x: 18, y: 32, motion: "pulse" },
  { kind: "win", x: 46, y: 32, motion: "to-winner" },
]

export function symbolFor(key: SymbolKey): SymbolDef {
  const found = SYMBOLS.find((s) => s.key === key)
  if (!found) throw new Error(`no symbol ${key}`)
  return found
}

/** The alphabet screen: each primitive alone, with what it means. */
export const ALPHABET: ReadonlyArray<{
  readonly label: string
  readonly parts: ReadonlyArray<Primitive>
  /** Crop so a lone shape fills its tile. */
  readonly viewBox: string
}> = [
  {
    label: "you",
    parts: [{ kind: "you", x: 32, y: 32 }],
    viewBox: "22 22 20 20",
  },
  {
    label: "a contender",
    parts: [{ kind: "team", x: 32, y: 32 }],
    viewBox: "22 22 20 20",
  },
  {
    label: "an eliminated team",
    parts: [{ kind: "out", x: 32, y: 32 }],
    viewBox: "22 22 20 20",
  },
  {
    label: "a named rival",
    parts: [{ kind: "rival", x: 32, y: 32 }],
    viewBox: "18 18 28 28",
  },
  {
    label: "your division",
    parts: [
      { kind: "division", x: 10, y: 12, w: 44, h: 40 },
      { kind: "team", x: 32, y: 32 },
    ],
    viewBox: "2 2 60 60",
  },
  {
    label: "your conference",
    parts: [
      { kind: "conference", x: 6, y: 8, w: 52, h: 48 },
      { kind: "team", x: 32, y: 32 },
    ],
    viewBox: "2 2 60 60",
  },
  {
    label: "a win, moving to the winner",
    parts: [{ kind: "win", x: 32, y: 32 }],
    viewBox: "22 22 20 20",
  },
]
