/**
 * Where a pipeline sends what the owner did with an affordance (ENGAGE ENG2,
 * #2533): one sink per page, which the app sets once (www's
 * `installAppEvents`, which keeps each event for home on the app-events
 * pipe). A pipeline's runtime calls `engage` and never learns where the event
 * goes; with no sink set (a test, a package's own story), it goes nowhere.
 */
import type { EngagementEvent } from "@engagement/lib/events"

export type EngagementSink = (event: EngagementEvent) => void

let sink: EngagementSink | null = null

/** Sets the page's sink; null takes it away. */
export function setEngagementSink(next: EngagementSink | null): void {
  sink = next
}

/** Hands `event` to the page's sink, if there is one. */
export function engage(event: EngagementEvent): void {
  sink?.(event)
}
