/**
 * The boundary between this codebase's state machines and an API it does
 * not own: a native plugin, a browser permission prompt, an OS service.
 * Such an API answers when it likes, fails in its own words, and sometimes
 * never answers at all. Nothing it does reaches our state directly: a
 * `callForeign` turns it into one `ForeignOutcome`, in our vocabulary
 * (`IntentError`), by a deadline.
 *
 * # The laws (`__tests__/foreign.test.ts` checks them for any behaviour of
 * the foreign side)
 *
 * 1. **It settles.** `outcome` resolves exactly once and never rejects,
 *    whatever `start` does: resolve, reject with anything, throw, or never
 *    answer.
 * 2. **By a deadline.** Every call names one. If the foreign side has not
 *    answered by then, the outcome is `failed` with a `ForeignDeadlineError`
 *    as its cause, and `start`'s signal is aborted.
 * 3. **In our words, with its own.** A failure is an `IntentError`: the
 *    port's `classify` says what it means here (`unavailable` when no retry
 *    can help), and `cause` is exactly what the foreign side threw. A
 *    classifier that throws makes the failure `unknown`, never lost.
 * 4. **Told once.** Every `failed` outcome goes to the port's `report`
 *    exactly once (the diagnostic channel cannot be forgotten: it is
 *    required). `succeeded` and `abandoned` are not reported. The usual
 *    `report`, `reportFailure`, writes a console line that a production
 *    build keeps, and hands the failure to every sink the app added
 *    (`addFailureSink`: on the phone, its native log).
 * 5. **Late is ignored.** Once the outcome is decided (or the caller
 *    abandons), nothing the foreign side does afterwards changes it, is
 *    reported, or surfaces as an unhandled rejection.
 *
 * What this does not decide: what a feature does with each `kind`. That is
 * the feature's machine, which switches over a closed union (and
 * `switch-exhaustiveness-check` holds it to every arm). Withdrawing an
 * affordance on `unavailable` is the usual answer.
 *
 * Enforced as a count: `pnpm check:foreign-boundary` (docs/monorepo-
 * boundaries.md, F1) lists every wait on a foreign API that is not inside a
 * `callForeign`.
 */

import type { IntentError } from "./intent-error"
import { toIntentError } from "./intent-error"

/** What a port's classifier says a foreign failure means; the cause is added. */
export type ForeignVerdict = Omit<IntentError, "cause">

/** A failure as the port's reporter receives it. */
export type ForeignFailure = {
  /** The port's `name`. */
  readonly port: string
  readonly error: IntentError
}

/**
 * One foreign API as this codebase meets it. Written once per adapter (the
 * phone's recognizer, the notification service), shared by every call.
 */
export type ForeignPort = {
  /** For diagnostics only: "android speech recognizer". */
  readonly name: string
  /**
   * What the foreign side's failure means here. Only the adapter knows its
   * platform's vocabulary (a Capacitor `code: "UNAVAILABLE"`, a Web Speech
   * `"not-allowed"`), so this is the one part every port writes. A deadline
   * arrives as a `ForeignDeadlineError`. Expected not to throw; if it does,
   * the failure is classified `unknown`.
   */
  readonly classify: (error: unknown) => ForeignVerdict
  /**
   * Where every failure goes, cause included: log it, never render it.
   * `reportFailure` is the default most ports want.
   */
  readonly report: (failure: ForeignFailure) => void
}

export type ForeignOutcome<T> =
  | { readonly status: "succeeded"; readonly value: T }
  | { readonly status: "failed"; readonly error: IntentError }
  /** The caller let go first; nobody is waiting, so nothing is reported. */
  | { readonly status: "abandoned" }

export type ForeignCall<T> = {
  /** Settles exactly once, never rejects (laws 1 and 2). */
  readonly outcome: Promise<ForeignOutcome<T>>
  /**
   * Lets go: aborts `start`'s signal and settles `outcome` as `abandoned`,
   * unless it has already settled. Idempotent.
   */
  abandon(): void
}

export type ForeignCallOptions<T> = {
  readonly port: ForeignPort
  /**
   * How long the foreign side may take, in milliseconds: finite and
   * positive. There is no "wait forever", because that is the bug this
   * module exists for. A wait on a person (a permission prompt) still gets
   * one, long enough for a person.
   */
  readonly deadlineMs: number
  /**
   * Starts the foreign work. Called synchronously, so a browser API that
   * needs the user's gesture still has it. `signal` aborts on the deadline
   * and on `abandon`; pass it on where the platform takes one.
   */
  readonly start: (signal: AbortSignal) => PromiseLike<T> | T
}

/** The cause of a failure whose foreign side did not answer in time. */
export class ForeignDeadlineError extends Error {
  constructor(
    readonly port: string,
    readonly deadlineMs: number
  ) {
    super(`${port} did not answer within ${deadlineMs}ms`)
    this.name = "ForeignDeadlineError"
  }
}

/**
 * The first word of every line `reportFailure` writes, so a log can be
 * searched for failures (`adb logcat | grep foreign-failure`, the APK's
 * launch test).
 */
export const FOREIGN_FAILURE_TAG = "foreign-failure"

/** Somewhere else a reported failure should go, such as a native log. */
export type FailureSink = (failure: ForeignFailure) => void

const sinks = new Set<FailureSink>()

/**
 * Sends every failure `reportFailure` reports to `sink` as well, until the
 * returned function is called. For the app, once, at boot: on the phone,
 * its native log (apps/www `lib/native-log`).
 */
export function addFailureSink(sink: FailureSink): () => void {
  sinks.add(sink)
  return (): void => {
    sinks.delete(sink)
  }
}

/**
 * The usual `ForeignPort.report`: a console line with the cause, then each
 * sink. Through `globalThis.console`, on purpose: www's release minifier
 * strips the bare `console.*` form and keeps this one
 * (`apps/www/src/lib/intent/__tests__/release-console.test.ts` holds it to
 * that). A sink that throws is skipped, never fatal.
 */
export function reportFailure(failure: ForeignFailure): void {
  globalThis.console.error(
    FOREIGN_FAILURE_TAG,
    `[${failure.port}] ${failure.error.kind}: ${failure.error.summary}`,
    failure.error.cause
  )
  for (const sink of sinks) {
    try {
      sink(failure)
    } catch {
      // Nowhere left to report a reporter's own failure.
    }
  }
}

function classified(port: ForeignPort, cause: unknown): IntentError {
  try {
    return { ...port.classify(cause), cause }
  } catch {
    return toIntentError(cause)
  }
}

/** Runs `start` under the five laws in this module's header. */
export function callForeign<T>(options: ForeignCallOptions<T>): ForeignCall<T> {
  const { port, deadlineMs, start } = options
  if (!Number.isFinite(deadlineMs) || deadlineMs <= 0) {
    throw new RangeError(
      `callForeign(${port.name}): deadlineMs must be finite and positive, got ${deadlineMs}`
    )
  }
  const controller = new AbortController()
  let decided = false
  let timer: ReturnType<typeof setTimeout> | null = null
  let settle: (outcome: ForeignOutcome<T>) => void = () => undefined
  const outcome = new Promise<ForeignOutcome<T>>((resolve) => {
    settle = resolve
  })

  const decide = (next: ForeignOutcome<T>): void => {
    if (decided) return
    decided = true
    if (timer !== null) clearTimeout(timer)
    timer = null
    if (next.status !== "succeeded") controller.abort()
    settle(next)
    if (next.status !== "failed") return
    try {
      port.report({ port: port.name, error: next.error })
    } catch {
      // A reporter that throws must not undo law 1; there is nowhere left
      // to report its own failure.
    }
  }
  const fail = (cause: unknown): void => {
    if (!decided) decide({ status: "failed", error: classified(port, cause) })
  }

  timer = setTimeout(() => {
    timer = null
    fail(new ForeignDeadlineError(port.name, deadlineMs))
  }, deadlineMs)

  try {
    const started = start(controller.signal)
    // Every answer is listened to, so a late rejection is never unhandled.
    Promise.resolve(started).then(
      (value) => decide({ status: "succeeded", value }),
      fail
    )
  } catch (error) {
    fail(error)
  }

  return {
    outcome,
    abandon: (): void => decide({ status: "abandoned" }),
  }
}
