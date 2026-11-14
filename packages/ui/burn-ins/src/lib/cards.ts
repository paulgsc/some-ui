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
 */

import { z } from "zod"

import {
  APPEAR_MS,
  BadgesSeenSchema,
  opening,
  STATUS_BADGE_LEAD_MS,
  type BadgeState,
} from "./badge"
import { clamp01 } from "./captions/frame"
import type { Geometry } from "./geometry"
import { blocksOf, cardHeadline, kicker, type TextFrame } from "./journal"
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
  /** The first, after the scene's way in, as a status badge's. */
  leadMs: STATUS_BADGE_LEAD_MS,
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
  const x = clamp01((t - atMs) / APPEAR_MS)
  return { opacity: x, risePx: (1 - x) * ITEM.risePx }
}

/**
 * Which items' badges spell themselves out: the first of each state to
 * appear, by the items' times (`itemTimes`), ties in the order listed.
 */
export function badgesOpening(
  badges: ReadonlyArray<BadgeState | undefined>,
  times: ReadonlyArray<number>,
  seen: ReadonlyArray<BadgeState>
): ReadonlyArray<boolean> {
  const order = badges
    .map((_, i) => i)
    .sort((a, b) => (times[a] ?? 0) - (times[b] ?? 0) || a - b)
  const opens = opening(
    order.map((i) => badges[i]),
    seen
  )
  const byItem = badges.map(() => false)
  order.forEach((i, k) => {
    byItem[i] = opens[k] ?? false
  })
  return byItem
}

/** What every card's params carry beside its items. */
export const CardHeadSchema = z.object({
  kicker: z.string().default(""),
  title: z.string().min(1),
  badgesSeen: BadgesSeenSchema,
})

/** The time an item may name for itself, in ms into its card. */
export const ItemAtSchema = z.number().nonnegative().optional()

/**
 * A card's kicker and title, set in the header as a Build Journal card's;
 * refused, as every card's text is, when either gives a value.
 */
export function cardHeading(
  p: { readonly kicker: string; readonly title: string },
  g: Geometry
): Parsed<TextFrame> {
  const name = valueProblem(`${p.kicker}\n${p.title}`)
  if (name !== null)
    return {
      ok: false,
      problems: [
        `the heading gives ${name} a value; a card shows a placeholder, never a value`,
      ],
    }
  return blocksOf([
    ["kicker", kicker(p.kicker, g)],
    ["title", cardHeadline(p.title, g)],
  ])
}

/** A name being given something: `NAME=` at a word's start. */
const ASSIGNED = /(?:^|[\s;'"`(])([A-Za-z_][A-Za-z0-9_]*)=/g

const QUOTES = new Set(["'", '"', "`"])

/**
 * What follows an `=` at `from`: a quoted value whole (its quotes dropped,
 * a backtick's command included), else everything up to whitespace, `;`,
 * `)` or the end (a `<placeholder>` or `ENC[…]` read whole first), so
 * nothing can follow a placeholder unseen.
 */
function valueAt(text: string, from: number): string {
  const quote = text[from]
  if (quote !== undefined && QUOTES.has(quote)) {
    const end = text.indexOf(quote, from + 1)
    const inner = text.slice(from + 1, end === -1 ? undefined : end)
    return quote === "`" ? `\`${inner}\`` : inner
  }
  // A placeholder may hold spaces: read it whole, then whatever follows it.
  const rest = text.slice(from)
  const held = /^(?:<[^<>]*>|ENC\[[^\]]*\])/.exec(rest)?.[0] ?? ""
  return held + (/^[^\s;)]*/.exec(rest.slice(held.length))?.[0] ?? "")
}

const PLACEHOLDER = (v: string): boolean =>
  v === "" || v === "…" || /^<[^<>]*>$/.test(v) || /^ENC\[[^\]]*\]$/.test(v)

/** The name a line gives a value, when it gives one; null when it doesn't. */
export function valueProblem(text: string): string | null {
  for (const m of text.matchAll(ASSIGNED)) {
    const name = m[1]
    if (
      name !== undefined &&
      !PLACEHOLDER(valueAt(text, m.index + m[0].length))
    )
      return name
  }
  return null
}
