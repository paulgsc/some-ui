/**
 * The read-side counterpart to `@some-ui/intent-kit`'s `Intent<T>`, and
 * deliberately not that type: a route's initial read has no `idle` (arrival
 * is the trigger) and can hold a previous success while a refetch fails. Same
 * idea, though: a value read only through an exhaustive match, here over
 * `UseQueryResult`.
 *
 * `ready` carries an optional `refreshError` rather than a fourth arm:
 * TanStack keeps the last good `data` while a background refetch fails
 * (reachable via `sessionsQuery`'s `refetchOnMount: true`). `failed` would
 * discard usable content; a bare `ready` would hide that it is stale.
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
 * The only way to read a `QueryOutcome`; no arm may be skipped, mirroring
 * `matchIntent`.
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
 * Keyed off `data !== undefined` and `isError`, which are stable across
 * TanStack v4/v5, not `isLoading`/`isPending`, whose meaning changed. A query
 * gated `enabled: false` (`lib/tenant/hooks.ts`) reads as `pending`: not yet
 * known.
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
