import type {
  ActivityConfigValues,
  ActivityId,
  SessionActivity,
} from "@some-ui/activity-catalog"

/**
 * One entry per activity *instance*, in the composer's order with repeats
 * (two Honeycomb blocks, say), stripping only the composer-local
 * `instanceId`; in `SessionActivity` array position is authoritative.
 */
export function buildSessionActivities(
  items: ReadonlyArray<{ activityId: ActivityId; config: ActivityConfigValues }>
): Array<SessionActivity> {
  return items.map(({ activityId, config }) => ({ activityId, config }))
}
