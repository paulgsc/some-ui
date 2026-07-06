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

export function formatDurationMs(ms: number): string {
  const totalMinutes = Math.round(ms / 60_000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours === 0) return `${minutes} min`
  if (minutes === 0) return `${hours} hr`
  return `${hours} hr ${minutes} min`
}

export function formatTimecode(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, "0")}`
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
