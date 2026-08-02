/**
 * Abort plumbing shared by every adapter.
 *
 * "Cancelled" is not a failure: the queue distinguishes an item the user
 * interrupted (drop it, move on) from one that genuinely failed (retry,
 * then record it). That distinction is carried by the error's `name`, so
 * every cancellation path in this package must produce an `AbortError` and
 * nothing else.
 */

export const ABORT_ERROR_NAME = "AbortError"

/**
 * `DOMException` exists in browsers, jsdom and modern Node, but this package
 * is also imported by bundler/SSR passes where it may not - hence the
 * fallback, which is name-compatible with what `isAbortError` checks.
 */
export function createAbortError(message = "Speech aborted"): Error {
  if (typeof DOMException === "function") {
    return new DOMException(message, ABORT_ERROR_NAME)
  }
  const error = new Error(message)
  error.name = ABORT_ERROR_NAME
  return error
}

/**
 * Duck-typed rather than `instanceof Error`, and deliberately so: the
 * platform reports cancellation with a `DOMException`, which is an `Error`
 * subclass in browsers but *not* in jsdom. An `instanceof` check there
 * silently reclassifies every cancellation as a synthesis failure - the
 * queue would then retry utterances the user had just cancelled.
 */
function isErrorLike(value: unknown): value is Error {
  if (value instanceof Error) return true
  if (typeof value !== "object" || value === null) return false
  if (!("name" in value) || !("message" in value)) return false
  return typeof value.name === "string" && typeof value.message === "string"
}

export function isAbortError(error: unknown): boolean {
  return isErrorLike(error) && error.name === ABORT_ERROR_NAME
}

export const TIMEOUT_ERROR_NAME = "TimeoutError"

/**
 * Deliberately *not* an `AbortError`. A timeout is a failure of the speech
 * backend, not a user cancellation: the queue should retry it under the
 * item's `maxRetries` budget, whereas an `AbortError` means "this utterance
 * is no longer wanted" and must never come back.
 */
export function createTimeoutError(timeoutMs: number): Error {
  const error = new Error(`Speech request timed out after ${timeoutMs}ms`)
  error.name = TIMEOUT_ERROR_NAME
  return error
}

/**
 * Never re-wraps an error-like value. Wrapping a `DOMException` in a fresh
 * `Error` would drop its `name`, and `name` is the entire signal the queue
 * uses to tell a cancellation from a failure.
 */
export function toError(value: unknown): Error {
  return isErrorLike(value) ? value : new Error(String(value))
}

export type LinkedSignal = {
  readonly signal: AbortSignal
  /** Detaches the listeners and clears the timeout. Always call it. */
  release: () => void
}

/**
 * Composes any number of (possibly undefined) signals plus an optional
 * timeout into one signal, and hands back the teardown for it.
 *
 * `AbortSignal.any` would cover the composition half, but not the timeout
 * teardown, and it isn't available everywhere this package runs - one
 * controller and explicit listener removal works in every target and leaks
 * nothing.
 */
export function linkSignals(
  signals: ReadonlyArray<AbortSignal | undefined>,
  timeoutMs?: number
): LinkedSignal {
  const controller = new AbortController()
  const present = signals.filter((s): s is AbortSignal => s !== undefined)

  let timeoutId: ReturnType<typeof setTimeout> | null = null
  const listeners: Array<[AbortSignal, () => void]> = []

  const release = (): void => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId)
      timeoutId = null
    }
    for (const [signal, listener] of listeners) {
      signal.removeEventListener("abort", listener)
    }
    listeners.length = 0
  }

  const abortWith = (reason: Error): void => {
    release()
    controller.abort(reason)
  }

  const alreadyAborted = present.find((signal) => signal.aborted)
  if (alreadyAborted) {
    controller.abort(createAbortError("Speech aborted before it started"))
    return { signal: controller.signal, release }
  }

  for (const signal of present) {
    const listener = (): void => {
      abortWith(createAbortError("Speech aborted"))
    }
    signal.addEventListener("abort", listener, { once: true })
    listeners.push([signal, listener])
  }

  if (timeoutMs !== undefined && timeoutMs > 0) {
    timeoutId = setTimeout(() => {
      timeoutId = null
      abortWith(createTimeoutError(timeoutMs))
    }, timeoutMs)
  }

  return { signal: controller.signal, release }
}
