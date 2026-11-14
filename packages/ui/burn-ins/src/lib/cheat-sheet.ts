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
import { barlow, setText, type TextBlock } from "./text"

export const CHEAT_SHEET_DESIGNS = ["sheet-v1"] as const

const RowSchema = z.strictObject({
  badge: BadgeStateSchema.optional(),
  task: z.string().min(1),
  command: z.string().min(1),
  note: z.string().default(""),
  atMs: ItemAtSchema,
})

export const CheatSheetParamsSchema = z.strictObject({
  ...CardHeadSchema.shape,
  rows: z.array(RowSchema).min(1).max(8),
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
 * A row set from `y`: side by side when its task and command fit there with
 * room for its badge to open, else stacked; null when neither fits.
 */
function setRow(
  r: Row,
  y: number,
  box: Box,
  reach: number
): Omit<RowDrawing, "opens" | "atMs"> | null {
  const left = box.x + PAD + BADGE_COLUMN
  const right = box.x + box.width - PAD - reach
  const top = y + PAD
  const commandWidth = monoWidth(r.command, COMMAND_PX)
  const sideX = left + TASK_WIDTH + COLUMN_GAP
  const side = setText(r.task, TASK, { x: left, y: top, width: TASK_WIDTH }, 1)
  const stacked =
    side === null || sideX + commandWidth > right
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
  const noteY = commandY + COMMAND_LINE
  const note =
    r.note === ""
      ? null
      : setText(
          r.note,
          NOTE,
          { x: commandX, y: noteY, width: right - commandX },
          2
        )
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
  const problems: Array<string> = []
  const rows: Array<RowDrawing> = []
  let y = box.y
  for (const [i, r] of p.rows.entries()) {
    const words = wordsProblem(
      `row ${i + 1}`,
      [r.task, r.command, r.note].join("\n"),
      { what: `row ${i + 1}'s command`, text: r.command }
    )
    if (words !== null) {
      problems.push(words)
      continue
    }
    const open = opens[i] ?? false
    const reach =
      open && r.badge !== undefined ? openWidth(r.badge, BADGE_PX) : 0
    const set = setRow(r, y, box, reach)
    if (set === null) {
      problems.push(
        open
          ? `row ${i + 1} doesn't fit while its badge spells itself out`
          : `row ${i + 1} doesn't fit`
      )
      continue
    }
    rows.push({ ...set, opens: open, atMs: times[i] ?? 0 })
    y = set.panel.y + set.panel.height + ROW_GAP
  }
  // The last row rises into place, so the sheet needs room for its rise too.
  if (y - ROW_GAP + ITEM.risePx > box.y + box.height)
    problems.push(
      rows.length === p.rows.length
        ? `${p.rows.length} rows don't fit`
        : "the rows don't fit"
    )
  return problems.length > 0
    ? { ok: false, problems }
    : { ok: true, value: { heading: heading.value, stamp: stamp.value, rows } }
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
