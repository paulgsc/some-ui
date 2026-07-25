import type { SceneConfig } from "@some-ui/types"

import { getActivity } from "@/lib/activity-catalog"
import type {
  ActivityConfigValues,
  ActivityDefinition,
  ActivityId,
  SessionActivity,
} from "@/lib/activity-catalog"

/** Recomputes each scene's start_time from its position and duration. */
export function resequence(
  scenes: ReadonlyArray<SceneConfig>
): Array<SceneConfig> {
  let cursor = 0
  return scenes.map((scene) => {
    const updated: SceneConfig = { ...scene, start_time: cursor }
    cursor += scene.duration
    return updated
  })
}

/** Plain-language summary of one activity's config, e.g. "Intermediate • 15 min". */
export function summarizeConfig(
  activity: ActivityDefinition,
  config: ActivityConfigValues
): string {
  return activity.fields
    .map((field) => {
      const value = config[field.key]
      if (field.kind === "select") {
        const option = field.options.find(
          (candidate) => candidate.value === value
        )
        return option?.label ?? String(value)
      }
      return `${String(value)} min`
    })
    .join(" • ")
}

/**
 * Same activityId may appear more than once (two Honeycomb blocks with
 * different modes are a valid, expected session shape, not a duplicate to
 * collapse) - so this counts occurrences and labels repeats "Name ×N" rather
 * than assuming activityIds is a set.
 */
export function defaultSessionName(
  activityIds: ReadonlyArray<ActivityId>
): string {
  if (activityIds.length === 0) return "New session"

  const counts = new Map<ActivityId, number>()
  for (const id of activityIds) counts.set(id, (counts.get(id) ?? 0) + 1)

  const seen = new Set<ActivityId>()
  const parts: Array<string> = []
  for (const id of activityIds) {
    if (seen.has(id)) continue
    seen.add(id)
    const count = counts.get(id) ?? 1
    const name = getActivity(id).name
    parts.push(count > 1 ? `${name} ×${count}` : name)
  }
  return parts.join(" + ")
}

/**
 * One entry per activity *instance* the user has added to the session -
 * not one per distinct activityId. A session is a serial list, and the
 * same activity can legitimately appear any number of times (e.g. two
 * Honeycomb blocks, one "completion" and one "endless"), so this takes
 * whatever order/repetition the composer's own instance list already has
 * and only strips the instanceId, which is composer-local UI state that
 * SessionActivity has no use for (array position is authoritative there).
 */
export function buildSessionActivities(
  items: ReadonlyArray<{ activityId: ActivityId; config: ActivityConfigValues }>
): Array<SessionActivity> {
  return items.map(({ activityId, config }) => ({ activityId, config }))
}

export function totalDurationOfScenes(
  scenes: ReadonlyArray<SceneConfig>
): number {
  return scenes.reduce(
    (max, scene) => Math.max(max, scene.start_time + scene.duration),
    0
  )
}
