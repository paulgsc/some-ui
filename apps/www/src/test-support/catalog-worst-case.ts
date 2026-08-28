/**
 * The real, current catalog's own worst case for a session activity's
 * summary pill - not a hand-typed guess at one.
 *
 * #1193's original `BOUNDED_STRESS_LABELS` used #1192's exact reported
 * string ("TOPIK Study: Beginner • 15 min", 31 characters) as its longest
 * "bounded" case. A live build surfaced a longer real one nobody had typed
 * in by hand: Hangul Honeycomb's `vocabulary` mode at `standard` difficulty
 * produces "Hangul Honeycomb: Vocabulary (master the word list) • Standard
 * • 10 min" (73 characters) - long enough to overflow the pill horizontally
 * once `whitespace-nowrap` stops it from wrapping internally instead. The
 * corpus was calibrated against the bug report, not against the catalog
 * that actually produces this content, so it missed the catalog's own
 * longer entries.
 *
 * This computes the answer from the real `@some-ui/activity-catalog`
 * instead: for every activity, choosing the longest option label on each
 * `select` field and the longest duration on the `duration` field, then
 * keeping whichever activity's resulting `"{name}: {summary}"` is longest
 * overall. Self-maintaining as the catalog grows - a new activity or a
 * longer option label is picked up the next time this runs, not the next
 * time someone remembers to update a hand-typed corpus.
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

  // ACTIVITY_IDS is a non-empty compile-time-authored constant - only a
  // future catalog shipping zero activities makes this null, and that
  // catalog has bigger problems than this helper.
  if (!worst) {
    throw new Error("activity catalog is empty - cannot compute a worst case")
  }

  return worst
}
