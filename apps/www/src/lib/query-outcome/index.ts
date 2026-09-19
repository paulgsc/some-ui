/**
 * The read-side counterpart to `@some-ui/intent-kit`'s `Intent<T>` - and
 * deliberately not that same type. See the route-arrival handoff (r1) this
 * module answers: `Intent` is sealed around a *mutation*'s lifecycle
 * (idle/working/succeeded/failed, no data until a person acts), where a
 * route's initial read has no `idle` - arrival itself is the trigger - and
 * can hold a *previous* success while a background refetch is failing.
 * Reusing `Intent<T>` unchanged would either misrepresent that (calling a
 * page-load a `succeeded` intent nobody started) or grow arms an intent
 * consumer never needs. See `apps/www/src/lib/intent/index.ts`'s own header
 * for the enforcement layers that type applies to writes; this is the same
 * idea - a value that cannot be read except through an exhaustive match -
 * applied to `UseQueryResult` instead of `UseMutationResult`.
 *
 * ## Why `ready` carries an optional `refreshError`
 *
 * TanStack keeps the last good `data` on screen while a background refetch
 * is in flight or has failed (`sessionsQuery`'s `refetchOnMount: true` makes
 * this a real, reachable case, not a hypothetical one). Collapsing that into
 * `failed` would throw away useful content the person can still act on;
 * collapsing it into a bare `ready` would hide that the list on screen is
 * not current. Neither is the "explicit product decision" the handoff calls
 * for, so it is a property of `ready` instead of a fourth top-level arm -
 * every consumer still gets `ready`'s value for free, and only the ones that
 * want to say something about a stale refresh need to look at
 * `refreshError`.
 */

import type { IntentError } from "@some-ui/intent-kit"
import { assertNever } from "@some-ui/intent-kit"
import type { UseQueryResult } from "@tanstack/react-query"

import { mapFileHostError } from "@/lib/intent/errors"

export type QueryOutcome<T> =
  | { readonly status: "pending" }
  | {
      readonly status: "failed"
      readonly error: IntentError
      readonly retry: () => void
    }
  | {
      readonly status: "ready"
      readonly value: T
      /** Set only when `value` is the last successful read and the most
       * recent background refetch for it failed - see this module's header. */
      readonly refreshError?: {
        readonly error: IntentError
        readonly retry: () => void
      }
    }

export type QueryOutcomeArms<T, R> = {
  pending: () => R
  failed: (error: IntentError, retry: () => void) => R
  ready: (
    value: T,
    refreshError?: { error: IntentError; retry: () => void }
  ) => R
}

/**
 * The only way to read a `QueryOutcome` - no arm may be skipped, mirroring
 * `matchIntent`. `_value: never` is polymorphic over whatever `T` a given
 * call site closed over, same as `assertNever` itself.
 */
export function matchQueryOutcome<T, R>(
  outcome: QueryOutcome<T>,
  arms: QueryOutcomeArms<T, R>
): R {
  switch (outcome.status) {
    case "pending": {
      return arms.pending()
    }
    case "failed": {
      return arms.failed(outcome.error, outcome.retry)
    }
    case "ready": {
      return arms.ready(outcome.value, outcome.refreshError)
    }
    default: {
      return assertNever(outcome)
    }
  }
}

/**
 * Project a `UseQueryResult` into the three-state outcome above.
 *
 * Deliberately keyed off `data !== undefined` and `isError`, not
 * `isLoading`/`isPending` - those two are the pair whose meaning changed
 * between TanStack Query v4 and v5 (`isLoading` narrowed to
 * "pending and fetching for the first time" in v5), while whether the cache
 * actually holds a value and whether the last settle was a rejection are
 * stable across both. A query that is `enabled: false` (see
 * `lib/tenant/hooks.ts`'s gate) has no data and is not errored, so it reads
 * as `pending` here too - correctly: "not yet known" is the honest
 * description of a read that has not been allowed to start yet, and it
 * resolves the moment the gate lifts, same as an in-flight fetch resolves
 * the moment the network answers.
 */
export function queryOutcome<T>(
  result: UseQueryResult<T>,
  mapError: (error: unknown) => IntentError = mapFileHostError
): QueryOutcome<T> {
  const retry = (): void => {
    void result.refetch()
  }

  if (result.data !== undefined) {
    if (result.isError) {
      return {
        status: "ready",
        value: result.data,
        refreshError: { error: mapError(result.error), retry },
      }
    }
    return { status: "ready", value: result.data }
  }

  if (result.isError) {
    return { status: "failed", error: mapError(result.error), retry }
  }

  return { status: "pending" }
}
