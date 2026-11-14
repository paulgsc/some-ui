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
import { missingChar } from "./mono"
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
  // Each alone, and joined as the eye reads them across the break when the
  // kicker leaves a value open (`KEY=`, an unclosed quote), so a value can't
  // open in the kicker and close in the title.
  const open =
    /=\s*$/.test(p.kicker) ||
    [`"`, `'`, "`"].some((q) => p.kicker.split(q).length % 2 === 0)
  const name =
    valueProblem(p.kicker) ??
    valueProblem(p.title) ??
    (open ? valueProblem(`${p.kicker}${p.title}`) : null)
  if (name !== null)
    return { ok: false, problems: [givesValue("the heading", name)] }
  return blocksOf([
    ["kicker", kicker(p.kicker, g)],
    ["title", cardHeadline(p.title, g)],
  ])
}

const givesValue = (what: string, name: string): string =>
  `${what} gives ${name} a value; a card shows a placeholder, never a value`

/**
 * Why an item's words, named `what`, can't be shown: `mono`, its words in the
 * cards' monospace, has a character that type can't draw, or `text`, all its
 * words, gives a value. Null when neither.
 */
export function wordsProblem(
  what: string,
  mono: string,
  text: string
): string | null {
  const missing = missingChar(mono)
  if (missing !== null)
    return `${what} has "${missing}", which the card's type can't draw`
  const name = valueProblem(text)
  return name === null ? null : givesValue(what, name)
}

/** A name being given something: `NAME=` at a word's start. */
const ASSIGNED = /(?:^|[\s;'"`(])([A-Za-z_][A-Za-z0-9_]*)=/g

const QUOTES = new Set(["'", '"', "`"])

/** Text up to whitespace, `;`, `)` or the end. */
const BARE = /^[^\s;)]*/

/**
 * What follows an `=` at `from`, as the shell joins it: a quoted part read
 * whole (its quotes dropped, a backtick's command kept), or a
 * `<placeholder>` or `ENC[…]` read whole, then everything up to
 * whitespace, `;`, `)` or the end, so nothing rides after either unseen.
 * `end` is where the value stops.
 */
function valueAt(
  text: string,
  from: number
): { readonly value: string; readonly end: number } {
  const quote = text[from]
  const quoted = quote !== undefined && QUOTES.has(quote)
  const close = quoted ? text.indexOf(quote, from + 1) : -1
  const inner = text.slice(from + 1, close === -1 ? undefined : close)
  // Unquoted, a placeholder may hold spaces: read it whole.
  const head = !quoted
    ? (/^(?:<[^<>\n]*>|ENC\[[^\]\n]*\])/.exec(text.slice(from))?.[0] ?? "")
    : quote === "`"
      ? `\`${inner}\``
      : inner
  const at = !quoted
    ? from + head.length
    : close === -1
      ? text.length
      : close + 1
  const tail = BARE.exec(text.slice(at))?.[0] ?? ""
  return { value: head + tail, end: at + tail.length }
}

const PLACEHOLDER = (v: string): boolean =>
  v === "" || v === "…" || /^<[^<>\n]*>$/.test(v) || /^ENC\[[^\]\n]*\]$/.test(v)

/** The name a line gives a value, when it gives one; null when it doesn't. */
export function valueProblem(text: string): string | null {
  // An assignment inside a value already read (`<vault, path=prod>`) is that
  // value's text, not an assignment of its own.
  let read = 0
  for (const m of text.matchAll(ASSIGNED)) {
    const name = m[1]
    if (name === undefined || m.index < read) continue
    const { value, end } = valueAt(text, m.index + m[0].length)
    if (!PLACEHOLDER(value)) return name
    read = end
  }
  return null
}
