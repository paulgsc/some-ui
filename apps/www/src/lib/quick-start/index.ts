/**
 * A session of the given activities, each at its own defaults, in the
 * basic layout: the viewer's sample drafts (`lib/demo`), and what Practice
 * Home's "Next lesson" starts; and the write that starts a session, which
 * the composer's "Save & Play" makes too.
 */
import type { ActivityId } from "@some-ui/activity-catalog"
import {
  defaultSessionName,
  getActivity,
  sequenceScenes,
} from "@some-ui/activity-catalog"

import type { CreateSessionInput } from "@/lib/tenant/sessions-repository"
import type { SessionRecord } from "@/lib/tenant/types"

/** The session write that starts it, now. */
export const startedPatch = (): Pick<
  SessionRecord,
  "status" | "startedAt"
> => ({
  status: "active",
  startedAt: new Date().toISOString(),
})

export function basicSession(
  activityIds: ReadonlyArray<ActivityId>
): CreateSessionInput {
  const activities = activityIds.map((activityId) => ({
    activityId,
    config: getActivity(activityId).defaultConfig,
  }))
  return {
    name: defaultSessionName(activityIds),
    activities,
    scenes: sequenceScenes(activities),
    layoutMode: "basic",
  }
}
