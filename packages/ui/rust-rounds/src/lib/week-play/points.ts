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

/** What a week's item is: a whole ticket, or one point of one. */
export type ItemOf = { readonly ticket: string; readonly point: number | null }

/** The ticket and point an item names; a ticket's key never holds `:`. */
export function itemOf(item: string): ItemOf {
  const at = item.lastIndexOf(":")
  if (at === -1) return { ticket: item, point: null }
  const point = Number(item.slice(at + 1))
  return Number.isInteger(point) && point >= 1
    ? { ticket: item.slice(0, at), point }
    : { ticket: item, point: null }
}

/**
 * A week's items: each ticket, and with `perPoint` each of its points after
 * it, in the week's order.
 */
export function weekItems(
  tickets: ReadonlyArray<{
    readonly id: string
    readonly speakTo: ReadonlyArray<string>
  }>,
  perPoint: boolean
): ReadonlyArray<string> {
  return tickets.flatMap((ticket) =>
    perPoint
      ? [
          ticket.id,
          ...ticket.speakTo.map((_, i) => pointItem(ticket.id, i + 1)),
        ]
      : [ticket.id]
  )
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
  /** It has a take of its own. */
  readonly taken: boolean
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
