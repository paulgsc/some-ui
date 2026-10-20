/**
 * The sample a viewer's study screens start from (CLAUDE.md, "A viewer tries,
 * and nothing is kept"): on the Pages build the page's storage is an
 * in-memory copy (`./viewer-storage`), and this seeds it with a few drafts. A
 * viewer can compose, edit and play; a reload starts over. Seeded from
 * `main.tsx`, which loads the activity registry anyway.
 */
import {
  defaultSessionName,
  sequenceScenes,
  totalDurationOfScenes,
} from "@some-ui/activity-catalog"

import { VIEWER_BUILD } from "@/lib/data-mode"
import { OFFERED_ACTIVITIES } from "@/lib/playable"
import { STORAGE_KEY as SESSIONS_KEY } from "@/lib/tenant/sessions-repository"
import { browserLocalStorage, writeJSON } from "@/lib/tenant/storage"
import type { SessionRecord } from "@/lib/tenant/types"

/** When the samples were "made": fixed, so the demo reads the same each visit. */
export const SAMPLED_AT = "2026-10-01T09:00:00.000Z"

/**
 * The sample drafts: one per activity this build offers, then one running the
 * first two together, each made as the composer makes a basic draft.
 */
export function demoSessions(): Array<SessionRecord> {
  const groups = [
    ...OFFERED_ACTIVITIES.map((activity) => [activity]),
    ...(OFFERED_ACTIVITIES.length >= 2 ? [OFFERED_ACTIVITIES.slice(0, 2)] : []),
  ]
  return groups.map((group, index) => {
    const activities = group.map((activity) => ({
      activityId: activity.id,
      config: activity.defaultConfig,
    }))
    const scenes = sequenceScenes(activities)
    return {
      id: `demo-${index + 1}`,
      name: defaultSessionName(activities.map((a) => a.activityId)),
      status: "draft",
      activities,
      scenes,
      layoutMode: "basic",
      totalDurationMs: totalDurationOfScenes(scenes),
      createdAt: SAMPLED_AT,
      updatedAt: SAMPLED_AT,
    }
  })
}

/** On the Pages build, gives a viewer's fresh storage its sample drafts. */
export function seedDemo(): void {
  if (VIEWER_BUILD) writeJSON(browserLocalStorage, SESSIONS_KEY, demoSessions())
}
