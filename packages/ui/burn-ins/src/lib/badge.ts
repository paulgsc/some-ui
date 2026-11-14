/**
 * The status badge (CARDS1, #2466): one glyph per state of a claim a card
 * makes, so a video that goes stale says how fresh each claim was. Five
 * states, each a glyph drawn by code (SVG paths in a 16-unit square, so no
 * font decides how it looks) in a video colour: `main` ■, `pr` ◧, `next` □,
 * `gap` △ and `you` ✋. The definitions are the words table's (`WORDS.badges`), the one place
 * they live.
 *
 * **A badge announces itself.** At a state's first appearance in a video
 * its badge opens into its definition for `REVEAL`, then closes to the glyph; later appearances show the
 * glyph alone. Which appearance opens is pure: a burn-in that shows badges
 * is given the states shown before it in the video (`badgesSeen`, which
 * `@some-ui/video-render` writes from the cut list's scenes in order), and
 * opens the first of each state not among them (`opening`).
 *
 * Design `badge-v1`, the `status-badge` kind: one badge over a scene, at
 * the top left of its body, saying the state of what the scene shows. The
 * card kinds (CARDS2–CARDS5) are to draw the same badge beside their lines
 * (`badgeAt`).
 */

import { z } from "zod"

import type { Box, Geometry } from "./geometry"
import type { Parsed } from "./parsed"
import {
  barlow,
  setText,
  widthOf,
  type TextBlock,
  type TextStyle,
} from "./text"
import { WORDS } from "./words"

export const BADGE_STATES = ["main", "pr", "next", "gap", "you"] as const
export type BadgeState = (typeof BADGE_STATES)[number]

export const BadgeStateSchema = z.enum(BADGE_STATES)

/** Each state's colour. Video colours, not the app's, so literals. */
export const BADGE_COLOUR: Readonly<Record<BadgeState, string>> = {
  main: "#4fb37a",
  pr: "#e0b03f",
  next: "#8f9aa8",
  gap: "#e5813a",
  you: "#a68be8",
}

/** A path of a glyph, in its 16-unit square: filled, or stroked. */
export type GlyphPath = {
  readonly d: string
  readonly paint: "fill" | "stroke"
}

/** A rounded square, inset 2.5 units. */
const SQUARE =
  "M4 2.5H12A1.5 1.5 0 0 1 13.5 4V12A1.5 1.5 0 0 1 12 13.5H4A1.5 1.5 0 0 1 2.5 12V4A1.5 1.5 0 0 1 4 2.5Z"

/** Each state's glyph. */
export const GLYPHS: Readonly<Record<BadgeState, ReadonlyArray<GlyphPath>>> = {
  main: [{ d: SQUARE, paint: "fill" }],
  pr: [
    { d: SQUARE, paint: "stroke" },
    {
      d: "M2.5 4A1.5 1.5 0 0 1 4 2.5H8V13.5H4A1.5 1.5 0 0 1 2.5 12Z",
      paint: "fill",
    },
  ],
  next: [{ d: SQUARE, paint: "stroke" }],
  gap: [{ d: "M8 2.2L14 13.3H2Z", paint: "stroke" }],
  you: [
    {
      d: "M4.5 9V5M6.5 8V3.2M8.5 8V3M10.5 8.4V4M4.5 9Q4.5 14 8.5 14Q12.5 14 12.5 10V7.5M12.5 7.5Q12.5 6.2 13.6 5.6",
      paint: "stroke",
    },
  ],
}

/** A glyph's stroke, in its 16-unit square. */
export const GLYPH_STROKE = 1.6

/** How a badge announces itself: in, held, out, in ms. */
export const REVEAL = { inMs: 450, totalMs: 2600, outMs: 450 } as const

/** How long a badge takes to fade in where it appears. */
export const APPEAR_MS = 400

const smooth = (x: number): number => x * x * (3 - 2 * x)

/**
 * How far open a revealing badge is, 0 to 1, `sinceMs` after it appears:
 * eased in, held open, eased out, and shut outside `REVEAL`.
 */
export function openness(sinceMs: number): number {
  if (sinceMs < 0 || sinceMs >= REVEAL.totalMs) return 0
  if (sinceMs < REVEAL.inMs) return smooth(sinceMs / REVEAL.inMs)
  const left = REVEAL.totalMs - sinceMs
  return left < REVEAL.outMs ? smooth(left / REVEAL.outMs) : 1
}

/**
 * Which of a burn-in's badges, in the order they appear, open into their
 * definition: the first of each state not shown before it (`seen`).
 */
export function opening(
  shown: ReadonlyArray<BadgeState>,
  seen: ReadonlyArray<BadgeState>
): ReadonlyArray<boolean> {
  const met = new Set(seen)
  return shown.map((s) => {
    if (met.has(s)) return false
    met.add(s)
    return true
  })
}

/** A badge as drawn at a moment. */
export type BadgeMark = {
  readonly state: BadgeState
  readonly colour: string
  /** The glyph's square. */
  readonly glyph: Box
  /** 0 to 1, as it fades in where it appears. */
  readonly opacity: number
  /** While it announces itself: the pill behind it, and its definition. */
  readonly open: {
    readonly pill: Box
    /** The definition set whole; `shownPx` of its width shows. */
    readonly label: TextBlock
    readonly shownPx: number
    /** The pill's tint and the label's opacity, 0 to 1. */
    readonly amount: number
  } | null
}

/** The definition's type, sized from the glyph. */
const labelStyle = (state: BadgeState, glyphPx: number): TextStyle =>
  barlow(600, Math.round(glyphPx * 0.72), BADGE_COLOUR[state], 1.2)

/** The pill's padding around the glyph and label, as a share of the glyph. */
const PAD = 0.3
const GAP = 0.35

/**
 * A badge with its glyph's square at (`x`, `y`), `glyphPx` across, faded in
 * `opacity` and open `amount` (0 shut, 1 open).
 */
export function badgeAt(
  state: BadgeState,
  x: number,
  y: number,
  glyphPx: number,
  opacity: number,
  amount: number
): BadgeMark {
  const colour = BADGE_COLOUR[state]
  const glyph = { x, y, width: glyphPx, height: glyphPx }
  if (amount <= 0) return { state, colour, glyph, opacity, open: null }
  const style = labelStyle(state, glyphPx)
  const words = WORDS.badges[state]
  const full = Math.ceil(widthOf(words, style))
  const textX = x + glyphPx * (1 + GAP)
  const label = setText(
    words,
    style,
    {
      x: textX,
      y: y + (glyphPx - style.sizePx * style.lineHeight) / 2,
      width: full,
    },
    1
  )
  // `full` is the label's own width, so one row always takes it.
  if (label === null) throw new Error(`${words} doesn't fit its own width`)
  const shownPx = Math.round(full * amount)
  const pad = glyphPx * PAD
  return {
    state,
    colour,
    glyph,
    opacity,
    open: {
      pill: {
        x: x - pad,
        y: y - pad,
        width: textX + shownPx + pad - (x - pad),
        height: glyphPx + 2 * pad,
      },
      label,
      shownPx,
      amount,
    },
  }
}

/**
 * How far past its glyph an open badge reaches, growing from 0 as it opens:
 * what text beside it moves aside by.
 */
export const openReach = (m: BadgeMark): number =>
  m.open === null
    ? 0
    : m.open.amount * m.glyph.width * (GAP + PAD) + m.open.shownPx

/** The boxes a badge covers. */
export const badgeBoxes = (m: BadgeMark): ReadonlyArray<Box> =>
  m.open === null ? [m.glyph] : [m.open.pill]

export const STATUS_BADGE_DESIGNS = ["badge-v1"] as const

export const StatusBadgeParamsSchema = z.strictObject({
  badge: BadgeStateSchema,
  /** The states shown before this scene in the video: the renderer's. */
  badgesSeen: z.array(BadgeStateSchema).default([]),
})

export type StatusBadgeParams = z.infer<typeof StatusBadgeParamsSchema>

/** When the badge appears in its scene, after the scene's way in. */
export const STATUS_BADGE_LEAD_MS = 700

/** The glyph's size, at a type scale of 1 (`./geometry`). */
const STATUS_BADGE_PX = 48

/** The badge drawn once, for `frameAt` to time. */
export type StatusBadgeDrawing = {
  readonly state: BadgeState
  readonly at: { readonly x: number; readonly y: number }
  readonly glyphPx: number
  readonly opens: boolean
}

export type StatusBadgeFrame = { readonly marks: ReadonlyArray<BadgeMark> }

/** The badge at the top left of the body, where it fits open. */
export function drawStatusBadge(
  p: StatusBadgeParams,
  g: Geometry
): Parsed<StatusBadgeDrawing> {
  const body = g.regions.body
  const glyphPx = Math.round(STATUS_BADGE_PX * g.typeScale)
  const inset = glyphPx
  const open = badgeAt(p.badge, 0, 0, glyphPx, 1, 1).open
  if (open === null || open.pill.width + 2 * inset > body.width)
    return { ok: false, problems: ["the badge doesn't fit the body"] }
  return {
    ok: true,
    value: {
      state: p.badge,
      at: { x: body.x + inset, y: body.y + inset },
      glyphPx,
      opens: opening([p.badge], p.badgesSeen)[0] ?? false,
    },
  }
}

/** The badge `t` ms into its scene. */
export function statusBadgeAt(
  d: StatusBadgeDrawing,
  t: number
): StatusBadgeFrame {
  const since = t - STATUS_BADGE_LEAD_MS
  if (since < 0) return { marks: [] }
  return {
    marks: [
      badgeAt(
        d.state,
        d.at.x,
        d.at.y,
        d.glyphPx,
        Math.min(1, since / APPEAR_MS),
        d.opens ? openness(since) : 0
      ),
    ],
  }
}
