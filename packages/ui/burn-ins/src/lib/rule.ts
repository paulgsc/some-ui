/**
 * The rule card (CARDS4, #2469), design `rule-v1`: how stale a card may be,
 * as a small algebra in the cards' monospace, a line at a time:
 *
 *     what's true today = this card ∩ <source> ∩ <source>
 *     card age ↑ ⇒ trust in ◧ □ △ ↓   (■ decays slowest)
 *     if they disagree: <the one that wins> wins
 *
 * Its sources (`make help`, a README's section) and the one that wins are
 * params, so it fits any repo. The monospace lacks ∩ and ⇒, so they are
 * drawn as shapes, as the badges' glyphs are (`./badge`); a source the
 * monospace can't draw, or that gives a value (`./cards`), is refused. The
 * type steps down until every line fits the body, and a line that fits at
 * none of its sizes is refused, naming it.
 */

import { z } from "zod"

import { badgeAt, type BadgeMark, type BadgeState } from "./badge"
import {
  appearing,
  CARD_INK,
  cardBody,
  cardHeading,
  CardHeadSchema,
  drawStamp,
  itemTimes,
  wordsProblem,
  type StampLine,
} from "./cards"
import type { Box, Geometry } from "./geometry"
import { INK, textBoxes, type TextFrame } from "./journal"
import { monoWidth } from "./mono"
import type { Parsed } from "./parsed"
import { WORDS } from "./words"

export const RULE_DESIGNS = ["rule-v1"] as const

const SourceSchema = z.string().min(1)

export const RuleParamsSchema = z.strictObject({
  ...CardHeadSchema.shape,
  /** What the card is read together with: `make help`, `the README`. */
  sources: z.array(SourceSchema).min(1).max(2),
  /** Which of them wins when they disagree. */
  wins: SourceSchema,
})

export type RuleParams = z.infer<typeof RuleParamsSchema>

/** The signs the monospace lacks, drawn as shapes. */
export type Sign = "and" | "implies"

/** Each sign's strokes, in its 16-unit square. */
export const SIGNS: Readonly<Record<Sign, string>> = {
  and: "M3.5 13.5V8A4.5 4.5 0 0 1 12.5 8V13.5",
  implies: "M1.5 5.5H11M1.5 10.5H11M8.5 2.5L14 8L8.5 13.5",
}

/** A piece of a line: words in a colour, a drawn sign, or a badge's glyph. */
type Piece =
  | { readonly kind: "words"; readonly text: string; readonly colour: string }
  | { readonly kind: "sign"; readonly sign: Sign }
  | { readonly kind: "badge"; readonly state: BadgeState }

const words = (text: string, colour: string = INK.text): Piece => ({
  kind: "words",
  text,
  colour,
})
const sign = (s: Sign): Piece => ({ kind: "sign", sign: s })
const badge = (state: BadgeState): Piece => ({ kind: "badge", state })

/** The rule's three lines, from its params. */
function linesOf(p: RuleParams): ReadonlyArray<ReadonlyArray<Piece>> {
  const w = WORDS.rule
  return [
    [
      words(`${w.today} `),
      ...p.sources.flatMap((s) => [sign("and"), words(` ${s} `, CARD_INK.key)]),
    ],
    [
      words(`${w.age} `),
      sign("implies"),
      words(` ${w.trust} `),
      badge("pr"),
      badge("next"),
      badge("gap"),
      words(` ${w.falls}   (`, INK.text),
      badge("main"),
      words(` ${w.slowest})`, INK.muted),
    ],
    [words(`${w.disagree} `), words(p.wins, CARD_INK.key), words(` ${w.wins}`)],
  ]
}

/** The sizes the type tries, largest first, in the frame's pixels. */
const SIZES = [34, 30, 26, 22] as const
const LINE_HEIGHT = 1.7
const INSET = 24

/** How far a piece advances: a sign or a glyph takes two of the type's cells. */
const advance = (piece: Piece, sizePx: number): number =>
  piece.kind === "words"
    ? monoWidth(piece.text, sizePx)
    : monoWidth("  ", sizePx)

const widthOfLine = (line: ReadonlyArray<Piece>, sizePx: number): number =>
  line.reduce((sum, piece) => sum + advance(piece, sizePx), 0)

/** A piece placed: words at a point, or a shape in a square. */
type Placed =
  | {
      readonly kind: "words"
      readonly x: number
      readonly text: string
      readonly colour: string
    }
  | { readonly kind: "sign"; readonly sign: Sign; readonly box: Box }
  | { readonly kind: "badge"; readonly state: BadgeState; readonly box: Box }

type RuleLineDrawing = {
  readonly y: number
  readonly pieces: ReadonlyArray<Placed>
  readonly width: number
  readonly atMs: number
}

/** The rule drawn once, for `frameAt` to time. */
export type RuleDrawing = {
  readonly heading: TextFrame
  readonly stamp: StampLine
  readonly sizePx: number
  readonly x: number
  readonly lines: ReadonlyArray<RuleLineDrawing>
}

type RuleRow = {
  readonly line: number
  readonly opacity: number
  readonly y: number
  /** Where the line's words and signs sit. */
  readonly pieces: ReadonlyArray<Placed>
  readonly badges: ReadonlyArray<BadgeMark>
  readonly box: Box
}

export type RuleFrame = {
  readonly heading: TextFrame
  readonly stamp: StampLine
  readonly sizePx: number
  readonly rows: ReadonlyArray<RuleRow>
}

/** The type a rule's lines are set in, at `sizePx`. */
export const ruleLineHeight = (sizePx: number): number => sizePx * LINE_HEIGHT

function place(
  line: ReadonlyArray<Piece>,
  x: number,
  y: number,
  sizePx: number
): ReadonlyArray<Placed> {
  const shape = Math.round(sizePx * 0.8)
  const top = y + (ruleLineHeight(sizePx) - shape) / 2
  let at = x
  return line.map((piece) => {
    const from = at
    at += advance(piece, sizePx)
    if (piece.kind === "words") return { ...piece, x: from }
    const box = {
      x: from + (advance(piece, sizePx) - shape) / 2,
      y: top,
      width: shape,
      height: shape,
    }
    return piece.kind === "sign"
      ? { kind: "sign", sign: piece.sign, box }
      : { kind: "badge", state: piece.state, box }
  })
}

export function drawRule(p: RuleParams, g: Geometry): Parsed<RuleDrawing> {
  const heading = cardHeading(p, g)
  if (!heading.ok) return heading
  const stamp = drawStamp(p.stamp, g)
  if (!stamp.ok) return stamp
  const problems = [
    ...p.sources.map((s, i) => wordsProblem(`source ${i + 1}`, s)),
    wordsProblem("the one that wins", p.wins),
  ].flatMap((why) => (why === null ? [] : [why]))
  if (problems.length > 0) return { ok: false, problems }
  const box = cardBody(g)
  const room = box.width - 2 * INSET
  const lines = linesOf(p)
  const sizePx = SIZES.find((size) =>
    lines.every((l) => widthOfLine(l, size) <= room)
  )
  if (sizePx === undefined) {
    const smallest = SIZES.at(-1) ?? 0
    return {
      ok: false,
      problems: lines.flatMap((l, i) =>
        widthOfLine(l, smallest) > room ? [`line ${i + 1} doesn't fit`] : []
      ),
    }
  }
  const pitch = ruleLineHeight(sizePx) + sizePx * 0.6
  if (INSET + lines.length * pitch > box.height)
    return { ok: false, problems: ["the rule doesn't fit"] }
  const x = box.x + INSET
  const times = itemTimes(lines.map(() => undefined))
  return {
    ok: true,
    value: {
      heading: heading.value,
      stamp: stamp.value,
      sizePx,
      x,
      lines: lines.map((l, i) => {
        const y = box.y + INSET + i * pitch
        return {
          y,
          pieces: place(l, x, y, sizePx),
          width: widthOfLine(l, sizePx),
          atMs: times[i] ?? 0,
        }
      }),
    },
  }
}

const risen = (p: Placed, dy: number): Placed =>
  p.kind === "words" ? p : { ...p, box: { ...p.box, y: p.box.y + dy } }

/** The rule `t` ms into its scene: the lines that have appeared so far. */
export function ruleAt(d: RuleDrawing, t: number): RuleFrame {
  const rows = d.lines.flatMap((l, line) => {
    if (t < l.atMs) return []
    const { opacity, risePx } = appearing(t, l.atMs)
    const pieces = l.pieces.map((p) => risen(p, risePx))
    return [
      {
        line,
        opacity,
        y: l.y + risePx,
        pieces,
        badges: pieces.flatMap((p) =>
          p.kind === "badge"
            ? [badgeAt(p.state, p.box.x, p.box.y, p.box.width, 1, 0)]
            : []
        ),
        box: {
          x: d.x,
          y: l.y + risePx,
          width: l.width,
          height: ruleLineHeight(d.sizePx),
        },
      },
    ]
  })
  return { heading: d.heading, stamp: d.stamp, sizePx: d.sizePx, rows }
}

/** The boxes the card covers: its heading, its lines and its stamp. */
export const ruleBoxes = (f: RuleFrame): ReadonlyArray<Box> => [
  ...textBoxes(f.heading),
  ...f.rows.map((r) => r.box),
  f.stamp.box,
]
