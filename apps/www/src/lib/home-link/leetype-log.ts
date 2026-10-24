/**
 * The LeetType half of "Send to home" (`./send`): each finished session of
 * the phone's LeetType session log that home does not hold as it is now, one
 * PUT per event in its home form (paulgsc/server `handlers/leetype_log.rs`,
 * docs/identity.md invariant 18: a spoken answer without its ticks), then
 * one read of the session back, compared event by event (LA8). Phone to home
 * only, and the phone keeps its whole log: nothing here lets an event go.
 *
 * A session counts as held only once every event it sent reads back as sent;
 * then `./sent` remembers its digest, so the next send skips it. Home's
 * refusals (`422`, or `409`: another event under an id it holds) are counted
 * per session and the send goes on; a `401`, home being busy (`429`) or no
 * answer ends it there, as the shelf's does (`./shelf`).
 */
import type { HomeCall } from "@some-ui/core-utils"
import { canonicalJson, fnv1a } from "@some-ui/core-utils"
import type { HomeEvent } from "@some-ui/leetype"

import { isRecord } from "@/lib/device-backend/common"

import { unanswered } from "./runtime"
import type { Sent } from "./sent"

/** One finished session, its events in their home form. */
export type HomeSession = {
  readonly session: string
  readonly events: ReadonlyArray<HomeEvent>
}

/** How the LeetType part of a send went; filled as it goes, so a stop keeps it. */
export type LogReport = {
  /** Sessions home now holds as they are, read back. */
  held: number
  /** Sessions home refused an event of (`422`, `409`); kept here, offered by the next tap. */
  refused: number
  /** Sessions home answered an event of some other way; kept here too. */
  other: number
  /** Sessions whose read-back did not match what was sent. */
  differs: number
  /** Home answered `401`: it no longer knows this phone. */
  forgotten: boolean
  /** A request got no answer, or home was busy; nothing after it was sent. */
  unreachable: boolean
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

/** What a session's held entry says: its events, by id. */
export function digestOf(session: HomeSession): string {
  const ids = session.events.map((event) => event.id)
  return `${String(ids.length)}:${String(fnv1a(ids.join("|")))}`
}

/** The finished sessions home does not hold as they are now. */
export function logToSend(
  sessions: ReadonlyArray<HomeSession>,
  sent: Sent
): Array<HomeSession> {
  return sessions.filter(
    (session) => sent.leetype[session.session] !== digestOf(session)
  )
}

/** Home's read-back holds every one of `session`'s events exactly as sent. */
function holdsAll(session: HomeSession, body: string): boolean {
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
  // How a request ended: answered with `status` and `body`, or the send is over.
  const ask = async (
    method: "GET" | "PUT",
    path: string,
    body?: string
  ): Promise<{ status: number; body: string } | null> => {
    let answer: { status: number; body: string }
    try {
      answer = await send(method, path, body)
    } catch (error) {
      if (!unanswered(error)) throw error
      report.unreachable = true
      return null
    }
    if (answer.status === 401) report.forgotten = true
    else if (answer.status === 429) report.unreachable = true
    else return answer
    return null
  }

  for (const session of sessions) {
    let taken: "all" | "refused" | "other" = "all"
    for (const event of session.events) {
      const path = `${eventsPath(session.session)}/${encodeURIComponent(event.id)}`
      const answer = await ask("PUT", path, JSON.stringify(event))
      if (answer === null) return
      if (answer.status === 409 || answer.status === 422) taken = "refused"
      else if (answer.status !== 200 && taken === "all") taken = "other"
    }
    if (taken !== "all") {
      report[taken] += 1
      continue
    }
    const back = await ask("GET", eventsPath(session.session))
    if (back === null) return
    if (back.status === 200 && holdsAll(session, back.body)) {
      report.held += 1
      held(session.session, digestOf(session))
    } else {
      report.differs += 1
    }
  }
}
