/**
 * The invariant (#933): every user-initiated effect terminates in a state a
 * person can observe, and the *only* way to read that state is to handle all
 * of it. `UseMutationResult` already carries the lifecycle; the problem is
 * that reading `status` is optional.
 *
 * `Intent` is a projection of that lifecycle, not a replacement for it —
 * see `apps/www/src/lib/intent/use-intent.ts` for the `UseMutationResult`
 * adapter. This module is the sealed part: a value that cannot be read
 * except through `matchIntent`, which cannot be called without an arm for
 * every state.
 *
 * ## Four states, not five
 *
 * `Idle | Working | Succeeded | Failed`. No `Cancelled`: no intent threads an
 * `AbortController` today, and a dead `() => null` arm at every call site
 * teaches that arms are ceremony. A genuinely cancellable intent (a long
 * upload) should add it and force an audit of every consumer then.
 *
 * `idle` stays even though it is the one arguably-redundant state, because
 * it is reachable at every call site from first render and is where the
 * "not yet clicked" affordance lives.
 */

import type { IntentError } from "./intent-error"

/**
 * `working`'s optional `step` is for a composite intent (a
 * create→update→navigate chain is one intent, not three), so "saved, but
 * couldn't start" needs no fifth top-level state. `TStep` is
 * `never` by default so a simple, non-composite intent's `working` arm
 * takes no argument and callers don't pay for a feature they don't use.
 */
export type Intent<T, TStep extends string = never> =
  | { readonly status: "idle" }
  | { readonly status: "working"; readonly step?: TStep }
  | { readonly status: "succeeded"; readonly value: T }
  | {
      readonly status: "failed"
      readonly error: IntentError
      readonly retry: () => void
    }

/**
 * Every arm required, no `default`, no `Partial<>`. Each escape hatch this
 * signature could offer is the invariant being opted out of by exactly the
 * people most likely to need it — see the package README and the
 * `@ts-expect-error` fixtures in `src/__type-fixtures__/`.
 */
export type IntentArms<T, R, TStep extends string = never> = {
  idle: () => R
  working: (step?: TStep) => R
  succeeded: (value: T) => R
  failed: (error: IntentError, retry: () => void) => R
}

/**
 * The one implementation of the helper `switch-lint/require-fail-fast-default`
 * accepts by default (see `apps/www/src/lib/intent/index.ts`). `_value:
 * never` serves any exhaustively switched union.
 */
export function assertNever(_value: never): never {
  // Reached only with a status this module doesn't know; `.status` cannot be
  // read off `never` without an assertion, so the message stays generic.

  throw new Error(
    "unhandled Intent status - a status matchIntent's callers cannot have constructed through this module's own constructors"
  )
}

/**
 * The only way to read an `Intent`. There is deliberately no `.status`
 * switch exposed at the call site and no way to read `.value` or `.error`
 * without going through the matching arm — see the `@ts-expect-error`
 * fixtures for what that actually blocks.
 */
export function matchIntent<T, R, TStep extends string = never>(
  intent: Intent<T, TStep>,
  arms: IntentArms<T, R, TStep>
): R {
  switch (intent.status) {
    case "idle": {
      return arms.idle()
    }
    case "working": {
      return arms.working(intent.step)
    }
    case "succeeded": {
      return arms.succeeded(intent.value)
    }
    case "failed": {
      return arms.failed(intent.error, intent.retry)
    }
    default: {
      return assertNever(intent)
    }
  }
}

/**
 * Constructors. Consumers should build an `Intent` through these rather
 * than an object literal — a hand-built literal is where a fifth state (or
 * a `failed` with no `retry`) gets smuggled in without either the compiler
 * or a reviewer skimming a diff noticing.
 */
export function idle<T, TStep extends string = never>(): Intent<T, TStep> {
  return { status: "idle" }
}

export function working<T, TStep extends string = never>(
  step?: TStep
): Intent<T, TStep> {
  return { status: "working", step }
}

export function succeeded<T, TStep extends string = never>(
  value: T
): Intent<T, TStep> {
  return { status: "succeeded", value }
}

export function failed<T, TStep extends string = never>(
  error: IntentError,
  retry: () => void
): Intent<T, TStep> {
  return { status: "failed", error, retry }
}
