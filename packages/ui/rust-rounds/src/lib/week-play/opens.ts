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
 * Pure: `stepOpens` takes what is on screen now and returns the events.
 */
import type { EngagementEvent } from "@some-ui/engagement"

/** The ticket on screen, by its place (0-based) in the week, and since when. */
export type Open = { readonly place: number; readonly since: string } | null

/** What is on screen: a ticket's card by its place, or none. */
export type OnScreen = number | null

const stamp = (
  at: string
): Pick<EngagementEvent, "pipeline" | "affordance" | "surface" | "at"> => ({
  pipeline: "rust-rounds",
  affordance: "week-ticket",
  surface: "apk",
  at,
})

/** The place a ticket's `left` names. */
const placeOf = (index: number): string => `ticket-${String(index + 1)}`

/** `open` moved to `now` at `at`: the events, and what is open after. */
export function stepOpens(
  open: Open,
  now: OnScreen,
  at: string
): { readonly open: Open; readonly events: ReadonlyArray<EngagementEvent> } {
  if (open?.place === now) return { open, events: [] }
  const events: Array<EngagementEvent> = []
  if (open !== null) {
    events.push({
      ...stamp(at),
      kind: "left",
      startedAt: open.since,
      place: placeOf(open.place),
    })
  }
  if (now === null) return { open: null, events }
  events.push({ ...stamp(at), kind: "taken" })
  return { open: { place: now, since: at }, events }
}
