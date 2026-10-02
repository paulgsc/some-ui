/**
 * Every action the CRM takes, as an intent with an outcome the operator
 * hears about.
 *
 * `apps/www`'s doctrine (`lib/intent`, #933): an effect the person asked for
 * is an `interactive` intent - it has a `working` state that holds its
 * control, and a `failed` arm that is never silent and offers a retry when
 * one could work. This package cannot import `apps/www`'s toaster or its
 * `file_host` error mapping, so the host hands both in (`Reporting`), the
 * same way it hands in the client: the CRM decides *what* to say, the host
 * decides how it is shown (`sonner`, in `apps/www`).
 */

import { useCallback, useEffect, useRef, useState } from "react"
import type { Intent, IntentError } from "@some-ui/intent-kit"
import { failed, idle, succeeded, working } from "@some-ui/intent-kit"

/** One outcome, for the host to show on its overlay plane (a toast). */
export type CrmNotice =
  | { tone: "success"; title: string }
  | {
      tone: "error"
      title: string
      error: IntentError
      /** Present only when trying again could work (`error.retryable`). */
      retry?: () => void
    }

export type Reporting = {
  notify: (notice: CrmNotice) => void
  /** The host's normaliser for its transport's errors. */
  mapError: (error: unknown) => IntentError
}

export type OperationWords<V, T> = {
  /** What to say when it worked, or `null` to say nothing. */
  success: (value: T, variables: V) => string | null
  /** What failed, in the operator's words: "Couldn't save week-40". */
  failure: (variables: V) => string
}

export type Operation<V, T> = {
  readonly state: Intent<T>
  readonly start: (variables: V) => void
}

/**
 * What a start does while another is still working.
 *
 * - `drop` (the default, for writes): it is ignored. The control is held
 *   anyway; this guards the double click that lands before the re-render.
 * - `supersede` (for reads that follow a selection): it runs, and only the
 *   newest start's outcome is kept or reported. Opening lesson b while a is
 *   still loading is a new request, not a double click.
 */
export type Overlap = "drop" | "supersede"

/**
 * `fn` as an intent. `fn` and `words` are read through refs, so `start`
 * stays stable and always calls the latest closure.
 */
export function useOperation<V, T>(
  fn: (variables: V) => Promise<T>,
  words: OperationWords<V, T>,
  reporting: Reporting,
  overlap: Overlap = "drop"
): Operation<V, T> {
  const [state, setState] = useState<Intent<T>>(() => idle<T>())
  const latest = useRef({ fn, words, reporting })
  useEffect(() => {
    latest.current = { fn, words, reporting }
  })
  const running = useRef(false)
  const generation = useRef(0)

  const start = useCallback(
    // Named, so a failure's retry can start it again.
    function run(variables: V): void {
      if (running.current && overlap === "drop") return
      running.current = true
      const mine = ++generation.current
      setState(working<T>())
      const current = latest.current
      current.fn(variables).then(
        (value) => {
          if (mine !== generation.current) return
          running.current = false
          setState(succeeded<T>(value))
          const title = latest.current.words.success(value, variables)
          if (title !== null)
            latest.current.reporting.notify({ tone: "success", title })
        },
        (cause: unknown) => {
          if (mine !== generation.current) return
          running.current = false
          const error = latest.current.reporting.mapError(cause)
          const retry = (): void => run(variables)
          setState(failed<T>(error, retry))
          latest.current.reporting.notify({
            tone: "error",
            title: latest.current.words.failure(variables),
            error,
            ...(error.retryable ? { retry } : {}),
          })
        }
      )
    },
    [overlap]
  )

  return { state, start }
}
