import { getActivity } from "./catalog"
import type {
  ActivityConfigValues,
  ActivityDefinition,
  ActivityId,
} from "./types"

/**
 * Plain-language summary of one activity's config, e.g. "Intermediate • 15 min".
 *
 * Lives with the catalogue rather than with the composer that first needed it
 * (#754/#756): it is a function of an `ActivityDefinition` and nothing else,
 * and three surfaces read it - the composer's review step, the player's
 * completion summary, and the sessions list. Two of those were reaching into
 * `components/composer/utils` to get it, which is a feature folder importing
 * a sibling's internals; the fix is for the shared thing to live somewhere
 * shared.
 */
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
