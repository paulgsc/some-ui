/**
 * `useIntent`'s counterpart for flows that are not TanStack mutations
 * (`study-nudge-section.tsx`'s permission-plus-subscription chain and its
 * test notification).
 *
 * Same doctrine as `useIntent`: no per-call `onSuccess`/`onError`, the same
 * `dispatchingRef` guard, the same double-terminal case. Over local state, so
 * the guard clears the instant the promise settles. It adds a `working` state
 * to disable the control and a `failed` backstop; the wrappers it calls
 * already degrade to named outcomes rather than throwing.
 */

import { useCallback, useEffect, useRef, useState } from "react"
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

/**
 * Wraps a bare `(variables: TVariables) => Promise<TData>`. `fn` is read
 * through a ref kept current by an effect (as `useIntentEffect` does), so
 * `start`/`retry` call the latest closure without being recreated, and see a
 * prop that changed between render and click.
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

  // `use-intent.ts`'s "Thundering-herd guard", cleared when the promise
  // settles since there is no mutation status here.
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
