/**
 * Each time a ticket of the week is opened (RR14, paulgsc/some-ui#2689), as
 * ENGAGE's events (`@some-ui/engagement`, pipeline `rust-rounds`, affordance
 * `week-ticket`), so home counts a ticket's opens from the one app-events
 * pipe (CK2) rather than a counter of its own:
 *
 * - **An open is the ticket's card on screen**, with the app in front: one
 *   `taken` when it comes on, and one `left` when it goes (another card, the
 *   brief or the look-over, the app put away, the screen gone), whose place is
 *   the ticket's place in the week's order (`ticket-1` …), never its key: an
 *   event carries no item content.
 * - **Home counts the `left`s** of a place within the week's dates, so an open
 *   the app was killed in counts once it is never left.
 *
 * Through ENGAGE's one places runtime (`createPlaces`): the ticket's place
 * on screen, and the app at the back.
 */
import type { EngagementEvent } from "@some-ui/engagement"
import { createPlaces } from "@some-ui/engagement"

/** A week's ticket on screen, by its place (0-based), or none; and the app at the back. */
export type TicketOpens = {
  readonly at: (ticket: number | null) => void
  readonly hidden: (hidden: boolean) => void
}

/** The week's ticket opens, through ENGAGE's one places runtime (`createPlaces`). */
export function ticketOpens(
  clock: () => Date,
  send: (event: EngagementEvent) => void
): TicketOpens {
  const places = createPlaces(
    { pipeline: "rust-rounds", affordance: "week-ticket", surface: "apk" },
    clock,
    send
  )
  return {
    at: (ticket): void => {
      places.at(ticket === null ? null : `ticket-${String(ticket + 1)}`)
    },
    hidden: places.hidden,
  }
}
