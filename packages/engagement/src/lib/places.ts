/**
 * Where on an affordance the owner is, as the vocabulary sees it: one of its
 * places on screen, with the app in front, is a `taken`; going from it
 * (another place, the screen gone, the app put away) is a `left` naming the
 * place and when it started (`startedAt`). Home reads time in a place as `at`
 * less `startedAt`, and a place finished or left part-way from which place a
 * `left` names (WALK5's friction, the owner's C861).
 *
 * One runtime for every screen that moves through places (C830): Rust
 * Rounds' week tickets (RR14, `ticket-1` …), a Jobs pick's steps, the
 * interview week's pages. A place is one of the affordance's own `places`
 * (`registry.ts`), never an item's key: an event carries no item content.
 *
 * - **Pure step.** `stepPlace` takes what is on screen now and returns the
 *   events and what is open after.
 * - **Runtime.** `createPlaces` holds what is open, and `watchPlaces` closes
 *   it while the page is hidden and opens it again when it is shown.
 * - **A place's `taken` is the place coming on screen.** On an affordance a
 *   visit also takes (a pick opened from Jobs' Today), the visit's take and
 *   each place's are both `taken`: a read of takes per offer counts the
 *   visit's, and a place's is the one a `left` naming a place follows.
 */
import type { EngagementEvent, Surface } from "@engagement/lib/events"
import { engage } from "@engagement/lib/sink"
import type { VisitPage } from "@engagement/lib/visit"

/** The affordance a place is of. */
export type PlaceOf = {
  readonly pipeline: string
  readonly affordance: string
  readonly surface: Surface
}

/** The place on screen, and since when, or none. */
export type OpenPlace<P extends string> = {
  readonly place: P
  readonly since: string
} | null

/** `open` moved to `now` (null: no place of it on screen) at `at`: the events, and what is open after. */
export function stepPlace<P extends string>(
  of: PlaceOf,
  open: OpenPlace<P>,
  now: P | null,
  at: string
): {
  readonly open: OpenPlace<P>
  readonly events: ReadonlyArray<EngagementEvent>
} {
  if (open?.place === now) return { open, events: [] }
  const events: Array<EngagementEvent> = []
  if (open !== null) {
    events.push({
      ...of,
      at,
      kind: "left",
      startedAt: open.since,
      place: open.place,
    })
  }
  if (now === null) return { open: null, events }
  events.push({ ...of, at, kind: "taken" })
  return { open: { place: now, since: at }, events }
}

/** The runtime a screen holds for an affordance's places. */
export type Places<P extends string> = {
  /** The place now on screen, or null when none of the affordance's is. */
  readonly at: (place: P | null) => void
  /** The app went to the back (true) or came to the front (false). */
  readonly hidden: (hidden: boolean) => void
}

export function createPlaces<P extends string>(
  of: PlaceOf,
  clock: () => Date = () => new Date(),
  send: (event: EngagementEvent) => void = engage
): Places<P> {
  let open: OpenPlace<P> = null
  let shown: P | null = null
  let away = false
  const move = (): void => {
    const next = stepPlace(of, open, away ? null : shown, clock().toISOString())
    open = next.open
    for (const event of next.events) send(event)
  }
  return {
    at: (place): void => {
      shown = place
      move()
    },
    hidden: (hidden): void => {
      away = hidden
      move()
    },
  }
}

/**
 * Follows `page`'s visibility for `places`; the returned stop leaves the
 * place on screen, as the screen closes.
 */
export function watchPlaces<P extends string>(
  places: Places<P>,
  page: VisitPage
): () => void {
  const seen = (): void => {
    places.hidden(page.visibilityState === "hidden")
  }
  seen()
  page.addEventListener("visibilitychange", seen)
  return (): void => {
    page.removeEventListener("visibilitychange", seen)
    places.at(null)
  }
}
