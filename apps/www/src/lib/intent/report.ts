/**
 * Every failure an intent shows also reaches the log (U3): `reportFailure`,
 * which on the phone writes to its native log (`lib/native-log`). A person
 * reads the summary; whoever reads the log gets its cause, which for a
 * refused request names the route, the status, the code and what the answer
 * said why (`FileHostResponseError`).
 *
 * A `ForeignCallError` is skipped: `callForeign` reported it when it failed.
 *
 * Promise IR1.
 * - Claim: every failure `useIntent` or `useAsyncIntent` shows reaches
 *   `reportFailure` once, and a refused request's line says why it was refused.
 * - Family: both hooks; a refusal, a foreign call's failure, anything else;
 *   the first failure and each one a retry brings.
 * - Proof: `__tests__/report.test.tsx`, one case per dimension.
 */
import { useEffect, useEffectEvent } from "react"
import type { IntentError } from "@some-ui/intent-kit"
import { reportFailure } from "@some-ui/intent-kit"

import { ForeignCallError } from "./foreign"

/** The port a shown failure is logged under. */
const SHOWN_FAILURE_PORT = "intent"

/**
 * Reports `failure` once each time it changes to a new failure. `null` while
 * the intent is not failed.
 */
export function useReportShownFailure(
  failure: { readonly error: unknown } | null,
  mapError: (error: unknown) => IntentError
): void {
  const report = useEffectEvent((error: unknown): void => {
    reportFailure({ port: SHOWN_FAILURE_PORT, error: mapError(error) })
  })
  const error = failure?.error
  const failed = failure !== null
  useEffect(() => {
    if (!failed || error instanceof ForeignCallError) return
    report(error)
  }, [failed, error])
}
