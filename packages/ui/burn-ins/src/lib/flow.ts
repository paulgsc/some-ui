/**
 * The flow card (CARDS5, #2470), design `flow-v1`: a card's kicker and title
 * in the header, and in the body two to five steps joined by arrows, a step
 * at a time. Each step is a panel holding its optional status badge
 * (`./badge`), its label, an optional command in the cards' monospace
 * (`./mono`) and an optional note under it.
 *
 * The 16:9 video sets the steps side by side, each arrow pointing right;
 * the 9:16 short stacks them, each arrow pointing down. The steps share one
 * size, the largest any of them needs. A step that doesn't fit, with its
 * badge open where it spells itself out, is refused, naming it, as is one
 * that gives a value (`./cards`) or whose command has a character the
 * monospace lacks. The monospace has no arrows, so they are drawn as
 * shapes, as the badges' glyphs are.
 */

import { z } from "zod"

import { badgeAt, BadgeStateSchema, openness, type BadgeMark } from "./badge"
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
import { INK, textBoxes, type TextFrame } from "./journal"
import { missingChar, monoWidth } from "./mono"
import type { Parsed } from "./parsed"
import { barlow, setText, type TextBlock } from "./text"

export const FLOW_DESIGNS = ["flow-v1"] as const

const StepSchema = z.strictObject({
  badge: BadgeStateSchema.optional(),
  label: z.string().min(1),
  command: z.string().default(""),
  note: z.string().default(""),
  atMs: ItemAtSchema,
})

export const FlowParamsSchema = z.strictObject({
  ...CardHeadSchema.shape,
  steps: z.array(StepSchema).min(2).max(5),
})

export type FlowParams = z.infer<typeof FlowParamsSchema>
type Step = FlowParams["steps"][number]

/** In the frame's pixels; both frames' shorter side is 1080 (`./geometry`). */
const LABEL = barlow(800, 30, INK.text, 1.25)
const NOTE = barlow(600, 22, INK.muted, 1.3)
const COMMAND_PX = 22
const COMMAND_LINE = COMMAND_PX * 1.4
const PAD = 18
const GAP = 10
const BADGE_PX = 26
/** The room an arrow takes between two steps. */
const ARROW = 56
const ARROW_PX = 32
const NOTE_ROWS = 4

/** The arrow's strokes, pointing right, in its 16-unit square. */
export const ARROW_PATH = "M2 8H13.5M9 3.5L13.5 8L9 12.5"

/** A command, set on one row in the monospace. */
type FlowCommand = {
  readonly x: number
  readonly y: number
  readonly text: string
}

type StepDrawing = {
  readonly panel: Box
  readonly badge: Step["badge"]
  readonly badgeAt: { readonly x: number; readonly y: number }
  readonly opens: boolean
  readonly label: TextBlock
  readonly command: FlowCommand | null
  readonly note: TextBlock | null
  /** The arrow into this step, from the one before; null for the first. */
  readonly arrow: Box | null
  readonly atMs: number
}

/** The flow drawn once, for `frameAt` to time. */
export type FlowDrawing = {
  readonly heading: TextFrame
  readonly stamp: StampLine
  /** Whether the arrows point down: the steps are stacked. */
  readonly down: boolean
  readonly steps: ReadonlyArray<StepDrawing>
}

type FlowStep = {
  readonly step: number
  readonly opacity: number
  readonly panel: Box
  readonly badge: BadgeMark | null
  readonly label: TextBlock
  readonly command: FlowCommand | null
  readonly note: TextBlock | null
  readonly arrow: Box | null
}

export type FlowFrame = {
  readonly heading: TextFrame
  readonly stamp: StampLine
  readonly down: boolean
  readonly steps: ReadonlyArray<FlowStep>
}

/** The type a command is set in. */
export const FLOW_COMMAND_TYPE = {
  sizePx: COMMAND_PX,
  lineHeightPx: COMMAND_LINE,
  colour: CARD_INK.key,
} as const

/** A step's contents set in a panel `width` wide from (0, 0), or why not. */
function setStep(
  s: Step,
  width: number,
  opens: boolean
): Omit<StepDrawing, "panel" | "arrow" | "atMs" | "opens"> | string {
  const inner = width - 2 * PAD
  let y = PAD
  const badgeY = y
  if (s.badge !== undefined) {
    const mark = badgeAt(s.badge, PAD, y, BADGE_PX, 1, opens ? 1 : 0)
    const reach =
      mark.open === null ? BADGE_PX : mark.open.pill.x + mark.open.pill.width
    if (reach > width - PAD / 2)
      return "its badge doesn't fit while it spells itself out"
    y += BADGE_PX + GAP
  }
  const label = setText(s.label, LABEL, { x: PAD, y, width: inner }, 2)
  if (label === null) return "its label doesn't fit"
  y += label.box.height
  let command: FlowCommand | null = null
  if (s.command !== "") {
    if (monoWidth(s.command, COMMAND_PX) > inner)
      return "its command doesn't fit"
    command = { x: PAD, y: y + GAP / 2, text: s.command }
    y += GAP / 2 + COMMAND_LINE
  }
  let note: TextBlock | null = null
  if (s.note !== "") {
    note = setText(
      s.note,
      NOTE,
      { x: PAD, y: y + GAP / 2, width: inner },
      NOTE_ROWS
    )
    if (note === null) return "its note doesn't fit"
  }
  return {
    badge: s.badge,
    badgeAt: { x: PAD, y: badgeY },
    label,
    command,
    note,
  }
}

const bottomOf = (set: Exclude<ReturnType<typeof setStep>, string>): number =>
  Math.max(
    set.label.box.y + set.label.box.height,
    set.command === null ? 0 : set.command.y + COMMAND_LINE,
    set.note === null ? 0 : set.note.box.y + set.note.box.height
  ) + PAD

const movedBlock = (b: TextBlock, dx: number, dy: number): TextBlock => ({
  ...b,
  box: { ...b.box, x: b.box.x + dx, y: b.box.y + dy },
})

/** Why step `n` (from 1) can't be shown as written, or null. */
function wordsProblem(n: number, s: Step): string | null {
  const missing = missingChar(s.command)
  if (missing !== null)
    return `step ${n}'s command has "${missing}", which the card's type can't draw`
  const name = valueProblem([s.label, s.command, s.note].join("\n"))
  return name === null
    ? null
    : `step ${n} gives ${name} a value; a card shows a placeholder, never a value`
}

export function drawFlow(p: FlowParams, g: Geometry): Parsed<FlowDrawing> {
  const heading = cardHeading(p, g)
  if (!heading.ok) return heading
  const stamp = drawStamp(p.stamp, g)
  if (!stamp.ok) return stamp
  const box = cardBody(g)
  // The short stacks; its body is nearly square, so the frame decides.
  const down = g.frame.height > g.frame.width
  const n = p.steps.length
  const width = down ? box.width : (box.width - (n - 1) * ARROW) / n
  const opens = badgesOpening(
    p.steps.map((s) => s.badge),
    p.badgesSeen
  )
  const problems: Array<string> = []
  const sets = p.steps.flatMap((s, i) => {
    const words = wordsProblem(i + 1, s)
    if (words !== null) {
      problems.push(words)
      return []
    }
    const set = setStep(s, width, opens[i] ?? false)
    if (typeof set === "string") {
      problems.push(`step ${i + 1}: ${set}`)
      return []
    }
    return [set]
  })
  if (problems.length > 0) return { ok: false, problems }
  const height = Math.max(...sets.map(bottomOf))
  const span = down ? n * height + (n - 1) * ARROW : height
  if (span > box.height)
    return { ok: false, problems: [`${n} steps don't fit`] }
  const times = itemTimes(p.steps.map((s) => s.atMs))
  // Centred down the body when side by side; from its top when stacked.
  const top = down ? box.y : box.y + (box.height - height) / 2
  const steps = sets.map((set, i): StepDrawing => {
    const x = down ? box.x : box.x + i * (width + ARROW)
    const y = down ? top + i * (height + ARROW) : top
    const arrow =
      i === 0
        ? null
        : down
          ? {
              x: x + (width - ARROW_PX) / 2,
              y: y - (ARROW + ARROW_PX) / 2,
              width: ARROW_PX,
              height: ARROW_PX,
            }
          : {
              x: x - (ARROW + ARROW_PX) / 2,
              y: y + (height - ARROW_PX) / 2,
              width: ARROW_PX,
              height: ARROW_PX,
            }
    return {
      panel: { x, y, width, height },
      badge: set.badge,
      badgeAt: { x: x + set.badgeAt.x, y: y + set.badgeAt.y },
      opens: opens[i] ?? false,
      label: movedBlock(set.label, x, y),
      command:
        set.command === null
          ? null
          : { ...set.command, x: x + set.command.x, y: y + set.command.y },
      note: set.note === null ? null : movedBlock(set.note, x, y),
      arrow,
      atMs: times[i] ?? 0,
    }
  })
  return {
    ok: true,
    value: { heading: heading.value, stamp: stamp.value, down, steps },
  }
}

/** The flow `t` ms into its scene: the steps that have appeared so far. */
export function flowAt(d: FlowDrawing, t: number): FlowFrame {
  const steps = d.steps.flatMap((s, step) => {
    if (t < s.atMs) return []
    const { opacity, risePx } = appearing(t, s.atMs)
    const rise = <T extends { readonly y: number }>(at: T): T => ({
      ...at,
      y: at.y + risePx,
    })
    return [
      {
        step,
        opacity,
        panel: rise(s.panel),
        badge:
          s.badge === undefined
            ? null
            : badgeAt(
                s.badge,
                s.badgeAt.x,
                s.badgeAt.y + risePx,
                BADGE_PX,
                opacity,
                s.opens ? openness(t - s.atMs) : 0
              ),
        label: movedBlock(s.label, 0, risePx),
        command: s.command === null ? null : rise(s.command),
        note: s.note === null ? null : movedBlock(s.note, 0, risePx),
        arrow: s.arrow,
      },
    ]
  })
  return { heading: d.heading, stamp: d.stamp, down: d.down, steps }
}

/** The boxes the card covers: its heading, its steps and arrows, and its stamp. */
export const flowBoxes = (f: FlowFrame): ReadonlyArray<Box> => [
  ...textBoxes(f.heading),
  ...f.steps.flatMap((s) =>
    s.arrow === null ? [s.panel] : [s.panel, s.arrow]
  ),
  f.stamp.box,
]
