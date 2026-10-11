/**
 * What every `callForeign` port in `apps/www` shares: Capacitor's sign of a
 * plugin missing from this build, and turning a call's outcome into a value
 * or a thrown error. `@some-ui/intent-kit` must not know Capacitor exists,
 * so these live here.
 */

import type { ForeignCall, IntentError } from "@some-ui/intent-kit"

/**
 * A Capacitor `code` of `UNAVAILABLE` or `UNIMPLEMENTED`: no such plugin (or
 * native service) in this build, which no retry changes.
 */
export function isMissingPlugin(error: unknown): boolean {
  const code: unknown =
    typeof error === "object" && error !== null
      ? Reflect.get(error, "code")
      : undefined
  return code === "UNAVAILABLE" || code === "UNIMPLEMENTED"
}

/** A failed `callForeign`, as its port classified it (`mapFileHostError` reads it). */
export class ForeignCallError extends Error {
  constructor(readonly error: IntentError) {
    super(error.summary, { cause: error.cause })
    this.name = "ForeignCallError"
  }
}

/**
 * The call's value. A failure is thrown as `failed` makes it, a
 * `ForeignCallError` unless the caller says otherwise.
 */
export async function foreignValue<T>(
  call: Pick<ForeignCall<T>, "outcome">,
  failed: (error: IntentError) => unknown = (error) =>
    new ForeignCallError(error)
): Promise<T> {
  const outcome = await call.outcome
  if (outcome.status === "succeeded") return outcome.value
  if (outcome.status === "failed") throw failed(outcome.error)
  // Nothing in this app abandons a call.
  throw new Error("a foreign call was abandoned")
}
