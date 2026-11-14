/**
 * What the cards (epic CARDS, #2465) share: a full-frame card over a bare
 * scene, whose kicker and title sit in the header as a Build Journal card's
 * do, whose items (a terminal's lines, a cheat sheet's rows, a flow's
 * steps) appear one at a time in the body, each with an optional status
 * badge (`./badge`), and whose text never carries a value.
 *
 * **The values rule** (the epic's decision 3): a card is published, and
 * every env var is a secret (paulgsc/server #613), so `valueProblem` refuses
 * text shaped like `NAME=something` unless the right side is empty, `…`, a
 * `<placeholder>` or `ENC[…]`.
 *
 * **The stamp** (CARDS4, #2469): `as of <repo>@<commit> · <date>`, in the
 * monospace at the foot of every card's body, right-aligned. A card's
 * params carry it, but the cut list writes it once and the renderer gives it
 * to every card (`@some-ui/video-render`'s `stamp.ts`).
 */

import { z } from "zod"

import { APPEAR_MS, BadgeStateSchema, opening, type BadgeState } from "./badge"
import type { Box, Geometry } from "./geometry"
import { blocksOf, cardHeadline, INK, kicker, type TextFrame } from "./journal"
import { monoWidth } from "./mono"
import type { Parsed } from "./parsed"

/** The cards' own colours beside the Build Journal's `INK`. Video colours, so literals. */
export const CARD_INK = {
  /** A terminal window's ground. */
  window: "#0f151c",
  /** A command, a keyword. */
  key: "#9cc8e0",
} as const

/** When the items appear, unless an item says. */
export const ITEM = {
  /** The first, after the scene's way in. */
  leadMs: 700,
  /** Between one and the next. */
  gapMs: 1150,
  /** How far an item rises as it fades in. */
  risePx: 14,
} as const

/** Each item's time: its own, else the lead and one gap after the one before. */
export function itemTimes(
  given: ReadonlyArray<number | undefined>
): ReadonlyArray<number> {
  const times: Array<number> = []
  for (const at of given) {
    const before = times.at(-1)
    times.push(at ?? (before === undefined ? ITEM.leadMs : before + ITEM.gapMs))
  }
  return times
}

/** An item `t` ms into its card, given when it appears: faded in and risen. */
export function appearing(
  t: number,
  atMs: number
): { readonly opacity: number; readonly risePx: number } {
  const x = Math.min(1, Math.max(0, (t - atMs) / APPEAR_MS))
  return { opacity: x, risePx: (1 - x) * ITEM.risePx }
}

/** Each item's badge, and which of them spells itself out (`./badge`). */
export function badgesOpening(
  badges: ReadonlyArray<BadgeState | undefined>,
  seen: ReadonlyArray<BadgeState>
): ReadonlyArray<boolean> {
  const shown = badges.flatMap((b) => (b === undefined ? [] : [b]))
  const opens = opening(shown, seen)
  let k = 0
  return badges.map((b) => (b === undefined ? false : (opens[k++] ?? false)))
}

/** The commits a card was checked against, `owner/repo@sha`, and the day. */
export const StampSchema = z.strictObject({
  sources: z
    .array(z.string().regex(/^[\w.-]+\/[\w.-]+@[0-9a-f]{7,40}$/))
    .min(1)
    .max(3),
  date: z.iso.date(),
})

/** What every card's params carry beside its items. */
export const CardHeadSchema = z.object({
  kicker: z.string().default(""),
  title: z.string().min(1),
  /** The states shown before this card in the video: the renderer's. */
  badgesSeen: z.array(BadgeStateSchema).default([]),
  /** The cut list's stamp: the renderer's. */
  stamp: StampSchema,
})

/** The stamp's type, in the frame's pixels. */
export const STAMP_TYPE = { sizePx: 18, lineHeightPx: 24 } as const

/** The strip at the foot of a card's body the stamp sits in. */
const STAMP_ROW = STAMP_TYPE.lineHeightPx + 8

/** The stamp as drawn: its words, and the box they take. */
export type StampLine = { readonly text: string; readonly box: Box }

/** Where a card's items go: its body, above the stamp. */
export const cardBody = (g: Geometry): Box => ({
  ...g.regions.body,
  height: g.regions.body.height - STAMP_ROW,
})

/** The stamp's words: `as of paulgsc/dotfiles@91cb11b · 2026-11-13`. */
export const stampText = (s: z.infer<typeof StampSchema>): string =>
  `as of ${[...s.sources, s.date].join(" · ")}`

/** The stamp, right-aligned at the foot of the body. */
export function drawStamp(
  s: z.infer<typeof StampSchema>,
  g: Geometry
): Parsed<StampLine> {
  const body = g.regions.body
  const text = stampText(s)
  const width = monoWidth(text, STAMP_TYPE.sizePx)
  if (width > body.width)
    return { ok: false, problems: ["the stamp doesn't fit"] }
  return {
    ok: true,
    value: {
      text,
      box: {
        x: body.x + body.width - width,
        y: body.y + body.height - STAMP_TYPE.lineHeightPx,
        width,
        height: STAMP_TYPE.lineHeightPx,
      },
    },
  }
}

/** The stamp's colour: muted, as a comment is. */
export const STAMP_COLOUR = INK.muted

/** The time an item may name for itself, in ms into its card. */
export const ItemAtSchema = z.number().nonnegative().optional()

/** A card's kicker and title, set in the header as a Build Journal card's. */
export const cardHeading = (
  p: { readonly kicker: string; readonly title: string },
  g: Geometry
): Parsed<TextFrame> =>
  blocksOf([
    ["kicker", kicker(p.kicker, g)],
    ["title", cardHeadline(p.title, g)],
  ])

const VALUE =
  /(?:^|[\s;'"`(])([A-Za-z_][A-Za-z0-9_]*)=(<[^<>]*>|ENC\[[^\]]*\]|[^\s'"`;)]*)/g

const PLACEHOLDER = (v: string): boolean =>
  v === "" || v === "…" || /^<[^<>]*>$/.test(v) || /^ENC\[[^\]]*\]$/.test(v)

/** The name a line gives a value, when it gives one; null when it doesn't. */
export function valueProblem(text: string): string | null {
  for (const m of text.matchAll(VALUE)) {
    const [, name, value] = m
    if (name !== undefined && !PLACEHOLDER(value ?? "")) return name
  }
  return null
}
