/**
 * `useIntent`'s counterpart for the one flow in this app that was never a
 * TanStack mutation to begin with - `study-nudge-section.tsx`'s two async
 * handlers (a permission request chained into a push (un)subscription, and
 * sending a test notification). #947 names the gap directly: #943 built
 * `useIntent` only over `UseMutationResult`, and if that had been the whole
 * answer this file would not exist.
 *
 * Same shape, same doctrine as `useIntent` - no per-call `onSuccess`/
 * `onError` (a success continuation belongs in `matchIntent`'s `succeeded`
 * arm or `useIntentEffect`, same as everywhere else), the same
 * `dispatchingRef` thundering-herd guard, the same double-terminal case.
 * Implemented over local state instead of a mutation object because there
 * is no mutation object here to read - the guard clears the instant the
 * promise itself settles rather than waiting on a mutation's own status to
 * propagate through another render.
 *
 * This does not make `handleToggle`/`handleTest` visibly fail more often:
 * every browser-API wrapper they call (`service-worker.ts`'s own header)
 * already degrades to a named outcome instead of throwing. What this adds
 * is the two things the census found missing - a `working` state to
 * disable the control while the chain runs, and a real `failed` arm as the
 * backstop for whatever those wrappers didn't anticipate - without
 * touching the granular toasts already covering the outcomes they do name.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import type {
  Intent,
  IntentError,
  IntentPresentation,
} from "@some-ui/intent-kit"
import { failed, idle, succeeded, working } from "@some-ui/intent-kit"

import { mapFileHostError } from "./errors"

export type UseAsyncIntentOptions = {
  /** Required, not defaulted - see `use-intent.ts`'s identical field. */
  presentation: IntentPresentation
  mapError?: (error: unknown) => IntentError
}

export type UseAsyncIntentResult<TVariables, TData> = {
  readonly state: Intent<TData>
  readonly presentation: IntentPresentation
  readonly start: (variables: TVariables) => void
  readonly reset: () => void
}

type LocalState<TVariables, TData> =
  | { status: "idle" }
  | { status: "working" }
  | { status: "succeeded"; value: TData }
  | { status: "failed"; error: unknown; variables: TVariables }

function assertNever(_value: never): never {
  throw new Error("unhandled useAsyncIntent local status")
}

/**
 * Wraps a bare `(variables: TVariables) => Promise<TData>` - no mutation
 * object, no cache to invalidate. `fn` is read through a ref kept current
 * by its own effect (the same pattern `useIntentEffect` uses for
 * `onSucceeded`) so `start`/`retry` always call the latest closure without
 * needing to be recreated - and, on this component's own subscription
 * toggle, without missing a `preferences`/`onChange` prop that changed
 * between render and click.
 */
export function useAsyncIntent<TVariables, TData>(
  fn: (variables: TVariables) => Promise<TData>,
  options: UseAsyncIntentOptions
): UseAsyncIntentResult<TVariables, TData> {
  const mapError = options.mapError ?? mapFileHostError
  const [local, setLocal] = useState<LocalState<TVariables, TData>>({
    status: "idle",
  })

  const fnRef = useRef(fn)
  useEffect(() => {
    fnRef.current = fn
  })

  // See `use-intent.ts`'s "Thundering-herd guard" - same race, same fix.
  // Cleared the instant the promise settles rather than via an effect
  // keyed on a mutation's status, since there is no such status here.
  const dispatchingRef = useRef(false)

  const run = useCallback((variables: TVariables): void => {
    if (dispatchingRef.current) return
    dispatchingRef.current = true
    setLocal({ status: "working" })
    fnRef.current(variables).then(
      (value) => {
        dispatchingRef.current = false
        setLocal({ status: "succeeded", value })
      },
      (error: unknown) => {
        dispatchingRef.current = false
        setLocal({ status: "failed", error, variables })
      }
    )
  }, [])

  const retry = useCallback((): void => {
    if (local.status !== "failed") return
    run(local.variables)
  }, [local, run])

  const reset = useCallback((): void => {
    dispatchingRef.current = false
    setLocal({ status: "idle" })
  }, [])

  const state: Intent<TData> = ((): Intent<TData> => {
    switch (local.status) {
      case "idle": {
        return idle()
      }
      case "working": {
        return working()
      }
      case "succeeded": {
        return succeeded(local.value)
      }
      case "failed": {
        // eslint-disable-next-line react-hooks/refs -- `retry` closes over `dispatchingRef` (the thundering-herd guard above) but only reads `.current` when actually invoked later, never during this render - see use-intent.ts's identical justification.
        return failed(mapError(local.error), retry)
      }
      default: {
        return assertNever(local)
      }
    }
  })()

  return { state, presentation: options.presentation, start: run, reset }
}
