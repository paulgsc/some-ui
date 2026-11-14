/**
 * The terminal card (CARDS2, #2467), design `terminal-v1`: a card's kicker
 * and title in the header, and in the body a terminal window, its title bar
 * and its lines, each line appearing at its time (`./cards`' `appearing`),
 * with its prompt, keyword, text and comment in their colours and
 * an optional status badge (`./badge`) beside it. The lines sit centred
 * down the window.
 *
 * It never cuts text and never carries a value: `prepare` refuses, naming
 * the line, one that doesn't fit the window (with its badge open, when it
 * spells itself out, since the line's text moves aside for it), one with a
 * character the monospace lacks (`./mono`), and one that gives a value
 * (`./cards`' values rule).
 */

import { z } from "zod"

import {
  badgeAt,
  BadgeStateSchema,
  openness,
  openReach,
  type BadgeMark,
  type BadgeState,
} from "./badge"
import {
  appearing,
  badgesOpening,
  CARD_INK,
  cardBody,
  cardHeading,
  CardHeadSchema,
  drawStamp,
  ItemAtSchema,
  itemTimes,
  valueProblem,
  type StampLine,
} from "./cards"
import type { Box, Geometry } from "./geometry"
import {
  cardSpace,
  INK,
  textBoxes,
  type Panel,
  type TextFrame,
} from "./journal"
import { missingChar, monoWidth } from "./mono"
import type { Parsed } from "./parsed"

export const TERMINAL_DESIGNS = ["terminal-v1"] as const

const LineSchema = z
  .strictObject({
    /** Drawn muted before the rest, with a space: `$`, `#`. */
    prompt: z.string().default(""),
    /** A command or a name, in the key colour. */
    keyword: z.string().default(""),
    text: z.string().default(""),
    /** Muted, after the rest. */
    comment: z.string().default(""),
    badge: BadgeStateSchema.optional(),
    atMs: ItemAtSchema,
  })
  .refine((l) => (l.prompt + l.keyword + l.text + l.comment).length > 0, {
    message: "a line says something",
  })

export const TerminalParamsSchema = z.strictObject({
  ...CardHeadSchema.shape,
  /** The window's title bar. */
  bar: z.string().default(""),
  lines: z.array(LineSchema).min(1).max(12),
})

export type TerminalParams = z.infer<typeof TerminalParamsSchema>
type Line = TerminalParams["lines"][number]

/** In the frame's pixels; both frames' shorter side is 1080 (`./geometry`). */
const SIZE_PX = 28
const LINE_HEIGHT = 1.45
const ROW_GAP = 10
const BAR_PX = 56
const BAR_SIZE_PX = 22
const PAD_X = 28
const PAD_Y = 24
const BADGE_PX = 26
const BADGE_COLUMN = BADGE_PX + 18
const DOT_PX = 14
const DOT_STEP = 24

/** A run of a line's text in one colour. */
type Span = { readonly text: string; readonly colour: string }

type LineDrawing = {
  readonly x: number
  readonly y: number
  readonly spans: ReadonlyArray<Span>
  readonly badge: BadgeState | undefined
  readonly atMs: number
  readonly opens: boolean
}

/** The window drawn once, for `frameAt` to time. */
export type TerminalDrawing = {
  /** The heading, and the window, its title bar's foot and dots as panels. */
  readonly card: TextFrame
  readonly stamp: StampLine
  readonly bar: {
    readonly x: number
    readonly y: number
    readonly text: string
  } | null
  readonly lines: ReadonlyArray<LineDrawing>
}

type TerminalRow = {
  /** Which line it is, from 0. */
  readonly line: number
  /** Where its text starts, moved aside while its badge is open. */
  readonly x: number
  readonly y: number
  readonly spans: ReadonlyArray<Span>
  readonly opacity: number
  readonly badge: BadgeMark | null
}

export type TerminalFrame = Omit<TerminalDrawing, "lines"> & {
  readonly rows: ReadonlyArray<TerminalRow>
}

/** The type the window's lines and title bar are set in. */
export const TERMINAL_TYPE = {
  sizePx: SIZE_PX,
  lineHeight: LINE_HEIGHT,
  barSizePx: BAR_SIZE_PX,
} as const

const spansOf = (l: Line): ReadonlyArray<Span> =>
  [
    { text: l.prompt === "" ? "" : `${l.prompt} `, colour: INK.muted },
    { text: l.keyword, colour: CARD_INK.key },
    { text: l.text, colour: INK.text },
    { text: l.comment, colour: INK.muted },
  ].filter((s) => s.text !== "")

/**
 * Why `text`, named `name`, can't be drawn `width` wide at `sizePx` with
 * `reach` more beside it, or null when it can.
 */
function textProblem(
  name: string,
  text: string,
  sizePx: number,
  width: number,
  reach = 0
): string | null {
  const missing = missingChar(text)
  if (missing !== null)
    return `${name} has "${missing}", which the terminal's type can't draw`
  const given = valueProblem(text)
  if (given !== null)
    return `${name} gives ${given} a value; a card shows a placeholder, never a value`
  if (monoWidth(text, sizePx) + reach > width)
    return reach > 0
      ? `${name} doesn't fit the window while its badge spells itself out`
      : `${name} doesn't fit the window`
  return null
}

const lineText = (l: Line): string =>
  spansOf(l)
    .map((s) => s.text)
    .join("")

export function drawTerminal(
  p: TerminalParams,
  g: Geometry
): Parsed<TerminalDrawing> {
  const heading = cardHeading(p, g)
  if (!heading.ok) return heading
  const stamp = drawStamp(p.stamp, g)
  if (!stamp.ok) return stamp
  const window: Panel = {
    ...cardSpace(g).panel,
    box: cardBody(g),
    fill: CARD_INK.window,
    radiusPx: 16,
  }
  const box = window.box
  const times = itemTimes(p.lines.map((l) => l.atMs))
  const opens = badgesOpening(
    p.lines.map((l) => l.badge),
    times,
    p.badgesSeen
  )
  const textX = box.x + PAD_X + BADGE_COLUMN
  const width = box.x + box.width - PAD_X - textX
  const problems = p.lines.flatMap((l, i) => {
    const reach =
      opens[i] === true && l.badge !== undefined
        ? openReach(badgeAt(l.badge, 0, 0, BADGE_PX, 1, 1))
        : 0
    const why = textProblem(`line ${i + 1}`, lineText(l), SIZE_PX, width, reach)
    return why === null ? [] : [why]
  })
  const barText = p.bar === "" ? null : p.bar
  const barX = box.x + PAD_X + 3 * DOT_STEP
  if (barText !== null) {
    const why = textProblem(
      "the title bar",
      barText,
      BAR_SIZE_PX,
      box.x + box.width - PAD_X - barX
    )
    if (why !== null) problems.push(why)
  }
  const pitch = SIZE_PX * LINE_HEIGHT + ROW_GAP
  const areaY = box.y + BAR_PX
  const areaHeight = box.height - BAR_PX
  const linesHeight = p.lines.length * pitch - ROW_GAP
  if (linesHeight > areaHeight - 2 * PAD_Y)
    problems.push(`${p.lines.length} lines don't fit the window`)
  if (problems.length > 0) return { ok: false, problems }
  const top = areaY + (areaHeight - linesHeight) / 2
  const flat = (b: Box, radiusPx = 0): Panel => ({
    box: b,
    fill: window.edge,
    edge: window.edge,
    edgePx: 0,
    radiusPx,
  })
  return {
    ok: true,
    value: {
      stamp: stamp.value,
      card: {
        ...heading.value,
        panels: [
          window,
          flat({ x: box.x, y: areaY - 2, width: box.width, height: 2 }),
          ...[0, 1, 2].map((i) =>
            flat(
              {
                x: box.x + PAD_X + i * DOT_STEP,
                y: box.y + (BAR_PX - DOT_PX) / 2,
                width: DOT_PX,
                height: DOT_PX,
              },
              DOT_PX / 2
            )
          ),
        ],
      },
      bar:
        barText === null
          ? null
          : {
              x: barX,
              y: box.y + (BAR_PX - BAR_SIZE_PX * LINE_HEIGHT) / 2,
              text: barText,
            },
      lines: p.lines.map((l, i) => ({
        x: textX,
        y: top + i * pitch,
        spans: spansOf(l),
        badge: l.badge,
        atMs: times[i] ?? 0,
        opens: opens[i] ?? false,
      })),
    },
  }
}

/** The window `t` ms into its scene: the lines that have appeared so far. */
export function terminalAt(d: TerminalDrawing, t: number): TerminalFrame {
  const { lines, ...still } = d
  const rows = lines.flatMap((l, line) => {
    if (t < l.atMs) return []
    const { opacity, risePx } = appearing(t, l.atMs)
    const y = l.y + risePx
    const badge =
      l.badge === undefined
        ? null
        : badgeAt(
            l.badge,
            l.x - BADGE_COLUMN,
            y + (SIZE_PX * LINE_HEIGHT - BADGE_PX) / 2,
            BADGE_PX,
            opacity,
            l.opens ? openness(t - l.atMs) : 0
          )
    return [
      {
        line,
        x: l.x + (badge === null ? 0 : openReach(badge)),
        y,
        spans: l.spans,
        opacity,
        badge,
      },
    ]
  })
  return { ...still, rows }
}

/** The boxes the card covers: its heading, its window and its stamp. */
export const terminalBoxes = (f: TerminalFrame): ReadonlyArray<Box> => [
  ...textBoxes(f.card),
  f.stamp.box,
]
