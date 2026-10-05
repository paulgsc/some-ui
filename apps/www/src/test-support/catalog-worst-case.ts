/**
 * The real catalog's own worst case for a session activity's summary pill,
 * computed rather than hand-typed (a hand-typed corpus once missed a
 * 73-character label): for every activity, the longest option label on each
 * `select` field and the longest `duration`, keeping the longest
 * `"{name}: {summary}"`. A new activity or longer label is picked up
 * automatically.
 */

import {
  ACTIVITY_IDS,
  getActivity,
  summarizeConfig,
  type ActivityConfigValues,
  type ActivityId,
} from "@some-ui/activity-catalog"

export type CatalogWorstCase = {
  activityId: ActivityId
  config: ActivityConfigValues
  label: string
}

function longestConfigFor(
  activity: ReturnType<typeof getActivity>
): ActivityConfigValues {
  const config: ActivityConfigValues = { ...activity.defaultConfig }

  for (const field of activity.fields) {
    if (field.kind === "select") {
      const longestOption = field.options.reduce((longest, option) =>
        option.label.length > longest.label.length ? option : longest
      )
      config[field.key] = longestOption.value
    } else {
      config[field.key] = field.maxMinutes
    }
  }

  return config
}

/** The single longest `"{activity.name}: {summarizeConfig(...)}"` string
 * the real catalog can currently produce, and the activity/config that
 * produces it. */
export function catalogWorstCase(): CatalogWorstCase {
  let worst: CatalogWorstCase | null = null

  for (const activityId of ACTIVITY_IDS) {
    const activity = getActivity(activityId)
    const config = longestConfigFor(activity)
    const label = `${activity.name}: ${summarizeConfig(activity, config)}`

    if (!worst || label.length > worst.label.length) {
      worst = { activityId, config, label }
    }
  }

  // ACTIVITY_IDS is a non-empty compile-time constant; null only for a
  // catalog with zero activities.
  if (!worst) {
    throw new Error("activity catalog is empty - cannot compute a worst case")
  }

  return worst
}
