/**
 * How the app events go home (CK2, #2381): each event waiting on this phone
 * (`@/lib/app-events`) once, oldest first, by `sendWhole` (paulgsc/server
 * `handlers::app_events`). One home holds exactly as sent leaves the phone,
 * and nothing else does. One home refuses stays here and is not offered
 * again this page load. The lane is `./app-events`.
 */
import type { HomeCall, HomeExchanged } from "@some-ui/core-utils"

import type { AppEvent } from "@/lib/app-events"
import { appEventsWaiting, letGoHeldAppEvents } from "@/lib/app-events"

import type { WholeLane } from "./leetype-log"
import { emptyLogReport, sendWhole } from "./leetype-log"
import { endedPart } from "./shelf"

const APP_EVENTS: WholeLane<AppEvent> = {
  path: "/app-events",
  wire: (event) => event,
  key: "event",
  id: (event) => event.id,
}

/** Ids home refused this page load: kept, not offered again until reload. */
const refusedThisLoad = new Set<string>()

/** One exchange: what waits goes, and what home holds leaves the phone. */
export async function exchangeAppEvents(
  send: HomeCall
): Promise<HomeExchanged> {
  const report = emptyLogReport()
  const going = appEventsWaiting()
    .filter((e) => !refusedThisLoad.has(e.id))
    .reverse()
  const held = new Set<string>()
  try {
    await sendWhole(
      APP_EVENTS,
      going,
      send,
      report,
      (id) => held.add(id),
      (id) => refusedThisLoad.add(id)
    )
  } finally {
    // What home holds, as this run heard it, however the run ended.
    letGoHeldAppEvents(held)
  }
  return (
    endedPart(report) ??
    (report.refused + report.other + report.differs > 0
      ? { kind: "failed", why: "refused" }
      : { kind: "synced" })
  )
}
