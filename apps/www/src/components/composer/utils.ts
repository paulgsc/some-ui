import type { SceneConfig } from "some-types-utils"

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

export function defaultSessionName(
  activityIds: ReadonlyArray<ActivityId>
): string {
  if (activityIds.length === 0) return "New session"
  return activityIds.map((id) => getActivity(id).name).join(" + ")
}

export function buildSessionActivities(
  activityIds: ReadonlyArray<ActivityId>,
  configs: Partial<Record<ActivityId, ActivityConfigValues>>
): Array<SessionActivity> {
  return activityIds.map((activityId) => ({
    activityId,
    config: configs[activityId] ?? getActivity(activityId).defaultConfig,
  }))
}

export function totalDurationOfScenes(
  scenes: ReadonlyArray<SceneConfig>
): number {
  return scenes.reduce(
    (max, scene) => Math.max(max, scene.start_time + scene.duration),
    0
  )
}
