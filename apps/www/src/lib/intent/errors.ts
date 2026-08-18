/**
 * The one place `apps/www` turns a `file_host` failure into what a person
 * needs to hear. `@some-ui/intent-kit` must not know `file_host` exists —
 * see that package's own `intent-error.ts` header — so this module owns the
 * mapping from the three `FileHost*Error` classes
 * (`lib/file-host-config/{index,client}.ts`) to `IntentError`.
 *
 * ## Who authors `summary`
 *
 * The normalizer supplies a default per `kind`, written for the general
 * case ("the study server isn't answering"). A call site with sharper
 * context can override it — `IntentError` is a plain readonly object, so
 * `{ ...mapFileHostError(error), summary: "Couldn't start the session" }`
 * is the whole mechanism; no separate override parameter exists because
 * none is needed. Precise, call-site copy beats generic normalizer copy
 * when it's available; the normalizer default exists so the other sixteen
 * sites that don't bother to write their own don't invent sixteen
 * different phrasings of the same failure.
 *
 * ## `unauthorized` is absent
 *
 * `file_host` has no auth layer today. Per #942/#935's own recommendation,
 * an error kind with no producer is dropped rather than kept as a
 * placeholder — a `kind` a `matchIntent`-style caller must handle but can
 * never actually receive teaches that arms are decorative. Add it back the
 * day `file_host` grows an auth layer that can produce one.
 */

import type { IntentError } from "@some-ui/intent-kit"
import { toIntentError as toGenericIntentError } from "@some-ui/intent-kit"

import { FileHostUnreachableError } from "@/lib/file-host-config"
import {
  FileHostNotConfiguredError,
  FileHostResponseError,
} from "@/lib/file-host-config/client"

/** A non-2xx in the 5xx range is the server's own admission that the
 * request was fine and it failed anyway - the same request could succeed
 * on a retry. A 4xx says the request itself was the problem; retrying an
 * unchanged request against an unchanged server doesn't fix that. */
function isRetryableStatus(status: number): boolean {
  return status >= 500
}

/**
 * `FileHostUnreachableError` → `apps/www`'s own attempt at this request
 * never reached a server at all (dead LAN box, mixed content, a proxy with
 * nothing behind it). The transport itself said nothing yet, so retrying is
 * the correct default.
 */
function fromUnreachable(error: FileHostUnreachableError): IntentError {
  return {
    kind: "unreachable",
    retryable: true,
    summary:
      "The study server isn't answering. Check your connection and try again.",
    cause: error,
  }
}

/**
 * `FileHostNotConfiguredError` → this deployment has no such feature and
 * never will without reconfiguration (`client.ts`'s own doc comment: "this
 * server will never answer this, stop asking and fall back"). A retry
 * button on this is a button that cannot work.
 */
function fromNotConfigured(error: FileHostNotConfiguredError): IntentError {
  return {
    kind: "unavailable",
    retryable: false,
    summary: "This feature isn't available on this deployment.",
    cause: error,
  }
}

/**
 * `FileHostResponseError` → a real answer, with a real reason. `file_host`'s
 * own error code rides along on `cause` for a developer; a person gets the
 * status-derived summary because `error.code` values (`not_found`,
 * `internal_error`, …) are not written for a human to read cold.
 */
function fromResponseError(error: FileHostResponseError): IntentError {
  return {
    kind: "rejected",
    retryable: isRetryableStatus(error.status),
    summary: isRetryableStatus(error.status)
      ? "The study server had a problem on its end. Try again in a moment."
      : "That request couldn't be completed.",
    cause: error,
  }
}

/**
 * Total, never throws - the failure path is not where a normalizer is
 * allowed to fail. Anything that isn't one of the three known `FileHost*Error`
 * classes falls back to `@some-ui/intent-kit`'s generic `toIntentError`,
 * which lands on `kind: "unknown"`, `retryable: true`.
 */
export function mapFileHostError(error: unknown): IntentError {
  if (error instanceof FileHostUnreachableError) return fromUnreachable(error)
  if (error instanceof FileHostNotConfiguredError)
    return fromNotConfigured(error)
  if (error instanceof FileHostResponseError) return fromResponseError(error)
  return toGenericIntentError(error)
}
