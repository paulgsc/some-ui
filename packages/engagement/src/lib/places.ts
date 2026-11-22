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
 * - **Where it went (`next`, the owner's answer to #3367).** A move to
 *   another of the affordance's places names it (`decide`). A screen closing
 *   names the place that comes on screen next, in the same turn of the event
 *   loop, with its affordance (`today.today`), when the screen holds the
 *   shared `SCREEN_HANDOFF` (www's screens do): the next screen mounts as the
 *   last unmounts. A registry id has no dot, so a `next` with one is always
 *   another screen's. A screen closing to anything else (another pipeline, a
 *   screen that names no place, one still loading, or a runtime with no
 *   shared hand-off) says `elsewhere`. Only the app going to the back leaves
 *   `next` out, so a `left` without one is a stretch split by putting the
 *   app away, or an older build's.
 * - **A place's `taken` is the place coming on screen.** On an affordance a
 *   visit also takes (a pick opened from Jobs' Today), the visit's take and
 *   each place's are both `taken`: a read of takes per offer counts the
 *   visit's, and a place's is the one a `left` naming a place follows.
 */
import type { EngagementEvent, Surface } from "@engagement/lib/events"
import { ELSEWHERE } from "@engagement/lib/events"
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
      ...(now === null ? {} : { next: now }),
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

type LeftEvent = Extract<EngagementEvent, { kind: "left" }>

/**
 * Where a closed screen's `left` waits for the screen that comes on next:
 * `hold` keeps it until `enter` names the affordance whose place came on
 * screen, or until the turn ends (`defer`), when it is sent as it is.
 */
export type Handoff = {
  readonly hold: (
    left: LeftEvent,
    send: (event: EngagementEvent) => void
  ) => void
  readonly enter: (of: PlaceOf, place: string) => void
}

type Entered = { readonly of: PlaceOf; readonly place: string }

/** The `left` held, gone to `to` (or nowhere known): a place named only within its pipeline and surface. */
function wentTo(left: LeftEvent, to: Entered | null): LeftEvent {
  return {
    ...left,
    next:
      to !== null &&
      to.of.pipeline === left.pipeline &&
      to.of.surface === left.surface
        ? `${to.of.affordance}.${to.place}`
        : ELSEWHERE,
  }
}

export function createHandoff(
  defer: (run: () => void) => void = queueMicrotask
): Handoff {
  let held: Array<{
    left: LeftEvent
    send: (event: EngagementEvent) => void
  }> = []
  const flush = (to: Entered | null): void => {
    const now = held
    held = []
    // Each is sent even if one before it throws: none is held twice.
    const failed: Array<unknown> = []
    for (const { left, send } of now) {
      try {
        send(wentTo(left, to))
      } catch (error) {
        failed.push(error)
      }
    }
    if (failed.length > 0) throw failed[0]
  }
  return {
    hold: (left, send): void => {
      held.push({ left, send })
      if (held.length === 1) defer(() => flush(null))
    },
    enter: (of, place): void => flush({ of, place }),
  }
}

/** The one hand-off every screen's places share, as one screen follows another. */
export const SCREEN_HANDOFF: Handoff = createHandoff()

/** No hand-off: a closed screen's `left` is sent at once, gone `elsewhere`. */
const AT_ONCE: Handoff = {
  hold: (left, send): void => {
    send(wentTo(left, null))
  },
  enter: (): void => undefined,
}

export function createPlaces<P extends string>(
  of: PlaceOf,
  clock: () => Date = () => new Date(),
  send: (event: EngagementEvent) => void = engage,
  handoff: Handoff = AT_ONCE
): Places<P> {
  let open: OpenPlace<P> = null
  let shown: P | null = null
  let away = false
  const move = (): void => {
    const now = away ? null : shown
    const next = stepPlace(of, open, now, clock().toISOString())
    open = next.open
    for (const event of next.events) {
      // The screen closed (not the app put away): where it went is the
      // next place to come on, if one does this turn.
      if (event.kind === "left" && now === null && !away)
        handoff.hold(event, send)
      else {
        if (event.kind === "taken" && now !== null) handoff.enter(of, now)
        send(event)
      }
    }
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
