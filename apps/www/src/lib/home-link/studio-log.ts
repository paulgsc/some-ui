/**
 * The Studio part of the one drain (`./drain`, LA15; STUDIO ST9): each
 * sitting of the phone's time log that home does not hold as it is now, one
 * PUT per event, then one read of the sitting back, compared event by event,
 * as LeetType's sessions go (`./leetype-log`); then each sitting's answer to
 * "How did that go?" that home does not hold yet, one PUT each
 * (paulgsc/server `routes::studio_log`). Phone to home only: the phone
 * keeps its whole log and every answer.
 */
import type { HomeCall } from "@some-ui/core-utils"
import { canonicalJson } from "@some-ui/core-utils"
import type { Friction, Project, Sitting, TimeEvent } from "@some-ui/soundbites"

import type { EventLog, LogReport } from "./leetype-log"
import { bucketOf, sendLogs } from "./leetype-log"
import type { Sent } from "./sent"
import { digestOf } from "./sent"
import { answerOrEnd } from "./shelf"

/** A sitting's answer, as home keeps it. */
export type StudioReport = {
  readonly id: string
  readonly at: string
  readonly sitting: string
  readonly kind: "record"
  readonly how: "smooth" | "some_snags" | "rough"
  readonly cause?: string
  readonly shot?: string
}

/** What a send carries of Studio's record. */
export type StudioGoing = {
  readonly sittings: ReadonlyArray<EventLog>
  readonly reports: ReadonlyArray<StudioReport>
}

const HOW = {
  smooth: "smooth",
  snags: "some_snags",
  rough: "rough",
} as const satisfies Record<Friction["went"], StudioReport["how"]>

/** `sent.studio`'s key for a report, beside the sittings' keys. */
const reportKey = (id: string): string => `report:${id}`

/** Each sitting of `events`, in the order first logged. */
function sittingsOf(events: ReadonlyArray<TimeEvent>): Array<EventLog> {
  const sittings = new Map<string, Array<TimeEvent>>()
  for (const event of events) {
    sittings.set(event.sitting, [...(sittings.get(event.sitting) ?? []), event])
  }
  return [...sittings].map(([name, logged]) => ({ name, events: logged }))
}

/**
 * Each answer as home is told it, named by its sitting as the time log
 * names it (`keyOf`, soundbites' `sittingKey`); an answer whose sitting the
 * projects no longer name is left out.
 */
export function reportsOf(
  friction: ReadonlyArray<Friction>,
  projects: ReadonlyArray<Project>,
  keyOf: (sitting: Sitting) => string
): Array<StudioReport> {
  return friction.flatMap((answer) => {
    const sitting = projects
      .find((project) => project.id === answer.project)
      ?.sittings.find((each) => each.id === answer.sitting)
    if (sitting === undefined) return []
    const key = keyOf(sitting)
    return [
      {
        id: key,
        at: answer.at,
        sitting: key,
        kind: "record",
        how: HOW[answer.went],
        ...(answer.gotInTheWay === null ? {} : { cause: answer.gotInTheWay }),
        ...(answer.shot === null ? {} : { shot: answer.shot }),
      },
    ]
  })
}

/** What of Studio's record home does not hold as it is now. */
export function studioToSend(
  events: ReadonlyArray<TimeEvent>,
  reports: ReadonlyArray<StudioReport>,
  sent: Sent
): StudioGoing {
  return {
    sittings: sittingsOf(events).filter(
      (sitting) => sent.studio[sitting.name] !== digestOf(sitting)
    ),
    reports: reports.filter(
      (report) => sent.studio[reportKey(report.id)] !== canonicalJson(report)
    ),
  }
}

const sittingPath = (sitting: string): string =>
  `/studio/sittings/${encodeURIComponent(sitting)}/events`

/**
 * Sends `going` through `send`, into `report` (a sitting refused or read
 * back otherwise is counted as LeetType's sessions are); `held` hears each
 * key `sent.studio` should remember.
 */
export async function sendStudio(
  going: StudioGoing,
  send: HomeCall,
  report: LogReport,
  held: (key: string, digest: string) => void
): Promise<void> {
  await sendLogs(going.sittings, sittingPath, send, report, held)
  if (report.forgotten || report.unreachable) return
  for (const answer of going.reports) {
    const sent = await answerOrEnd(
      send,
      report,
      "PUT",
      `/studio/friction/${encodeURIComponent(answer.id)}`,
      JSON.stringify(answer)
    )
    if (sent === null) return
    const bucket = bucketOf(sent.status)
    report[bucket] += 1
    if (bucket === "held") held(reportKey(answer.id), canonicalJson(answer))
  }
}
