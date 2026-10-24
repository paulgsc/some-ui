/**
 * A session of the given activities, each at its own defaults, in the
 * basic layout: what the composer makes when nothing is changed, what the
 * viewer's sample drafts are (`lib/demo`), and what Practice Home's "Next
 * lesson" starts.
 */
import type { ActivityId } from "@some-ui/activity-catalog"
import {
  defaultSessionName,
  getActivity,
  sequenceScenes,
} from "@some-ui/activity-catalog"

import type { CreateSessionInput } from "@/lib/tenant/sessions-repository"

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
