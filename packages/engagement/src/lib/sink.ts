/**
 * Where a pipeline sends what the owner did with an affordance (ENGAGE ENG2,
 * #2535): one sink per page, which the app sets once (www's
 * `installAppEvents`, which keeps each event for home on the app-events
 * pipe). A pipeline's runtime calls `engage` and never learns where the
 * event goes.
 *
 * The app sets the sink as it boots, after a screen may already have
 * offered something, so until then each event waits here, at most
 * `EARLY_WAITING` of them, and goes to the sink once it is set. Where no
 * sink is ever set (the desktop web and the Pages build keep no app events
 * today), they wait here until the page closes.
 */
import type { EngagementEvent } from "@engagement/lib/events"

export type EngagementSink = (event: EngagementEvent) => void

/** How many events wait for the sink; one more than this is not kept. */
export const EARLY_WAITING = 200

let sink: EngagementSink | null = null
const early: Array<EngagementEvent> = []

export function setEngagementSink(next: EngagementSink | null): void {
  sink = next
  if (next === null) return
  for (const event of early.splice(0)) next(event)
}

export function engage(event: EngagementEvent): void {
  if (sink !== null) sink(event)
  else if (early.length < EARLY_WAITING) early.push(event)
}
