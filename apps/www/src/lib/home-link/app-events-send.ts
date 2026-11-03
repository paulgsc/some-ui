/**
 * How the app events go home (CK2, #2381): each event waiting on this phone
 * (`@/lib/app-events`) once, one `PUT /app-events/:id` each, oldest first
 * (paulgsc/server `handlers::app_events`). Home answers with the event as
 * it holds it; one held exactly as sent leaves the phone, and nothing else
 * does, so nothing waiting is let go before home has it.
 *
 * An event home refuses (`422`, `409`) stays here and is not offered again
 * this page load; the next one offers it again. The lane is `./app-events`.
 */
import type { HomeCall, HomeExchanged } from "@some-ui/core-utils"
import { canonicalJson, isRecord, jsonOf } from "@some-ui/core-utils"

import type { AppEvent } from "@/lib/app-events"
import { appEventsWaiting, letGoHeldAppEvents } from "@/lib/app-events"

import type { LogReport } from "./leetype-log"
import { bucketOf, emptyLogReport } from "./leetype-log"
import { answerOrEnd, HomeUnansweredError } from "./shelf"

/** Ids home refused this page load: kept, not offered again until reload. */
const refusedThisLoad = new Set<string>()

/** Whether home's answer holds `event` exactly as sent. */
function holds(event: AppEvent, body: string): boolean {
  const parsed = jsonOf(body)
  return (
    isRecord(parsed) &&
    isRecord(parsed.event) &&
    canonicalJson(parsed.event) === canonicalJson(event)
  )
}

/**
 * Sends each of `going` through `send`, oldest first, into `report`, adding
 * to `held` each id home now holds as sent. Stops at the first send home
 * does not answer, as every log does (`./leetype-log`).
 */
async function sendAppEvents(
  going: ReadonlyArray<AppEvent>,
  send: HomeCall,
  report: LogReport,
  held: Set<string>
): Promise<void> {
  for (const event of [...going].reverse()) {
    const answer = await answerOrEnd(
      send,
      report,
      "PUT",
      `/app-events/${encodeURIComponent(event.id)}`,
      JSON.stringify(event)
    )
    if (answer === null) break
    const bucket = bucketOf(answer.status)
    if (bucket !== "held") {
      report[bucket] += 1
      if (bucket === "refused") refusedThisLoad.add(event.id)
      continue
    }
    if (holds(event, answer.body)) {
      report.held += 1
      held.add(event.id)
    } else {
      report.differs += 1
    }
  }
}

/** One exchange: what waits goes, and what home holds leaves the phone. */
export async function exchangeAppEvents(
  send: HomeCall
): Promise<HomeExchanged> {
  const report = emptyLogReport()
  const going = appEventsWaiting().filter((e) => !refusedThisLoad.has(e.id))
  const held = new Set<string>()
  try {
    await sendAppEvents(going, send, report, held)
  } finally {
    // What home holds, as this run heard it, however the run ended.
    letGoHeldAppEvents(held)
  }
  if (report.forgotten) return { kind: "forgotten" }
  if (report.unreachable) throw new HomeUnansweredError()
  return report.refused + report.other + report.differs > 0
    ? { kind: "failed", why: "refused" }
    : { kind: "synced" }
}
