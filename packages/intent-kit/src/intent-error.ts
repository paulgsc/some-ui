/**
 * The user-facing projection of whatever actually failed.
 *
 * This is not a fourth parallel error taxonomy — `apps/www/src/lib/file-host-config/client.ts`'s
 * three `FileHost*Error` classes and `@some-ui/fetch-kit`'s `ApiError` stay
 * exactly as they are; this is what they get mapped *to* at the boundary
 * that actually knows what a person needs to hear. `intent-kit` itself
 * knows nothing about HTTP, `file_host`, or any other transport — the
 * mapping lives with whichever app or package owns the transport (see
 * `apps/www/src/lib/intent/errors.ts`).
 *
 * `unauthorized` is deliberately absent from `kind`. Nothing in this
 * workspace has an auth layer that can produce one today, and an
 * unreachable arm in a union whose entire value is exhaustiveness teaches
 * every reader that arms are decorative. Add it back the day something
 * actually produces it.
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
 *   always lands here rather than throwing; a normalizer that can fail is a
 *   new silent-failure family, which is exactly what this vocabulary exists
 *   to close off.
 */
export type IntentErrorKind =
  | "unreachable"
  | "rejected"
  | "unavailable"
  | "unknown"

export type IntentError = {
  readonly kind: IntentErrorKind
  /** Whether re-running the same intent could plausibly succeed. Derived
   * from the error class by the boundary's own mapper, never hand-set per
   * call site — see `apps/www/src/lib/intent/errors.ts`'s header for why. */
  readonly retryable: boolean
  /** For a person. Plain text, no markup, safe to render as-is. */
  readonly summary: string
  /**
   * For a developer. Never rendered — required rather than optional so the
   * diagnostic channel and the signal channel can't drift apart by one
   * being forgotten. Log it, attach it to a report; do not put it in the
   * DOM.
   */
  readonly cause: unknown
}

const GENERIC_SUMMARY = "Something didn't work. You can try again."

/**
 * The fallback normalizer: total, and never throws. Anything this function
 * doesn't recognise still produces a valid `IntentError` — `kind: "unknown"`,
 * `retryable: true`, because the safer default for a failure this boundary
 * can't name is to let a person try again rather than to tell them not to.
 *
 * App/package boundaries that know about a specific transport (file_host,
 * a REST client, …) should normalize first and fall back to this only for
 * what they don't recognise — see `apps/www/src/lib/intent/errors.ts`.
 */
export function toIntentError(error: unknown): IntentError {
  return {
    kind: "unknown",
    retryable: true,
    summary: GENERIC_SUMMARY,
    cause: error,
  }
}
