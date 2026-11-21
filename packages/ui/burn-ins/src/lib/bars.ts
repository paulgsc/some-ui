/**
 * The bars card, design `bars-v1`: a card's kicker and title in the header,
 * and in the body a chart of one to eight rows, a row at a time. Each row is
 * a label, one horizontal bar stacked from up to four parts (`series`), and
 * an optional note at the bar's end ("605 of 625"). A legend names the parts
 * above the rows, and a recessive axis counts in `unit` below them.
 *
 * Its marks follow the dataviz method: the parts take `BAR_COLOURS` in their
 * fixed order, never cycled; a 2 px gap of ground parts one from the next;
 * each part's corners are rounded 4 px (a panel has one radius); the grid is the panels' edge colour, and
 * every word is in the cards' ink, never a part's colour. Its values come
 * from the cut list, which names their source in its stamp.
 *
 * It never cuts text and never carries a value in its words (`./cards`'
 * values rule): `prepare` refuses, naming the row, a label or note that
 * doesn't fit, and a row whose parts aren't one per series.
 */

import { z } from "zod"

import {
  appearing,
  cardBody,
  cardHeading,
  CardHeadSchema,
  drawStamp,
  ITEM,
  ItemAtSchema,
  itemTimes,
  movedBlock,
  wordsProblem,
  type StampLine,
} from "./cards"
import type { Box, Geometry } from "./geometry"
import { INK, textBoxes, type Panel, type TextFrame } from "./journal"
import type { Parsed } from "./parsed"
import { barlow, setText, widthOf, type TextBlock } from "./text"

export const BARS_DESIGNS = ["bars-v1"] as const

/**
 * The parts' colours, in order: the dataviz skill's dark categorical slots
 * 1 to 4 (blue, orange, aqua, yellow), validated on the cards' ground
 * (`INK.ground`) with its `validate_palette.js`: every check passes, the
 * closest pair (aqua, yellow) at ΔE 8.4 under protanopia. Video colours, so
 * literals.
 */
export const BAR_COLOURS = ["#3987e5", "#d95926", "#199e70", "#c98500"] as const

const RowSchema = z.strictObject({
  label: z.string().min(1),
  /** One per series, in the series' order; a part of 0 draws nothing. */
  values: z.array(z.number().nonnegative()).min(1).max(BAR_COLOURS.length),
  note: z.string().default(""),
  atMs: ItemAtSchema,
})

export const BarsParamsSchema = z
  .strictObject({
    ...CardHeadSchema.shape,
    /** What each part counts, in order: the legend. */
    series: z.array(z.string().min(1)).min(1).max(BAR_COLOURS.length),
    /** What the axis counts in: "min", "runs". */
    unit: z.string().default(""),
    /** The axis's end; by default the longest bar, rounded up to a step. */
    max: z.number().positive().optional(),
    rows: z.array(RowSchema).min(1).max(8),
  })
  .superRefine((p, ctx) => {
    p.rows.forEach((r, i) => {
      if (r.values.length !== p.series.length)
        ctx.addIssue({
          code: "custom",
          path: ["rows", i, "values"],
          message: `it has ${r.values.length} parts, and the chart ${p.series.length} series`,
        })
    })
  })

export type BarsParams = z.infer<typeof BarsParamsSchema>

/** In the frame's pixels; both frames' shorter side is 1080 (`./geometry`). */
const LABEL = barlow(800, 28, INK.text, 1.2)
const NOTE = barlow(600, 24, INK.muted, 1.2)
const KEY = barlow(600, 22, INK.muted, 1.2)
const TICK = barlow(600, 20, INK.muted, 1.2)
const SWATCH = 22
const LEGEND_ROW = 44
const AXIS_ROW = 34
/** The ground between two parts of a bar (the dataviz skill's spacer). */
const PART_GAP = 2
const END_RADIUS = 4
const GRID_PX = 2
/** The bars' share of a row's height, and their thickest. */
const BAR_SHARE = 0.55
const BAR_MOST = 48
const ROW_MOST = 96
const GUTTER = 24
const NOTE_GAP = 16
/** The label column's share of the body's width. */
const LABEL_SHARE = 0.28
/** Room kept after the longest bar for its note. */
const NOTE_ROOM = 260

type RowDrawing = {
  readonly label: TextBlock
  readonly parts: ReadonlyArray<Panel>
  readonly note: TextBlock | null
  readonly atMs: number
}

/** The chart drawn once, for `barsAt` to time. */
export type BarsDrawing = {
  readonly heading: TextFrame
  readonly stamp: StampLine
  /** The legend's swatches and names. */
  readonly legend: TextFrame
  /** The grid's lines and the ticks' numbers. */
  readonly axis: TextFrame
  readonly rows: ReadonlyArray<RowDrawing>
}

type BarsRow = {
  readonly row: number
  readonly opacity: number
  readonly label: TextBlock
  readonly parts: ReadonlyArray<Panel>
  readonly note: TextBlock | null
}

export type BarsFrame = Omit<BarsDrawing, "rows"> & {
  readonly rows: ReadonlyArray<BarsRow>
}

/** A step for the axis: 1, 2, 2.5 or 5 times a power of ten, at most five to `top`. */
export function axisStep(top: number): number {
  const power = 10 ** Math.floor(Math.log10(top / 5))
  return (
    [1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => top / s <= 5) ??
    10 * power
  )
}

/** A tick's number as said on screen: 3,600; 2.5. */
const tickText = (n: number): string =>
  n.toLocaleString("en-US", { maximumFractionDigits: 2 })

const panel = (box: Box, fill: string, radiusPx: number): Panel => ({
  box,
  fill,
  edge: fill,
  edgePx: 0,
  radiusPx,
})

export function drawBars(p: BarsParams, g: Geometry): Parsed<BarsDrawing> {
  const heading = cardHeading(p, g)
  if (!heading.ok) return heading
  const stamp = drawStamp(p.stamp, g)
  if (!stamp.ok) return stamp
  const box = cardBody(g)
  const problems: Array<string> = []
  // Nothing on this card is set in the monospace, so only the values rule applies.
  const plain = (what: string, text: string): string | null =>
    wordsProblem(what, text, { what, text: "" })
  const words = [
    ...p.series.map((s, i) => plain(`series ${i + 1}`, s)),
    plain("the unit", p.unit),
    ...p.rows.map((r, i) => plain(`row ${i + 1}`, `${r.label}\n${r.note}`)),
  ].filter((w): w is string => w !== null)
  if (words.length > 0) return { ok: false, problems: words }

  // The legend: a swatch and its name, side by side, along the body's top.
  const legend: { panels: Array<Panel>; blocks: Array<TextBlock> } = {
    panels: [],
    blocks: [],
  }
  let x = box.x
  p.series.forEach((name, i) => {
    const width = widthOf(name, KEY)
    const at = x + SWATCH + 10
    if (at + width > box.x + box.width) {
      problems.push(`series ${i + 1}: the legend doesn't fit`)
      return
    }
    const block = setText(name, KEY, { x: at, y: box.y, width: width + 1 }, 1)
    if (block === null) {
      problems.push(`series ${i + 1}: the legend doesn't fit`)
      return
    }
    // The swatch sits on the middle of its name's line.
    const middle = block.box.y + block.box.height / 2
    legend.panels.push(
      panel(
        { x, y: middle - SWATCH / 2, width: SWATCH, height: SWATCH },
        BAR_COLOURS[i] ?? INK.muted,
        END_RADIUS
      )
    )
    legend.blocks.push(block)
    x = at + width + 40
  })

  const longest = Math.max(
    ...p.rows.map((r) => r.values.reduce((a, b) => a + b, 0))
  )
  if (!(longest > 0) && p.max === undefined)
    problems.push("every bar is empty, so the axis has no end")
  const top = p.max ?? longest
  const step = axisStep(top > 0 ? top : 1)
  const end = p.max ?? Math.ceil(top / step) * step
  if (longest > end)
    problems.push(
      `a bar runs to ${tickText(longest)}, past the axis's end, ${tickText(end)}`
    )

  const labelWidth = Math.round(box.width * LABEL_SHARE)
  const plotX = box.x + labelWidth
  const plotWidth = box.width - labelWidth - NOTE_ROOM
  const rowsTop = box.y + LEGEND_ROW
  const rowsSpace = box.height - LEGEND_ROW - AXIS_ROW - ITEM.risePx
  const rowHeight = Math.min(ROW_MOST, rowsSpace / p.rows.length)
  const barHeight = Math.min(BAR_MOST, rowHeight * BAR_SHARE)
  if (barHeight < SWATCH) problems.push(`${p.rows.length} rows don't fit`)
  const along = (v: number): number => (plotWidth * v) / end

  // The grid: a line at each step, the numbers under the rows.
  const axis: { panels: Array<Panel>; blocks: Array<TextBlock> } = {
    panels: [],
    blocks: [],
  }
  const gridHeight = rowHeight * p.rows.length
  // A line at each step, and one at the end, which says the unit. A step
  // closer to the end than half a step is left out, so no two numbers meet.
  const ticks = [
    ...Array.from({ length: Math.ceil(end / step) }, (_, k) => k * step).filter(
      (n) => end - n >= step / 2
    ),
    end,
  ]
  ticks.forEach((n, k) => {
    const at = plotX + along(n)
    axis.panels.push(
      panel(
        { x: at - GRID_PX / 2, y: rowsTop, width: GRID_PX, height: gridHeight },
        INK.edge,
        0
      )
    )
    const last = k === ticks.length - 1
    const said = `${tickText(n)}${last && p.unit !== "" ? ` ${p.unit}` : ""}`
    const width = widthOf(said, TICK)
    // Below the rows' rise, so a row coming in never crosses the numbers.
    const tick = setText(
      said,
      TICK,
      {
        x: at - width / 2,
        y: rowsTop + gridHeight + ITEM.risePx,
        width: width + 1,
      },
      1
    )
    if (tick !== null) axis.blocks.push(tick)
  })

  const times = itemTimes(p.rows.map((r) => r.atMs))
  const rows = p.rows.flatMap((r, i): Array<RowDrawing> => {
    const y = rowsTop + i * rowHeight
    const barY = y + (rowHeight - barHeight) / 2
    // Two lines where a row has room for them, else one.
    const lines = rowHeight >= 2 * LABEL.sizePx * LABEL.lineHeight ? 2 : 1
    const label = setText(
      r.label,
      LABEL,
      { x: box.x, y: 0, width: labelWidth - GUTTER },
      lines
    )
    if (label === null || label.box.height > rowHeight) {
      problems.push(`row ${i + 1}: its label doesn't fit`)
      return []
    }
    let start = plotX
    const parts = r.values.flatMap((v, k) => {
      const width = along(v)
      const from = start
      start += width
      // The next part's gap is taken from this one, so the bar keeps its
      // length; none is taken when nothing is drawn after it.
      const followed = r.values.slice(k + 1).some((next) => along(next) >= 1)
      const drawn = followed ? width - PART_GAP : width
      return drawn < 1
        ? []
        : [
            panel(
              { x: from, y: barY, width: drawn, height: barHeight },
              BAR_COLOURS[k] ?? INK.muted,
              END_RADIUS
            ),
          ]
    })
    let note: TextBlock | null = null
    if (r.note !== "") {
      const noteX = start + NOTE_GAP
      note = setText(
        r.note,
        NOTE,
        { x: noteX, y: 0, width: box.x + box.width - noteX },
        1
      )
      if (note === null) {
        problems.push(`row ${i + 1}: its note doesn't fit after its bar`)
        return []
      }
      note = movedBlock(note, 0, barY + (barHeight - note.box.height) / 2)
    }
    return [
      {
        label: movedBlock(label, 0, y + (rowHeight - label.box.height) / 2),
        parts,
        note,
        atMs: times[i] ?? 0,
      },
    ]
  })
  if (problems.length > 0) return { ok: false, problems }
  return {
    ok: true,
    value: {
      heading: heading.value,
      stamp: stamp.value,
      legend,
      axis,
      rows,
    },
  }
}

/** The chart `t` ms into its scene: the rows that have appeared so far. */
export function barsAt(d: BarsDrawing, t: number): BarsFrame {
  const rows = d.rows.flatMap((r, row) => {
    if (t < r.atMs) return []
    const { opacity, risePx } = appearing(t, r.atMs)
    return [
      {
        row,
        opacity,
        label: movedBlock(r.label, 0, risePx),
        parts: r.parts.map((p) => ({
          ...p,
          box: { ...p.box, y: p.box.y + risePx },
        })),
        note: r.note === null ? null : movedBlock(r.note, 0, risePx),
      },
    ]
  })
  return { ...d, rows }
}

/** The boxes the card covers: its heading, legend, axis, rows and stamp. */
export const barsBoxes = (f: BarsFrame): ReadonlyArray<Box> => [
  ...textBoxes(f.heading),
  ...textBoxes(f.legend),
  ...textBoxes(f.axis),
  ...f.rows.flatMap((r) => [
    r.label.box,
    ...r.parts.map((p) => p.box),
    ...(r.note === null ? [] : [r.note.box]),
  ]),
  f.stamp.box,
]
