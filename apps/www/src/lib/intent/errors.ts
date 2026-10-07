/**
 * The one place `apps/www` turns a `file_host` failure into what a person
 * needs to hear: `@some-ui/intent-kit` must not know `file_host` exists, so
 * the mapping from the three `FileHost*Error` classes
 * (`lib/file-host-config/{index,client}.ts`) to `IntentError` lives here.
 *
 * Each `kind` gets a default `summary`; a call site with sharper context
 * spreads and overrides it (`{ ...mapFileHostError(error), summary: "…" }`).
 *
 * A `401` is a `rejected` with its own wording, not a `kind`: the transport's
 * unauthorized handler has already ended the session (`lib/auth`), so an arm
 * for it would do nothing.
 */

import type { IntentError } from "@some-ui/intent-kit"
import { toIntentError as toGenericIntentError } from "@some-ui/intent-kit"

import { FileHostUnreachableError } from "@/lib/file-host-config"
import {
  FileHostNotConfiguredError,
  FileHostResponseError,
} from "@/lib/file-host-config/client"

/** A 5xx: the request was fine and the server failed, so a retry may work.
 * A 4xx: retrying the unchanged request won't. */
function isRetryableStatus(status: number): boolean {
  return status >= 500
}

/**
 * `FileHostUnreachableError` → the request never reached a server (dead LAN
 * box, mixed content, a proxy with nothing behind it): retryable by default.
 *
 * `error.retryable` is `false` only when `requestJSON`'s deadline fired on a
 * non-idempotent write (`client.ts`'s `isNonIdempotent`): `file_host` may
 * already have processed it. `blocksResubmission` rides with that case only,
 * because the outcome is ambiguous, so even a *new* attempt is unsafe (not
 * just repeating the same one).
 */
function fromUnreachable(error: FileHostUnreachableError): IntentError {
  return {
    kind: "unreachable",
    retryable: error.retryable,
    blocksResubmission: !error.retryable,
    summary: error.retryable
      ? "The study server isn't answering. Check your connection and try again."
      : "The study server didn't respond in time. It may have completed the request anyway - check before trying again.",
    cause: error,
  }
}

/**
 * `FileHostNotConfiguredError` → this deployment has no such feature, so a
 * retry button could not work.
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
 * `FileHostResponseError` → a real answer. `file_host`'s code rides on
 * `cause` for a developer; a person gets the status-derived summary.
 */
function fromResponseError(error: FileHostResponseError): IntentError {
  if (error.status === 401) {
    return {
      kind: "rejected",
      retryable: false,
      summary: "Your session has ended. Sign in with your passkey to continue.",
      cause: error,
    }
  }
  // The phone's backend: full; retryable once room is made (`device-backend/storage`).
  if (
    error.code === "max_record_limit_exceeded" &&
    error.route.startsWith("/sessions")
  ) {
    return {
      kind: "rejected",
      retryable: true,
      summary:
        "This phone is full, so this wasn't saved. Make room, then try again.",
      cause: error,
    }
  }
  // The phone's own storage (`device-backend/interceptor`): there is no
  // server to blame, and one that will not open is not a retry away.
  if (error.code === "device_storage_unavailable") {
    return {
      kind: "unavailable",
      retryable: false,
      summary:
        "This phone's storage couldn't be opened, so nothing here can load. Close the app and open it again.",
      cause: error,
    }
  }
  if (error.code === "device_storage_failed") {
    return {
      kind: "unreachable",
      retryable: true,
      summary: "This phone's storage didn't finish that. Try again.",
      cause: error,
    }
  }
  return {
    kind: "rejected",
    retryable: isRetryableStatus(error.status),
    summary: !isRetryableStatus(error.status)
      ? "That request couldn't be completed."
      : // In the Android app the "server" is the app itself, answering
        // from the phone's own database.
        import.meta.env.VITE_DEVICE_BACKEND === "true"
        ? "Something went wrong on this phone. Try again in a moment."
        : "The study server had a problem on its end. Try again in a moment.",
    cause: error,
  }
}

/**
 * Total, never throws. Anything but the three `FileHost*Error` classes falls
 * back to `@some-ui/intent-kit`'s `toIntentError` (`kind: "unknown"`,
 * `retryable: true`).
 */
export function mapFileHostError(error: unknown): IntentError {
  if (error instanceof FileHostUnreachableError) return fromUnreachable(error)
  if (error instanceof FileHostNotConfiguredError)
    return fromNotConfigured(error)
  if (error instanceof FileHostResponseError) return fromResponseError(error)
  return toGenericIntentError(error)
}
