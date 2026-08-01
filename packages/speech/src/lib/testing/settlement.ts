import { toError } from "@speech/lib/promise/abort"

/**
 * Watching a promise without consuming its outcome.
 *
 * Every assertion in this package's suite is ultimately "did this settle,
 * how, and by the time X returned?" - `track` makes all three observable
 * without an `await` that would itself change the answer.
 */

export type Settlement = {
  readonly state: "pending" | "resolved" | "rejected"
  readonly error: Error | null
  readonly promise: Promise<void>
}

export function track(promise: Promise<void>): Settlement {
  const settlement: {
    state: Settlement["state"]
    error: Error | null
    promise: Promise<void>
  } = {
    state: "pending",
    error: null,
    promise: Promise.resolve(),
  }

  settlement.promise = promise.then(
    () => {
      settlement.state = "resolved"
    },
    (error: unknown) => {
      settlement.state = "rejected"
      // `toError`, not an `instanceof` check: jsdom's `DOMException` is not
      // an `Error`, and re-wrapping it here would erase the `AbortError`
      // name the assertions are about.
      settlement.error = toError(error)
    }
  )

  return settlement
}

/**
 * Lets queued work drain: microtasks for anything settled through promise
 * callbacks, and a macrotask turn as well because a few platform steps on
 * the speech path (`Response.arrayBuffer`, `decodeAudioData`) resolve
 * across one.
 */
export async function flushAsync(times = 4): Promise<void> {
  for (let i = 0; i < times; i++) {
    await Promise.resolve()
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
  }
}
