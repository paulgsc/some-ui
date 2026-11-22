/**
 * The colours of the Cooking page are an algebra (C1119): a blocking stop's
 * theme is Holder × Urgency. Who holds it sets the hue; how urgent it is sets
 * the weight. Only a train's current stop has an urgency: now when another
 * live train waits on this one, whenever when the record marks the step as
 * one the owner may take when they like, today otherwise. The bar at the top
 * shows the one most urgent blocker: by urgency, then the owner before
 * Claude, the checks and home, then the longest waiting. Pure; the classes
 * each theme draws with are the component's (`components/cooking/theme.ts`),
 * one per member of the product, so the table is total by its type.
 */
import type { Holder, Stop, Train } from "./model"
import { bySince, hereOf, HOLDERS } from "./model"

const URGENCIES = ["now", "today", "whenever"] as const

export type Urgency = (typeof URGENCIES)[number]

/** The trains that wait on `train` at a stop not yet passed. */
export const waitingOn = (
  train: Train,
  trains: ReadonlyArray<Train>
): Array<Train> =>
  trains.filter((other) =>
    other.stops.some(
      (s) =>
        s.state !== "passed" &&
        s.link?.kind === "goal" &&
        s.link.goal === train.id
    )
  )

/** A train's urgency where it stands; `null` once it has arrived. */
export function urgencyOf(
  train: Train,
  trains: ReadonlyArray<Train>
): Urgency | null {
  if (train.arrived) return null
  if (hereOf(train).canWait) return "whenever"
  return waitingOn(train, trains).length > 0 ? "now" : "today"
}

/** One train's blocker: where it stands, who holds it, how urgent it is. */
export type Blocker = {
  readonly train: Train
  readonly stop: Stop
  readonly holder: Holder
  readonly urgency: Urgency
}

/** Every train not yet arrived, most urgent blocker first. */
export function blockers(trains: ReadonlyArray<Train>): Array<Blocker> {
  return trains
    .flatMap((train): Array<Blocker> => {
      const urgency = urgencyOf(train, trains)
      const stop = hereOf(train)
      return urgency === null || stop.holder === null
        ? []
        : [{ train, stop, holder: stop.holder, urgency }]
    })
    .sort(
      (a, b) =>
        URGENCIES.indexOf(a.urgency) - URGENCIES.indexOf(b.urgency) ||
        HOLDERS.indexOf(a.holder) - HOLDERS.indexOf(b.holder) ||
        bySince(a.stop.since, b.stop.since) ||
        (a.train.id < b.train.id ? -1 : 1)
    )
}
