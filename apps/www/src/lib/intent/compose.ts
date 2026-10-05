/**
 * Two `useIntent`s, sequenced into one composite intent: "Save & Play"
 * (`createSession` then `updateSession`, one gesture). Just `matchIntent`
 * nested in `matchIntent`, using `working`'s `step`; no new union member.
 *
 * Once the first has `succeeded` it is never looked at again: a failure of
 * the second carries the second's own `retry`, so the created session is
 * neither reverted nor re-created.
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
  /** Shown once the first has succeeded and the second is pending or in
   * flight ("saved, starting..."). */
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
        // The first succeeded and the second hasn't been started yet (the
        // caller triggers it, typically via useIntentEffect): still "working".
        idle: () => working(steps.second),
        working: () => working(steps.second),
        succeeded: (value) => succeeded(value),
        failed: (error, retry) => failed(error, retry),
      }),
  })
}
