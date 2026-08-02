import type {
  ActivityConfigValues,
  ActivityId,
  SessionActivity,
} from "@some-ui/activity-catalog"

/**
 * What is left of this module after #756.
 *
 * `summarizeConfig`, `defaultSessionName`, `resequence` and
 * `totalDurationOfScenes` used to live here and moved to
 * `@some-ui/activity-catalog`: all four are pure functions of an activity or
 * of a scene list, and the player and the sessions route were both importing
 * them from *inside the composer's folder* to get at them. A shared thing
 * reached for by three features belongs somewhere shared.
 *
 * `buildSessionActivities` stays, because it is genuinely composer-local: it
 * exists to strip `instanceId`, which is the composer's own UI state and has
 * no meaning anywhere else.
 */

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
