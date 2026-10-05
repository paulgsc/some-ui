/**
 * The user-facing projection of whatever actually failed.
 *
 * Not another error taxonomy: transport errors (`FileHost*Error`, fetch-kit's
 * `ApiError`) are mapped *to* this at the boundary that knows what a person
 * needs to hear, by whoever owns the transport (see
 * `apps/www/src/lib/intent/errors.ts`). `intent-kit` knows no transport.
 *
 * `unauthorized` is deliberately absent: nothing produces it, and a dead arm
 * in a union whose value is exhaustiveness teaches that arms are decorative.
 */

/**
 * - `unreachable` — the transport is down (a dead LAN box, mixed content, a
 *   process that isn't running). Usually retryable: the request never
 *   landed anywhere.
 * - `rejected` — a real answer came back and said no (a non-2xx with a
 *   server-side reason). Retryable depends on whether the reason is
 *   transient.
 * - `unavailable` — the feature the caller wants doesn't exist on this
 *   deployment and never will without reconfiguration. Not retryable: no
 *   number of retries changes an absent capability.
 * - `unknown` — anything this boundary didn't recognise. `toIntentError`
 *   lands here rather than throwing: a normalizer that can fail would be a
 *   new silent failure.
 */
export type IntentErrorKind =
  | "unreachable"
  | "rejected"
  | "unavailable"
  | "unknown"

export type IntentError = {
  readonly kind: IntentErrorKind
  /** Whether re-running the same intent could plausibly succeed. Derived by
   * the boundary's mapper, never hand-set (see `apps/www/src/lib/intent/errors.ts`). */
  readonly retryable: boolean
  /**
   * Only meaningful when `retryable` is `false`; defaults to `false`. A new
   * attempt is usually harmless because the earlier one certainly never took
   * effect. Set `true` only when the last attempt's outcome is unknown (a
   * deadline fired on a non-idempotent write that may have landed), so a new
   * one could duplicate it. See `fromUnreachable` in
   * `apps/www/src/lib/intent/errors.ts`, the one producer.
   */
  readonly blocksResubmission?: boolean
  /** For a person. Plain text, no markup, safe to render as-is. */
  readonly summary: string
  /**
   * For a developer: log it, never render it. Required, so the diagnostic
   * channel cannot be forgotten.
   */
  readonly cause: unknown
}

const GENERIC_SUMMARY = "Something didn't work. You can try again."

/**
 * The fallback normalizer: total, never throws. An unrecognised failure is
 * `unknown` and retryable, the safer default. Transport-aware boundaries
 * normalize first and fall back to this (see `apps/www/src/lib/intent/errors.ts`).

 */
export function toIntentError(error: unknown): IntentError {
  return {
    kind: "unknown",
    retryable: true,
    summary: GENERIC_SUMMARY,
    cause: error,
  }
}
