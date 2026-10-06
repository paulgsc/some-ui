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
