/**
 * The LeetType half of "Send to home" (`./send`): each finished session of
 * the phone's LeetType session log that home does not hold as it is now, one
 * PUT per event in its home form (paulgsc/server `handlers/leetype_log.rs`,
 * docs/identity.md invariant 18: a spoken answer without its ticks), then
 * one read of the session back, compared event by event (LA8). Phone to home
 * only, and the phone keeps its whole log: nothing here lets an event go.
 */
import type { HomeCall } from "@some-ui/core-utils"
import { canonicalJson, isRecord } from "@some-ui/core-utils"
import type { HomeSession } from "@some-ui/leetype"

import { digestOf } from "./sent"
import type { EndedReport } from "./shelf"
import { answerOrEnd } from "./shelf"

/**
 * How a log's part of a send went (LeetType's sessions, Studio's sittings
 * and answers); filled as it goes, so a stop keeps it.
 */
export type LogReport = EndedReport & {
  /** Entries home now holds as they are, read back. */
  held: number
  /** Entries home refused a write of (`422`, `409`); kept here, offered by the next tap. */
  refused: number
  /** Entries home answered a write of some other way; kept here too. */
  other: number
  /** Entries whose read-back did not match what was sent. */
  differs: number
}

/** How home's answer to one write counts. */
export function bucketOf(status: number): "held" | "refused" | "other" {
  if (status === 200) return "held"
  return status === 409 || status === 422 ? "refused" : "other"
}

export function emptyLogReport(): LogReport {
  return {
    held: 0,
    refused: 0,
    other: 0,
    differs: 0,
    forgotten: false,
    unreachable: false,
  }
}

/** A log home keeps as a list of events under one name. */
export type EventLog = {
  readonly name: string
  readonly events: ReadonlyArray<{ readonly id: string }>
}

/** Home's read-back holds every one of `session`'s events exactly as sent. */
function holdsAll(session: EventLog, body: string): boolean {
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    return false
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.events)) return false
  const there = new Map<unknown, string>()
  for (const event of parsed.events) {
    if (isRecord(event)) there.set(event.id, canonicalJson(event))
  }
  return session.events.every(
    (event) => there.get(event.id) === canonicalJson(event)
  )
}

const eventsPath = (session: string): string =>
  `/leetype/sessions/${encodeURIComponent(session)}/events`

/** A LeetType session as `sendLogs` sends it. */
function leetypeLog(session: HomeSession): EventLog {
  return { name: session.session, events: session.events }
}

/**
 * Sends `sessions` through `send`, into `report`; `held` hears each session
 * home read back as sent, with its digest.
 */
export async function sendLog(
  sessions: ReadonlyArray<HomeSession>,
  send: HomeCall,
  report: LogReport,
  held: (session: string, digest: string) => void = () => undefined
): Promise<void> {
  await sendLogs(sessions.map(leetypeLog), eventsPath, send, report, held)
}

/**
 * Sends each log through `send` to `pathOf` its name, one PUT per event,
 * then reads it back, into `report`; `held` hears each log home read back
 * as sent, with its digest.
 */
export async function sendLogs(
  logs: ReadonlyArray<EventLog>,
  pathOf: (name: string) => string,
  send: HomeCall,
  report: LogReport,
  held: (name: string, digest: string) => void
): Promise<void> {
  for (const session of logs) {
    let taken: "all" | "refused" | "other" = "all"
    for (const event of session.events) {
      const answer = await answerOrEnd(
        send,
        report,
        "PUT",
        `${pathOf(session.name)}/${encodeURIComponent(event.id)}`,
        JSON.stringify(event)
      )
      if (answer === null) return
      const bucket = bucketOf(answer.status)
      if (bucket === "refused") taken = "refused"
      else if (bucket === "other" && taken === "all") taken = "other"
    }
    if (taken !== "all") {
      report[taken] += 1
      continue
    }
    const back = await answerOrEnd(send, report, "GET", pathOf(session.name))
    if (back === null) return
    if (back.status === 200 && holdsAll(session, back.body)) {
      report.held += 1
      held(session.name, digestOf(session))
    } else {
      report.differs += 1
    }
  }
}
