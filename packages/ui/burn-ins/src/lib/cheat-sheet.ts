/**
 * The cheat-sheet card (CARDS3, #2468), design `sheet-v1`: a card's kicker
 * and title in the header, and in the body a row per task, each a panel
 * holding its status badge (`./badge`), the task's name, its command in the
 * cards' monospace (`./mono`) and an optional note under the command. Rows
 * appear one at a time and hold.
 *
 * A row sets its task and command side by side, or, when they don't fit
 * there (the 9:16 frame's narrower body), the task above the command. One
 * that doesn't fit either way is refused, naming the row, as is one that
 * gives a value (`./cards`' values rule) or uses a character the monospace
 * lacks. While a row's badge spells itself out, the row's words move aside
 * for it, as a terminal's line does.
 *
 * The rows run down one column while they fit its height. When they don't,
 * a body wide enough for two (the 16:9 frame's) sets them in two, the
 * first half on the left, each row side by side with its note under the
 * whole row; a row whose command can't sit beside its task there is
 * refused, naming it (CHEAT, C1400).
 *
 * CH1: up to `MOST_ROWS`, the schema's bound, a sheet is refused only for
 * a row, by its number, never for how many rows it has, in either frame,
 * for rows that sit side by side in a column of half the 16:9 body. Its
 * Tolerance: a row whose command can't sit beside its task there draws
 * only while its 16:9 sheet fits one column (`__tests__/cheat-sheet.test.ts`,
 * "CH1").
 */

import { z } from "zod"

import {
  badgeAt,
  BadgeStateSchema,
  openness,
  openReach,
  openWidth,
  type BadgeMark,
} from "./badge"
import {
  appearing,
  badgesOpening,
  CARD_INK,
  cardBody,
  cardHeading,
  CardHeadSchema,
  drawStamp,
  ITEM,
  ItemAtSchema,
  itemTimes,
  moved,
  movedBlock,
  wordsProblem,
  type Command,
  type CommandType,
  type StampLine,
} from "./cards"
import type { Box, Geometry } from "./geometry"
import { INK, textBoxes, type TextFrame } from "./journal"
import { monoWidth } from "./mono"
import type { Parsed } from "./parsed"
import { barlow, setText, widthOf, type TextBlock } from "./text"

export const CHEAT_SHEET_DESIGNS = ["sheet-v1"] as const

const RowSchema = z.strictObject({
  badge: BadgeStateSchema.optional(),
  task: z.string().min(1),
  command: z.string().min(1),
  note: z.string().default(""),
  atMs: ItemAtSchema,
})

/**
 * The most rows a sheet holds: three to a column of the 16:9 frame's body,
 * the most whose side-by-side rows, each with a note of two lines, fit its
 * height with the last one's rise (C1400). A policy limit: move it with the
 * design that holds it.
 */
export const MOST_ROWS = 6

export const CheatSheetParamsSchema = z.strictObject({
  ...CardHeadSchema.shape,
  rows: z.array(RowSchema).min(1).max(MOST_ROWS),
})

export type CheatSheetParams = z.infer<typeof CheatSheetParamsSchema>
type Row = CheatSheetParams["rows"][number]

/** In the frame's pixels; both frames' shorter side is 1080 (`./geometry`). */
const TASK = barlow(600, 28, INK.text, 1.3)
const NOTE = barlow(600, 20, INK.muted, 1.3)
const COMMAND_PX = 24
const COMMAND_LINE = COMMAND_PX * 1.3
const PAD = 10
const ROW_GAP = 10
const BADGE_PX = 26
const BADGE_COLUMN = BADGE_PX + 18
const TASK_WIDTH = 320
const COLUMN_GAP = 24
/** Between the sheet's two columns, where it has two. */
const SHEET_GAP = 40
/**
 * The narrowest column a sheet is set in: room for the badge, the task,
 * and a command of ten letters beside it.
 */
const NARROWEST =
  2 * PAD + BADGE_COLUMN + TASK_WIDTH + COLUMN_GAP + 10 * COMMAND_PX * 0.6

type RowDrawing = {
  readonly panel: Box
  /** Where the badge's glyph sits. */
  readonly badgeX: number
  readonly badgeY: number
  readonly badge: Row["badge"]
  readonly opens: boolean
  readonly atMs: number
  readonly task: TextBlock
  readonly command: Command
  readonly note: TextBlock | null
}

/** The sheet drawn once, for `frameAt` to time. */
export type CheatSheetDrawing = {
  readonly heading: TextFrame
  readonly stamp: StampLine
  readonly rows: ReadonlyArray<RowDrawing>
}

type SheetRow = {
  readonly row: number
  readonly panel: Box
  readonly opacity: number
  readonly badge: BadgeMark | null
  readonly task: TextBlock
  readonly command: Command
  readonly note: TextBlock | null
}

export type CheatSheetFrame = {
  readonly heading: TextFrame
  readonly stamp: StampLine
  readonly rows: ReadonlyArray<SheetRow>
}

/** The type a command is set in. */
export const COMMAND_TYPE: CommandType = {
  sizePx: COMMAND_PX,
  lineHeightPx: COMMAND_LINE,
  colour: CARD_INK.key,
}

/**
 * How a sheet's rows are set: down one column, each side by side or
 * stacked; or in two, each side by side, a long task pushing its command
 * along, with its note under the whole row.
 */
type ColumnSet = "one" | "two"

/**
 * A row set from `y`: side by side when its task and command fit there with
 * room for its badge to open, else stacked; null when neither fits.
 */
function setRow(
  r: Row,
  y: number,
  box: Box,
  reach: number,
  column: ColumnSet
): Omit<RowDrawing, "opens" | "atMs"> | null {
  const left = box.x + PAD + BADGE_COLUMN
  const right = box.x + box.width - PAD - reach
  const top = y + PAD
  const commandWidth = monoWidth(r.command, COMMAND_PX)
  // In two columns a task longer than the task column pushes its own
  // command along, since its row can't stack.
  const taskWidth =
    column === "one"
      ? TASK_WIDTH
      : Math.max(TASK_WIDTH, Math.ceil(widthOf(r.task, TASK)) + 1)
  const sideX = left + taskWidth + COLUMN_GAP
  const side = setText(r.task, TASK, { x: left, y: top, width: taskWidth }, 1)
  const stacked =
    column === "one" && (side === null || sideX + commandWidth > right)
      ? setText(r.task, TASK, { x: left, y: top, width: right - left }, 1)
      : null
  const task = stacked ?? side
  if (task === null) return null
  const commandX = stacked === null ? sideX : left
  if (commandX + commandWidth > right) return null
  const commandY =
    stacked === null
      ? top + (task.box.height - COMMAND_LINE) / 2
      : top + task.box.height
  // In two columns the note runs under the whole row, from the task's edge.
  const noteX = column === "one" ? commandX : left
  const noteY =
    column === "one"
      ? commandY + COMMAND_LINE
      : Math.max(commandY + COMMAND_LINE, top + task.box.height)
  const note =
    r.note === ""
      ? null
      : setText(r.note, NOTE, { x: noteX, y: noteY, width: right - noteX }, 2)
  if (r.note !== "" && note === null) return null
  const bottom = Math.max(
    top + task.box.height,
    note === null ? noteY : note.box.y + note.box.height
  )
  return {
    panel: { x: box.x, y, width: box.width, height: bottom + PAD - y },
    badgeX: box.x + PAD,
    badgeY: top + (TASK.sizePx * TASK.lineHeight - BADGE_PX) / 2,
    badge: r.badge,
    task,
    command: { x: commandX, y: commandY, text: r.command },
    note,
  }
}

type Laid = {
  readonly rows: ReadonlyArray<RowDrawing>
  readonly problems: ReadonlyArray<string>
  /** Whether every column's rows, with the last one's rise, fit its height. */
  readonly fits: boolean
}

/**
 * The rows down `columns`, the first `ceil(n / k)` in the first, each set
 * as `setRow` sets it for one column or two.
 */
function layRows(
  p: CheatSheetParams,
  columns: ReadonlyArray<Box>,
  times: ReadonlyArray<number>,
  opens: ReadonlyArray<boolean>
): Laid {
  const columnSet: ColumnSet = columns.length === 1 ? "one" : "two"
  const each = Math.ceil(p.rows.length / columns.length)
  const problems: Array<string> = []
  const rows: Array<RowDrawing> = []
  let fits = true
  columns.forEach((box, c) => {
    let y = box.y
    for (let i = c * each; i < Math.min(p.rows.length, (c + 1) * each); i++) {
      const r = p.rows[i]
      if (r === undefined) continue
      const open = opens[i] ?? false
      const reach =
        open && r.badge !== undefined ? openWidth(r.badge, BADGE_PX) : 0
      const set = setRow(r, y, box, reach, columnSet)
      if (set === null) {
        problems.push(
          open
            ? `row ${i + 1} doesn't fit while its badge spells itself out`
            : columnSet === "one"
              ? `row ${i + 1} doesn't fit`
              : `row ${i + 1} doesn't fit: ${p.rows.length} rows take two columns, and its command doesn't fit beside its task in one`
        )
        continue
      }
      rows.push({ ...set, opens: open, atMs: times[i] ?? 0 })
      y = set.panel.y + set.panel.height + ROW_GAP
    }
    // The last row rises into place, so a column needs room for its rise too.
    if (y - ROW_GAP + ITEM.risePx > box.y + box.height) fits = false
  })
  return { rows, problems, fits }
}

/** `box` as two columns, `SHEET_GAP` apart, or null when it is too narrow. */
function twoColumns(box: Box): ReadonlyArray<Box> | null {
  const width = (box.width - SHEET_GAP) / 2
  return width < NARROWEST
    ? null
    : [
        { ...box, width },
        { ...box, x: box.x + width + SHEET_GAP, width },
      ]
}

export function drawCheatSheet(
  p: CheatSheetParams,
  g: Geometry
): Parsed<CheatSheetDrawing> {
  const heading = cardHeading(p, g)
  if (!heading.ok) return heading
  const stamp = drawStamp(p.stamp, g)
  if (!stamp.ok) return stamp
  const box = cardBody(g)
  const times = itemTimes(p.rows.map((r) => r.atMs))
  const opens = badgesOpening(
    p.rows.map((r) => r.badge),
    times,
    p.badgesSeen
  )
  const words = p.rows.flatMap((r, i) => {
    const w = wordsProblem(
      `row ${i + 1}`,
      [r.task, r.command, r.note].join("\n"),
      { what: `row ${i + 1}'s command`, text: r.command }
    )
    return w === null ? [] : [w]
  })
  if (words.length > 0) return { ok: false, problems: words }
  const one = layRows(p, [box], times, opens)
  const two = twoColumns(box)
  // One column while it holds them; else two, where the body is wide enough.
  const laid =
    one.problems.length > 0 || one.fits || two === null
      ? one
      : layRows(p, two, times, opens)
  const problems = [
    ...laid.problems,
    ...(laid.fits || laid.problems.length > 0
      ? []
      : [`${p.rows.length} rows don't fit`]),
  ]
  return problems.length > 0
    ? { ok: false, problems }
    : {
        ok: true,
        value: { heading: heading.value, stamp: stamp.value, rows: laid.rows },
      }
}

/** The sheet `t` ms into its scene: the rows that have appeared so far. */
export function cheatSheetAt(d: CheatSheetDrawing, t: number): CheatSheetFrame {
  const rows = d.rows.flatMap((r, row) => {
    if (t < r.atMs) return []
    const { opacity, risePx } = appearing(t, r.atMs)
    const badge =
      r.badge === undefined
        ? null
        : badgeAt(
            r.badge,
            r.badgeX,
            r.badgeY + risePx,
            BADGE_PX,
            opacity,
            r.opens ? openness(t - r.atMs) : 0
          )
    const dx = badge === null ? 0 : openReach(badge)
    return [
      {
        row,
        panel: moved(r.panel, 0, risePx),
        opacity,
        badge,
        task: movedBlock(r.task, dx, risePx),
        command: moved(r.command, dx, risePx),
        note: r.note === null ? null : movedBlock(r.note, dx, risePx),
      },
    ]
  })
  return { heading: d.heading, stamp: d.stamp, rows }
}

/** The boxes the card covers: its heading, its rows' panels and its stamp. */
export const cheatSheetBoxes = (f: CheatSheetFrame): ReadonlyArray<Box> => [
  ...textBoxes(f.heading),
  ...f.rows.map((r) => r.panel),
  f.stamp.box,
]
