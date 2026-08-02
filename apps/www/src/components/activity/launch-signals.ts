import type { ActivityPlay } from "@some-ui/activity-catalog"

import type { SessionRecord } from "@/lib/tenant"

/**
 * A session that was only ever composed is not a play. Ranking asks "what is
 * this person likely to want next", and a draft they abandoned in the
 * composer answers that question differently from a session they actually
 * sat through - counting both identically would let a wizard someone bailed
 * out of shape the front page for a week.
 */
const PLAYED_STATUSES: ReadonlyArray<SessionRecord["status"]> = [
  "active",
  "paused",
  "completed",
]

function playedAt(session: SessionRecord): number | null {
  const played =
    session.startedAt !== undefined || PLAYED_STATUSES.includes(session.status)
  if (!played) return null

  // `startedAt` when there is one; `updatedAt` is the fallback for a record
  // that predates the field. Both are ISO strings from the same clock.
  const stamp = Date.parse(session.startedAt ?? session.updatedAt)
  return Number.isNaN(stamp) ? null : stamp
}

/**
 * Turns the sessions this app already stores into the play history
 * `rankActivities` wants.
 *
 * This is the adapter, and it is the whole reason S2 needs no new tracking
 * and no new persisted state: recency and frequency are already in the
 * session list, they were just never read as signals.
 *
 * One session contributes one play *per activity instance* it contains, so a
 * session built from two Honeycomb blocks counts Honeycomb twice - which is
 * the honest reading of "frequently played" for a repo where repeating an
 * activity within a session is an expected shape.
 */
export function playsFromSessions(
  sessions: ReadonlyArray<SessionRecord>
): Array<ActivityPlay> {
  const plays: Array<ActivityPlay> = []

  for (const session of sessions) {
    const at = playedAt(session)
    if (at === null) continue
    for (const activity of session.activities) {
      plays.push({ activityId: activity.activityId, at })
    }
  }

  return plays
}
