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
 * Pure: `stepOpens` takes what is on screen now and returns the events,
 * through ENGAGE's one places step (`stepPlace`).
 */
import type { OpenPlace, PlaceOf } from "@some-ui/engagement"
import { stepPlace } from "@some-ui/engagement"

const WEEK_TICKET: PlaceOf = {
  pipeline: "rust-rounds",
  affordance: "week-ticket",
  surface: "apk",
}

/** The ticket on screen, by its place in the week, and since when. */
export type Open = OpenPlace<string>

/** What is on screen: a ticket's card by its place (0-based), or none. */
export type OnScreen = number | null

/** The place a ticket's `left` names. */
const placeOf = (index: number): string => `ticket-${String(index + 1)}`

/** `open` moved to `now` at `at`: the events, and what is open after (ENGAGE's `stepPlace`). */
export const stepOpens = (
  open: Open,
  now: OnScreen,
  at: string
): ReturnType<typeof stepPlace<string>> =>
  stepPlace(WEEK_TICKET, open, now === null ? null : placeOf(now), at)
