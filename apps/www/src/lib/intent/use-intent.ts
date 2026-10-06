/**
 * The React binding over `UseMutationResult`: a projection, not a
 * replacement. The mutation still runs through TanStack as
 * `lib/tenant/hooks.ts` defines it (invalidation, optimistic rollback,
 * signals). What changes is the accessor: `status` is optional to read on
 * `UseMutationResult`, while `useIntent`'s value is read only through
 * `matchIntent`.
 *
 * `start` does not re-expose per-call `onSuccess`/`onError`: a boundary with
 * a bypass is not a boundary. A success continuation belongs in
 * `matchIntent`'s `succeeded` arm or, for a side effect like `navigate`, in
 * `useIntentEffect`.
 *
 * **Double-terminal.** `succeeded` stays until something changes it. Gate a
 * re-submittable form on `disabled={!isDirty}` (as `SettingsForm` does), and
 * call `reset()` when the intent must return to `idle` without a new edit.
 *
 * **Thundering-herd guard.** `mutate()` doesn't change `status` until the
 * next render, so two `start()`/`retry()` calls in one burst (a fast
 * double-click) would both dispatch. `dispatchingRef` drops the second and
 * clears when `status` changes, so a genuine later action is never blocked.
 */

import { useCallback, useEffect, useRef } from "react"
import type {
  Intent,
  IntentError,
  IntentPresentation,
} from "@some-ui/intent-kit"
import {
  assertNever,
  failed,
  idle,
  succeeded,
  working,
} from "@some-ui/intent-kit"
import type { UseMutationResult } from "@tanstack/react-query"

import { mapFileHostError } from "./errors"

export type UseIntentOptions = {
  /**
   * Required: whether a failure may interrupt someone must not be decided by
   * omission.
   */
  presentation: IntentPresentation
  /** Overrides the default `file_host` mapping, for a mutation whose failures
   * don't come from `file_host`. */
  mapError?: (error: unknown) => IntentError
}

export type UseIntentResult<TVariables, TData, TStep extends string = never> = {
  readonly state: Intent<TData, TStep>
  readonly presentation: IntentPresentation
  /** Wraps `mutate`. No per-call `onSuccess`/`onError` (see header). */
  readonly start: (variables: TVariables) => void
  /** Returns the intent to `idle` (see header, "Double-terminal"). */
  readonly reset: () => void
}

/**
 * Wraps one `UseMutationResult`, reading only `status`/`data`/`error`/
 * `variables`; the mutation's own callbacks fire untouched.
 */
export function useIntent<TVariables, TData, TStep extends string = never>(
  mutation: UseMutationResult<TData, unknown, TVariables>,
  options: UseIntentOptions
): UseIntentResult<TVariables, TData, TStep> {
  const mapError = options.mapError ?? mapFileHostError
  const { mutate, status, variables, reset: mutationReset } = mutation

  // See this module's header, "Thundering-herd guard".
  const dispatchingRef = useRef(false)
  useEffect(() => {
    dispatchingRef.current = false
  }, [status])

  const retry = useCallback((): void => {
    if (dispatchingRef.current) return
    // TanStack retains the last `mutate()` variables; re-deriving them could
    // disagree with what ran. `retry` only exists after a run, so `undefined`
    // is not expected here.
    if (variables === undefined) return
    dispatchingRef.current = true
    mutate(variables)
  }, [mutate, variables])

  const start = useCallback(
    (nextVariables: TVariables): void => {
      if (dispatchingRef.current) return
      dispatchingRef.current = true
      mutate(nextVariables)
    },
    [mutate]
  )

  const reset = useCallback((): void => {
    mutationReset()
  }, [mutationReset])

  const state = ((): Intent<TData, TStep> => {
    // Switch on the destructured `status`: narrowing `mutation.status` would
    // narrow `mutation` itself to `never` in the default arm.
    switch (status) {
      case "idle": {
        return idle()
      }
      case "pending": {
        return working()
      }
      case "success": {
        return succeeded(mutation.data)
      }
      case "error": {
        // eslint-disable-next-line react-hooks/refs -- `retry` closes over `dispatchingRef` (the thundering-herd guard above), but only reads `.current` when actually invoked later from an event handler, never during this render. The rule can't statically see that distinction and flags any ref-reading closure handed into a render-time value.
        return failed(mapError(mutation.error), retry)
      }
      default: {
        return assertNever(status)
      }
    }
  })()

  return { state, presentation: options.presentation, start, reset }
}
