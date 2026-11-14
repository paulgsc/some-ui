/**
 * The legend card (CARDS4, #2469), design `legend-v1`: a card's kicker and
 * title in the header, and in the body the five status badges (`./badge`),
 * each beside what it means, in the words the badges spell themselves out
 * in (`./words`' `badges`), a row at a time. The legend is the definition
 * itself, so its badges never spell themselves out, and showing one here
 * doesn't count as its first appearance.
 */

import { z } from "zod"

import { BADGE_STATES, badgeAt, type BadgeMark, type BadgeState } from "./badge"
import {
  appearing,
  cardBody,
  cardHeading,
  CardHeadSchema,
  drawStamp,
  itemTimes,
  type StampLine,
} from "./cards"
import type { Box, Geometry } from "./geometry"
import { INK, textBoxes, type TextFrame } from "./journal"
import type { Parsed } from "./parsed"
import { barlow, setText, type TextBlock } from "./text"
import { WORDS } from "./words"

export const LEGEND_DESIGNS = ["legend-v1"] as const

export const LegendParamsSchema = z.strictObject({ ...CardHeadSchema.shape })

export type LegendParams = z.infer<typeof LegendParamsSchema>

/** In the frame's pixels; both frames' shorter side is 1080 (`./geometry`). */
const MEANING = barlow(600, 34, INK.text, 1.3)
const GLYPH_PX = 34
const COLUMN = GLYPH_PX + 28
const ROW_GAP = 22
const INSET = 24

type LegendRowDrawing = {
  readonly state: BadgeState
  readonly glyph: { readonly x: number; readonly y: number }
  readonly meaning: TextBlock
  readonly atMs: number
}

/** The legend drawn once, for `frameAt` to time. */
export type LegendDrawing = {
  readonly heading: TextFrame
  readonly stamp: StampLine
  readonly rows: ReadonlyArray<LegendRowDrawing>
}

type LegendRow = {
  readonly row: number
  readonly opacity: number
  readonly badge: BadgeMark
  readonly meaning: TextBlock
}

export type LegendFrame = {
  readonly heading: TextFrame
  readonly stamp: StampLine
  readonly rows: ReadonlyArray<LegendRow>
}

export function drawLegend(
  p: LegendParams,
  g: Geometry
): Parsed<LegendDrawing> {
  const heading = cardHeading(p, g)
  if (!heading.ok) return heading
  const stamp = drawStamp(p.stamp, g)
  if (!stamp.ok) return stamp
  const box = cardBody(g)
  const times = itemTimes(BADGE_STATES.map(() => undefined))
  const pitch = MEANING.sizePx * MEANING.lineHeight + ROW_GAP
  const rows: Array<LegendRowDrawing> = []
  for (const [i, state] of BADGE_STATES.entries()) {
    const y = box.y + INSET + i * pitch
    const meaning = setText(
      WORDS.badges[state],
      MEANING,
      { x: box.x + INSET + COLUMN, y, width: box.width - 2 * INSET - COLUMN },
      1
    )
    if (meaning === null)
      return { ok: false, problems: [`the meaning of ${state} doesn't fit`] }
    rows.push({
      state,
      glyph: {
        x: box.x + INSET,
        y: y + (MEANING.sizePx * MEANING.lineHeight - GLYPH_PX) / 2,
      },
      meaning,
      atMs: times[i] ?? 0,
    })
  }
  const last = rows.at(-1)
  if (last && last.meaning.box.y + last.meaning.box.height > box.y + box.height)
    return { ok: false, problems: ["the legend doesn't fit"] }
  return {
    ok: true,
    value: { heading: heading.value, stamp: stamp.value, rows },
  }
}

/** The legend `t` ms into its scene: the rows that have appeared so far. */
export function legendAt(d: LegendDrawing, t: number): LegendFrame {
  const rows = d.rows.flatMap((r, row) => {
    if (t < r.atMs) return []
    const { opacity, risePx } = appearing(t, r.atMs)
    return [
      {
        row,
        opacity,
        badge: badgeAt(
          r.state,
          r.glyph.x,
          r.glyph.y + risePx,
          GLYPH_PX,
          // The row's layer fades it, with the words beside it.
          1,
          0
        ),
        meaning: {
          ...r.meaning,
          box: { ...r.meaning.box, y: r.meaning.box.y + risePx },
        },
      },
    ]
  })
  return { heading: d.heading, stamp: d.stamp, rows }
}

/** The boxes the card covers: its heading, each row and its stamp. */
export const legendBoxes = (f: LegendFrame): ReadonlyArray<Box> => [
  ...textBoxes(f.heading),
  ...f.rows.flatMap((r) => [r.badge.glyph, r.meaning.box]),
  f.stamp.box,
]
