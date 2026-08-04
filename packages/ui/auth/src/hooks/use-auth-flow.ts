import { useCallback, useMemo, useState } from "react"

import type { AuthFlowStep } from "../types/auth"

export type UseAuthFlowOptions = {
  initialStep?: AuthFlowStep
}

export type UseAuthFlow = {
  step: AuthFlowStep
  goTo: (step: AuthFlowStep) => void
  /** Pops back to the previous step. No-op at the root of the stack. */
  back: () => void
  canGoBack: boolean
  reset: () => void
}

/**
 * Uncontrolled step state for `AuthFlow`, for consumers with no router.
 *
 * `AuthFlow` itself takes `step` / `onStepChange` as props rather than calling
 * this internally: once these steps live in the URL — which is where they
 * belong, so a password-reset link can land directly on `reset-password` — the
 * router owns the step, and a component that owns its own step cannot hand it
 * over. This hook is the fallback for the case where nothing else wants it.
 *
 * History is a stack rather than a single value so `back` from `verify-code`
 * returns to whichever step actually pushed it (sign-in or sign-up).
 */
export const useAuthFlow = ({
  initialStep = "sign-in",
}: UseAuthFlowOptions = {}): UseAuthFlow => {
  const [history, setHistory] = useState<Array<AuthFlowStep>>([initialStep])

  const step = useMemo(
    (): AuthFlowStep => history.at(-1) ?? initialStep,
    [history, initialStep]
  )

  const goTo = useCallback((next: AuthFlowStep): void => {
    setHistory((current) => [...current, next])
  }, [])

  const back = useCallback((): void => {
    setHistory((current) =>
      current.length > 1 ? current.slice(0, -1) : current
    )
  }, [])

  const reset = useCallback((): void => {
    setHistory([initialStep])
  }, [initialStep])

  return { step, goTo, back, canGoBack: history.length > 1, reset }
}
