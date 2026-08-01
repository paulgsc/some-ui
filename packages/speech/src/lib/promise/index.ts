/**
 * @module promise
 *
 * The settlement discipline every speech path in this package is built on.
 *
 * Speech is a long-running, interruptible side effect: a `speak()` call can
 * finish on its own, be cancelled by a higher-priority utterance, be torn
 * down when a session ends, or fail outright. Each of those has to settle
 * the promise the caller is holding - *exactly once, and before the thing
 * that caused it returns*. The bug class this module exists to make
 * impossible is the one that shipped previously: a `new Promise(async
 * (resolve) => ...)` executor that could only ever `resolve`, held in a ref
 * that a later `stop()` overwrote with a fresh `Promise.resolve()`. The
 * overwritten promise was never settled, its `await`ers never resumed, and
 * the queue behind it wedged - so state belonging to a finished session
 * stayed live and poisoned the next one.
 *
 * A `SpeechLedger` fixes that by construction. Every in-flight promise is
 * registered before it can be awaited and deregistered when it settles, so
 * "is anything still outstanding?" is an observable number rather than a
 * guess, and `flush()` can settle *all* of them on teardown.
 */

/** A promise handed to a caller, plus the one-shot handles that settle it. */
export type PendingSpeech = {
  readonly promise: Promise<void>
  /**
   * True once this entry has settled - further settle calls are no-ops.
   *
   * A method rather than a property so that callers reading it after an
   * `await` get the *current* answer: TypeScript narrows a boolean property
   * at its first check and keeps that narrowing across awaits, which would
   * quietly turn every post-await "did this get cancelled while I waited?"
   * guard into dead code.
   */
  isSettled: () => boolean
  resolve: () => void
  reject: (error: Error) => void
}

export type SpeechLedger = {
  /** How many promises are still outstanding. Zero at rest, always. */
  readonly size: number
  /** Opens a tracked promise. It deregisters itself once settled. */
  open: () => PendingSpeech
  /**
   * Rejects every outstanding entry with `error` and empties the ledger.
   * Synchronous: once this returns, `size` is 0 and no caller is left
   * waiting on work this ledger will never do.
   */
  flush: (error: Error) => void
}

export function createSpeechLedger(): SpeechLedger {
  const outstanding = new Set<PendingSpeech>()

  const open = (): PendingSpeech => {
    let resolveFn: () => void = () => undefined
    let rejectFn: (error: Error) => void = () => undefined
    let settled = false

    const promise = new Promise<void>((resolve, reject) => {
      resolveFn = resolve
      rejectFn = reject
    })

    // A rejection raised while nothing is awaiting yet (a flush in the same
    // tick as `open`, say) would otherwise surface as an unhandled rejection
    // and, under `--unhandled-rejections=strict`, take the process down.
    // The caller's own `.catch`/`await` is unaffected: attaching a handler
    // doesn't consume the rejection for anyone else.
    promise.catch(() => undefined)

    const entry: PendingSpeech = {
      promise,
      isSettled: () => settled,
      resolve: () => {
        if (settled) return
        settled = true
        outstanding.delete(entry)
        resolveFn()
      },
      reject: (error: Error) => {
        if (settled) return
        settled = true
        outstanding.delete(entry)
        rejectFn(error)
      },
    }

    outstanding.add(entry)
    return entry
  }

  const flush = (error: Error): void => {
    // Copy first: `reject` mutates `outstanding` as it goes.
    const entries = [...outstanding]
    outstanding.clear()
    for (const entry of entries) entry.reject(error)
  }

  return {
    get size(): number {
      return outstanding.size
    },
    open,
    flush,
  }
}
