import type { ActivityPlay } from "@some-ui/activity-catalog"

import type { SessionRecord } from "@/lib/tenant"

/**
 * A session only ever composed is not a play: a draft abandoned in the
 * composer should not shape the front page.
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
 * Turns stored sessions into the play history `rankActivities` wants: no new
 * tracking, since recency and frequency are already in the session list. One
 * play *per activity instance*, so two Honeycomb blocks count twice.
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
