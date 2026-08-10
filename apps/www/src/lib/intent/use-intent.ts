/**
 * The React binding over `UseMutationResult` — per #935's Pushback 1, a
 * projection, not a replacement. The mutation still runs through TanStack
 * exactly as `lib/tenant/hooks.ts` defines it: `queryClient.invalidateQueries`
 * on success, `useUpdateSession`'s `onMutate` snapshot for optimistic
 * rollback, `reportSessionTransition` firing from `onSuccess`. None of that
 * moves. What changes is the accessor: `UseMutationResult.status` is a bare
 * string on an object with twenty other fields, and reading it is optional -
 * which is why #934's census found it unread at every one of 17 call sites.
 * `useIntent` returns a value whose only accessor is `matchIntent`.
 *
 * ## What this deliberately does not do
 *
 * `start` wraps `mutate` but does not re-expose per-call `onSuccess`/
 * `onError`. That escape hatch is today's actual pattern (see
 * `session-composer.tsx`'s inline `onSuccess` callbacks), and a boundary
 * with a bypass is not a boundary. A success continuation belongs in the
 * `succeeded` arm of `matchIntent`, or - for a side effect that must not
 * run during render, like `navigate(...)` - in `useIntentEffect` (see that
 * module). This is expected to be the friction point when #936 migrates
 * `session-composer.tsx`'s `void navigate(...)`-in-`onSuccess` call sites;
 * that friction is the point, not a bug to route around.
 *
 * ## The double-terminal case
 *
 * TanStack keeps `status: "success"` (and the intent stays `succeeded`)
 * until something changes it. There is no automatic reversion to `idle` -
 * for a form that can be legitimately re-submitted, gate the control the
 * same way `SettingsForm`/`ProfileForm` already do (`disabled={!isDirty}`),
 * so a fresh edit is what makes `succeeded` stop being shown, not a timer.
 * Call `reset()` explicitly when the intent itself needs to return to
 * `idle` without a new edit prompting it (e.g. navigating away and back to
 * the same form instance).
 *
 * ## Thundering-herd guard
 *
 * `mutate()` doesn't change `mutation.status` inside the closure that just
 * called it - only the *next* render, once React has processed TanStack's
 * notification, sees the new status. Two `start()`/`retry()` calls that
 * both land before that re-render (a fast real double-click, or two
 * `fireEvent.click()`s fired synchronously in a test with no `await`
 * between them) would otherwise both read the same stale `idle`/`failed`
 * state and both dispatch - the exact failure mode #936 calls out
 * explicitly for "Save and play". `dispatchingRef` is a render-cycle-
 * independent guard: the second call in the same burst is dropped rather
 * than firing a second request, and it clears itself the moment
 * `mutation.status` actually changes, so a genuine subsequent action
 * (retry after a real failure, resubmitting a dirty form) is never
 * blocked - only a duplicate within the same burst is.
 */

import { useCallback, useEffect, useRef } from "react"
import type {
  Intent,
  IntentError,
  IntentPresentation,
} from "@some-ui/intent-kit"
import { failed, idle, succeeded, working } from "@some-ui/intent-kit"
import type { UseMutationResult } from "@tanstack/react-query"

import { mapFileHostError } from "./errors"

export type UseIntentOptions = {
  /**
   * Required, not defaulted - #944/S4's own point: a default here is a
   * decision nobody made, and whether a failure may interrupt someone is
   * exactly the decision that must not be made by omission.
   */
  presentation: IntentPresentation
  /** Overrides the default `file_host` mapping. Most call sites don't need
   * this; it exists for a mutation whose failures don't come from
   * `file_host` at all. */
  mapError?: (error: unknown) => IntentError
}

export type UseIntentResult<TVariables, TData, TStep extends string = never> = {
  readonly state: Intent<TData, TStep>
  readonly presentation: IntentPresentation
  /** Wraps `mutate`. No per-call `onSuccess`/`onError` - see this module's
   * header for why. */
  readonly start: (variables: TVariables) => void
  /** Returns the intent to `idle`, discarding the last result. See this
   * module's header on the double-terminal case for when to call it. */
  readonly reset: () => void
}

function assertNever(_value: never): never {
  throw new Error("unhandled UseMutationResult status")
}

/**
 * Wraps one `UseMutationResult`. `TVariables`/`TData` are inferred from the
 * mutation; the mutation's own `mutationFn`, `onMutate`, `onSuccess`,
 * `onSettled` are untouched and still fire exactly as `lib/tenant/hooks.ts`
 * defines them - `useIntent` only reads `status`/`data`/`error`/`variables`
 * off the result TanStack already computed.
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
    // TanStack retains the variables from the last `mutate()` call on the
    // result itself; re-deriving them locally would risk disagreeing with
    // what actually ran. Nothing to retry with means nothing to do - not a
    // state `matchIntent`'s `failed` arm should ever actually observe,
    // since `retry` only exists once a mutation has already run once.
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
    // Switching on the destructured `status` (rather than `mutation.status`
    // inline) so the compiler narrows a plain string literal in the default
    // arm - narrowing `mutation.status` directly narrows `mutation` itself
    // to `never` once every case is covered, and `never` has no `.status`
    // to read at all.
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
