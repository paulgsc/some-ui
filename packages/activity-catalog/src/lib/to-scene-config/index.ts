import { getActivity } from "@activity-catalog/lib/catalog"
import type {
  ActivityConfigValues,
  ActivityId,
  LayoutTreeId,
} from "@activity-catalog/lib/types"
import type { SceneConfig } from "@some-ui/types"

export type SceneBuildOptions = {
  startTime: number
  /** Distinguishes repeated instances of the same activity within a session. */
  instanceLabel?: string
}

const FALLBACK_DURATION_MINUTES = 10

function durationMsFor(
  activityId: ActivityId,
  config: ActivityConfigValues
): number {
  const activity = getActivity(activityId)
  const fallbackMinutes = activity.defaultConfig.durationMinutes
  const minutes =
    typeof config.durationMinutes === "number"
      ? config.durationMinutes
      : typeof fallbackMinutes === "number"
        ? fallbackMinutes
        : FALLBACK_DURATION_MINUTES
  return minutes * 60_000
}

/** Translates one activity's friendly config into a scheduler-ready SceneConfig. */
export function toSceneConfig(
  activityId: ActivityId,
  config: ActivityConfigValues,
  { startTime, instanceLabel }: SceneBuildOptions
): SceneConfig {
  const activity = getActivity(activityId)
  const sceneName = instanceLabel
    ? `${activityId}-${instanceLabel}`
    : activityId
  const componentKey = instanceLabel
    ? `${activityId}-${instanceLabel}`
    : activityId

  return {
    scene_name: sceneName,
    start_time: startTime,
    duration: durationMsFor(activityId, config),
    ui: [
      {
        panels: {
          mainContent: {
            registry_key: activity.registryKey,
            props: activity.toSceneProps({ ...config, key: componentKey }),
            children: [],
          },
        },
      },
    ],
  }
}

export type SessionActivity = {
  activityId: ActivityId
  config: ActivityConfigValues
}

/**
 * Sequences activities back-to-back starting at t=0 - the "Basic" composer
 * path, where the user makes zero arrangement decisions.
 */
export function sequenceScenes(
  activities: ReadonlyArray<SessionActivity>
): Array<SceneConfig> {
  let cursor = 0
  return activities.map((activity, index) => {
    const scene = toSceneConfig(activity.activityId, activity.config, {
      startTime: cursor,
      instanceLabel: activities.length > 1 ? String(index) : undefined,
    })
    cursor += scene.duration
    return scene
  })
}

export function layoutTreeFor(activityId: ActivityId): LayoutTreeId {
  return getActivity(activityId).layoutTree
}

/**
 * Recomputes each scene's start_time from its position and duration.
 *
 * The counterpart to `sequenceScenes` for scenes that already exist: the
 * Advanced arrangement step reorders and resizes them, and every such edit
 * invalidates every later start_time.
 */
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

/**
 * How long a session actually runs, in ms.
 *
 * Takes the furthest end rather than summing durations, so it stays correct
 * for an Advanced arrangement whose scenes are not back-to-back.
 */
export function totalDurationOfScenes(
  scenes: ReadonlyArray<SceneConfig>
): number {
  return scenes.reduce(
    (max, scene) => Math.max(max, scene.start_time + scene.duration),
    0
  )
}
