/**
 * The LeetType part of the one drain (`./drain`, LA15): each finished
 * session of the phone's LeetType session log that home does not hold as it
 * is now, one PUT per event in its home form (paulgsc/server
 * `handlers/leetype_log.rs`, docs/identity.md invariant 18: a spoken answer
 * without its ticks), then one read of the session back, compared event by
 * event (LA8). Phone to home only, and the phone keeps its whole log:
 * nothing here lets an event go. Beside it, `sendWhole`, the one PUT per
 * item the written reflections (`./reflections`) and the asks for the next
 * scene (`./prompts`) go by.
 */
import type { HomeCall } from "@some-ui/core-utils"
import { canonicalJson, isRecord, jsonOf } from "@some-ui/core-utils"
import type { HomeSession } from "@some-ui/leetype"

import { digestOf, fingerprintOf } from "./sent"
import type { EndedReport } from "./shelf"
import { answerOrEnd } from "./shelf"

/**
 * How a log's part of a send went (LeetType's sessions, Studio's sittings
 * and answers); filled as it goes, so a stop keeps it.
 */
export type LogReport = EndedReport & {
  /** Entries home now holds as they are, read back. */
  held: number
  /** Entries home refused a write of (`422`, `409`); kept here, offered again by the next run. */
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

/** A kind of item that goes home whole, one PUT each, and comes back in home's answer. */
export type WholeLane<T> = {
  /** Where each goes: this, then its id. */
  readonly path: string
  /** What goes of one item. */
  readonly wire: (item: T) => unknown
  /** The key home's answer holds the item under. */
  readonly key: string
  /** The item's id: the last part of its path, and its key in `sent`. */
  readonly id: (item: T) => string
}

/** Whether `held` (the lane's map in `./sent`) says home holds `item` as it is now. */
export const heldBy =
  <T>(lane: WholeLane<T>, held: Readonly<Record<string, string>>) =>
  (item: T): boolean =>
    held[lane.id(item)] === fingerprintOf(lane.wire(item))

/**
 * Sends `going` through `send`, one PUT each, into `report` (a refusal or
 * an answer that does not hold what was sent is counted, and that item
 * stays on the phone, to go again with the next run); `held` hears each one
 * home holds as sent, by its id and fingerprint (`fingerprintOf`).
 */
export async function sendWhole<T>(
  lane: WholeLane<T>,
  going: ReadonlyArray<T>,
  send: HomeCall,
  report: LogReport,
  held: (id: string, fingerprint: string) => void
): Promise<void> {
  for (const item of going) {
    const wire = lane.wire(item)
    const id = lane.id(item)
    const answer = await answerOrEnd(
      send,
      report,
      "PUT",
      `${lane.path}/${encodeURIComponent(id)}`,
      JSON.stringify(wire)
    )
    if (answer === null) return
    const bucket = bucketOf(answer.status)
    if (bucket !== "held") {
      report[bucket] += 1
      continue
    }
    const parsed = jsonOf(answer.body)
    const fingerprint = fingerprintOf(wire)
    if (
      isRecord(parsed) &&
      isRecord(parsed[lane.key]) &&
      fingerprintOf(parsed[lane.key]) === fingerprint
    ) {
      report.held += 1
      held(id, fingerprint)
    } else {
      report.differs += 1
    }
  }
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
