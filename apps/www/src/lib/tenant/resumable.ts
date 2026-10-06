import type { SessionRecord, SessionStatus } from "./types"

/** Started and not finished. A scheduled session has nothing to resume yet. */
const RESUMABLE_STATUSES: ReadonlyArray<SessionStatus> = ["active", "paused"]

/**
 * The session a Home card offers to resume: the first in the list (newest
 * first, as the sessions query returns it) that is started and not
 * finished. Web's Home and the phone's ask the same question, so they read
 * the one answer from here.
 */
export function resumableSession(
  sessions: ReadonlyArray<SessionRecord>
): SessionRecord | null {
  return sessions.find((s) => RESUMABLE_STATUSES.includes(s.status)) ?? null
}

/** Same calendar day in the viewer's own timezone. */
export function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

/** The sessions finished today, for Home's "Studied today". */
export function finishedToday(
  sessions: ReadonlyArray<SessionRecord>,
  now: Date
): ReadonlyArray<SessionRecord> {
  return sessions.filter(
    (s) =>
      s.status === "completed" &&
      s.completedAt !== undefined &&
      isSameLocalDay(new Date(s.completedAt), now)
  )
}
