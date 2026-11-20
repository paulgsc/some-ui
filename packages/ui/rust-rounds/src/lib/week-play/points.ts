/**
 * A ticket answered point by point (RR24, paulgsc/some-ui#3248), as plain
 * data: each speak-to point is a bundle item of its own, so each is
 * recorded, redone and let go on its own, and a take names its point in its
 * `ref`, `<week>:<ticket>:<n>` from 1, which is how home and the essay know
 * which point it answers: never by splitting a take or guessing.
 *
 * A ticket's own item (`<ticket>`, a take of the whole ticket, as every take
 * was before RR24) stays an item too, so a take recorded that way still
 * shows, counts for every point, and is sent; nothing records one any more.
 *
 * The points of a ticket shown on its card: all, those with a take or
 * those with none, as asked or those with none first (`pointsShown`), with
 * their counts. A point with no take is named neutrally (`none`): today it
 * reads as not said, and under RR29 (#3257) as going with the recommended;
 * only the words say which.
 */

/** The bundle item of `ticket`'s point `n` (from 1): `QM-312:2`. */
export const pointItem = (ticket: string, n: number): string => `${ticket}:${n}`

/**
 * Where `ticket` opens among a week's `items`: its first point, answered
 * point by point (RR24), else its own item; -1 when it has neither.
 */
export function firstItemOf(
  items: ReadonlyArray<string>,
  ticket: string
): number {
  const point = items.indexOf(pointItem(ticket, 1))
  return point === -1 ? items.indexOf(ticket) : point
}

/**
 * The bundle item of the opening's question `n` (#3269, from 1):
 * `opening:2`, so its take's ref is `<week>:opening:<n>` (C736). A ticket's
 * id is capitals, digits and a dash (`TB-101`), so it never reads as one.
 */
export const openingItem = (n: number): string => `opening:${n}`

/** The opening's question an item answers, from 1; null for a ticket's item. */
export function openingOf(item: string): number | null {
  const found = /^opening:([1-9])$/.exec(item)
  return found === null ? null : Number(found[1])
}

/**
 * What a week's item is: a whole ticket, or one point of one. An opening's
 * item stands on its own, as a whole ticket's does: its `ticket` is the
 * item itself, `opening:<n>`, which is also its place on the flow's line.
 */
export type ItemOf = { readonly ticket: string; readonly point: number | null }

/** The ticket and point an item names; a ticket's key never holds `:`. */
export function itemOf(item: string): ItemOf {
  if (openingOf(item) !== null) return { ticket: item, point: null }
  const at = item.lastIndexOf(":")
  if (at === -1) return { ticket: item, point: null }
  const point = Number(item.slice(at + 1))
  return Number.isInteger(point) && point >= 1
    ? { ticket: item.slice(0, at), point }
    : { ticket: item, point: null }
}

/**
 * A week's items: the opening's questions first (`openings` of them, 0
 * where the week has none or this build sends none), then each ticket, and
 * with `perPoint` each of its points after it, in the week's order.
 */
export function weekItems(
  tickets: ReadonlyArray<{
    readonly id: string
    readonly forks: ReadonlyArray<{ readonly question: string }>
  }>,
  perPoint: boolean,
  openings = 0
): ReadonlyArray<string> {
  return [
    ...Array.from({ length: openings }, (_, i) => openingItem(i + 1)),
    ...tickets.flatMap((ticket) =>
      perPoint
        ? [
            ticket.id,
            ...ticket.forks.map((_, i) => pointItem(ticket.id, i + 1)),
          ]
        : [ticket.id]
    ),
  ]
}

/** Which of a ticket's points its card lists: all, with a take, or with none. */
export type PointFilter = "all" | "taken" | "none"

/** In what order: as the ticket asks them, or those with no take first. */
export type PointOrder = "asked" | "none-first"

/** One point, as its card lists it. */
export type PointShown = {
  /** From 1. */
  readonly n: number
  readonly to: string
  /** It is answered: by a take of its own, or one of its whole ticket. */
  readonly taken: boolean
}

/**
 * A ticket's points as its card lists them: `own(n)` says whether point `n`
 * has a take of its own, and a take of the whole ticket (`whole`) answers
 * every point it has, so each counts as answered.
 */
export function ticketPoints(
  questions: ReadonlyArray<string>,
  own: (n: number) => boolean,
  whole: boolean
): ReadonlyArray<PointShown> {
  return questions.map((to, i) => ({
    n: i + 1,
    to,
    taken: whole || own(i + 1),
  }))
}

/** How many points each filter shows. */
export type PointCounts = Readonly<Record<PointFilter, number>>

export function pointCounts(points: ReadonlyArray<PointShown>): PointCounts {
  const taken = points.filter((point) => point.taken).length
  return { all: points.length, taken, none: points.length - taken }
}

/**
 * The points `filter` shows, in `order`; a stable order within each. The
 * open point, `open`, is always shown, so a filter never hides the take
 * being made or its redo and let go.
 */
export function pointsShown(
  points: ReadonlyArray<PointShown>,
  filter: PointFilter,
  order: PointOrder,
  open: number
): ReadonlyArray<PointShown> {
  const kept = points.filter(
    (point) =>
      point.n === open ||
      filter === "all" ||
      (filter === "taken" ? point.taken : !point.taken)
  )
  return order === "asked"
    ? kept
    : [
        ...kept.filter((point) => !point.taken),
        ...kept.filter((point) => point.taken),
      ]
}

/** A card lists its filter once a ticket has more points than fit at a glance. */
export const FILTER_FROM = 4
