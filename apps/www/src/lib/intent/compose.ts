/**
 * Two `useIntent`s, sequenced into one composite intent - the shape
 * `session-composer.tsx:241`'s "Save & Play" needs (`createSession` then
 * `updateSession`, one gesture, two round-trips), per #943/S3's acceptance
 * criterion: "The chain shape handles create-succeeded-then-start-failed
 * without reverting the created session and without a retry producing a
 * duplicate."
 *
 * This works *because* `working`'s `step` field exists (see
 * `@some-ui/intent-kit`'s `intent.ts`) rather than because of anything new:
 * composing is just `matchIntent` nested inside `matchIntent`. No new union
 * member, no new state - #943's own recommendation, proven here rather than
 * only asserted.
 *
 * The critical property this buys: once the first intent has `succeeded`,
 * this function never looks at it again. A failure in the second stays a
 * failure of *only* the second - its `retry` closure is the second
 * mutation's own, so retrying re-runs only that step. The first result
 * (already created) is never reverted and never re-created, because nothing
 * here has a way to re-trigger the first intent once composition has moved
 * past it.
 */

import type { Intent } from "@some-ui/intent-kit"
import {
  failed,
  idle,
  matchIntent,
  succeeded,
  working,
} from "@some-ui/intent-kit"

export type SequentialSteps<TStep extends string> = {
  /** Shown while the first intent is in flight. */
  readonly first: TStep
  /** Shown once the first has succeeded and the second is either not yet
   * started or in flight - "saved, starting..." rather than a state with no
   * label. */
  readonly second: TStep
}

export function composeSequentialIntents<TFirst, TSecond, TStep extends string>(
  first: Intent<TFirst>,
  second: Intent<TSecond>,
  steps: SequentialSteps<TStep>
): Intent<TSecond, TStep> {
  return matchIntent<TFirst, Intent<TSecond, TStep>>(first, {
    idle: () => idle(),
    working: () => working(steps.first),
    failed: (error, retry) => failed(error, retry),
    succeeded: () =>
      matchIntent<TSecond, Intent<TSecond, TStep>>(second, {
        // The first has already succeeded; the second hasn't been asked to
        // run yet (a caller triggers it from the first's own succeeded arm,
        // typically via useIntentEffect). Still "working" from the
        // composite's point of view - there is no user-facing distinction
        // between "about to start step two" and "running step two".
        idle: () => working(steps.second),
        working: () => working(steps.second),
        succeeded: (value) => succeeded(value),
        failed: (error, retry) => failed(error, retry),
      }),
  })
}
