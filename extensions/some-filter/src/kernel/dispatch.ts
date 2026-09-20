/**
 * The dispatch driver: runs a resumable task across as many bounded tasks
 * as it needs, restoring the page to a paintable state before every yield.
 *
 * ── the shape of a budgeted pass ─────────────────────────────────────────
 *
 * A pass is a generator. It yields once per unit of work it wants charged;
 * the driver charges it, and when the meter is exhausted the driver stops
 * pulling, closes the transaction, hands the main thread back, and picks up
 * from the same generator in a later task. The generator never sees the
 * task boundary — it is written as a straight-line walk — which is what
 * keeps the sense code readable after this change.
 *
 * ── the transaction, and why it closes before every yield ────────────────
 *
 * `pipeline.ts`'s `withVendorColorsVisible` disables this extension's own
 * colour sheets so sensing reads the vendor's page rather than the theme we
 * painted on it. It is a synchronous `try/finally` that relies on no frame
 * being painted before the `finally` restores them. Yielding inside that
 * window would let the browser paint the page with our theming stripped —
 * a white flash on exactly the pages this extension exists to darken, and a
 * direct violation of the prepaint contract.
 *
 * So the driver opens the transaction at the start of each task and closes
 * it before yielding. The page is only ever unthemed *within* a single
 * uninterrupted task, which is the same guarantee the original synchronous
 * version gave — it just gives it many times instead of once.
 *
 * The obvious objection is cost: toggling `CSSStyleSheet.disabled`
 * invalidates style document-wide, so one might expect K chunks to cost K
 * full style recalculations and turn an O(S) pass into O(S²/C). Measured
 * directly in Chromium 1194 against a 36,186-element dense diff, splitting
 * the same total reads across 1, 2, 4, 8, 16, 30 and 60 suppress/restore
 * cycles cost 68.9, 60.9, 70.3, 64.5, 56.1, 60.8 and 57.3ms respectively —
 * i.e. flat, with the trend if anything downward. Chromium's invalidation
 * is lazy and incremental: the elements whose style gets re-resolved are
 * the ones being read anyway, and the reads dominate. `bench-suppress.mjs`
 * in this package re-runs that measurement.
 *
 * That measurement is load-bearing for this whole design, so it is stated
 * here with its numbers rather than as "benchmarking showed it was fine".
 * If a future engine makes the toggle eager, this file is where the
 * assumption lives and the canary is what will catch it.
 */

import {
  createCreditMeter,
  DEFAULT_DISPATCH_BUDGET,
  type CreditMeter,
} from "./credit"

/**
 * A resumable pass. Each `yield` is one chargeable unit; the yielded number
 * is the cost, so a step that performs a style read can charge more than
 * one that only advances a cursor.
 */
export type BudgetedPass<T> = Generator<number, T, void>

/** Cancels a pass that a later round has superseded. */
export type CancelToken = {
  readonly cancelled: () => boolean
}

export const NEVER_CANCELLED: CancelToken = { cancelled: () => false }

/** Creates a token that a caller can trip when a newer round starts. */
export function createCancelToken(): CancelToken & { cancel: () => void } {
  let flag = false
  return { cancelled: () => flag, cancel: () => (flag = true) }
}

export type DispatchOptions = {
  /** Credit per task. Defaults to `DEFAULT_DISPATCH_BUDGET`. */
  readonly budget?: number
  /**
   * Wraps each task. Opened when the task starts, closed before the yield —
   * see this module's header. Defaults to running the task bare.
   */
  readonly transaction?: <R>(fn: () => R) => R
  /** Stops the pass between tasks when a newer round supersedes it. */
  readonly token?: CancelToken
  /** Hands the main thread back. Defaults to `setTimeout(…, 0)`. */
  readonly yieldToBrowser?: (resume: () => void) => void
  /** Throw instead of continuing when a pass overspends. Used by conformance tests. */
  readonly strict?: boolean
  /** Observes each task's spend — the hook the conformance test asserts on. */
  readonly onTask?: (spent: number, budget: number) => void
}

/** One task's outcome. A union, so the completed branch carries a `T` without an assertion. */
type TaskOutcome<T> =
  | { readonly done: true; readonly value: T }
  | { readonly done: false }

export type DispatchResult<T> =
  | { readonly kind: "completed"; readonly value: T; readonly tasks: number }
  | { readonly kind: "cancelled"; readonly tasks: number }

/**
 * Yields to the browser. `setTimeout(0)` rather than `requestIdleCallback`
 * deliberately: idle callbacks can be starved indefinitely on a busy page,
 * and a sense pass that never finishes leaves the veil up — the relay's
 * "bounded blackout that never completes", which is not an acceptable fix
 * for a hang. A macrotask turn always runs, and always after pending input.
 */
function defaultYield(resume: () => void): void {
  setTimeout(resume, 0)
}

/**
 * Drives `pass` to completion across bounded tasks.
 *
 * Returns a promise because completion genuinely spans tasks. Callers that
 * need the *first* task's partial effect synchronously (the prepaint commit
 * path does) should read whatever the pass has published so far rather than
 * awaiting — the pass is written to keep its accumulator consistent at
 * every yield point, which is also what makes cancellation safe.
 */
export async function runBudgeted<T>(
  pass: BudgetedPass<T>,
  options: DispatchOptions = {}
): Promise<DispatchResult<T>> {
  const {
    budget = DEFAULT_DISPATCH_BUDGET,
    transaction = <R>(fn: () => R): R => fn(),
    token = NEVER_CANCELLED,
    yieldToBrowser = defaultYield,
    strict = false,
    onTask,
  } = options

  let tasks = 0

  for (;;) {
    if (token.cancelled()) {
      // Close the generator so its `finally` blocks run — a pass holding a
      // TreeWalker or a partially built accumulator gets to clean up. The
      // return value is discarded, so it is widened rather than asserted.
      const closable: Generator<number, T | undefined, void> = pass
      closable.return(undefined)
      return { kind: "cancelled", tasks }
    }

    tasks += 1
    const meter: CreditMeter = createCreditMeter(budget, strict)

    // One task: open the transaction, spend down the meter, close it. The
    // page is never left unthemed across the yield below.
    const outcome = transaction((): TaskOutcome<T> => {
      for (;;) {
        const step = pass.next()
        if (step.done === true) return { done: true, value: step.value }
        meter.spend(step.value)
        if (meter.exhausted()) return { done: false }
      }
    })

    onTask?.(meter.spent(), budget)

    if (outcome.done) {
      return { kind: "completed", value: outcome.value, tasks }
    }

    await new Promise<void>((resolve) => {
      yieldToBrowser(resolve)
    })
  }
}

/**
 * Runs a budgeted pass to completion in **one synchronous task**, ignoring
 * the budget entirely.
 *
 * This deliberately reintroduces the exact defect the kernel exists to fix:
 * an uninterruptible pass whose duration is decided by the visited page. It
 * exists only so a budgeted pass can be the single implementation while its
 * callers are migrated one at a time — the synchronous entry points keep
 * working, unchanged in behaviour, by draining the generator, and there is
 * no second copy of the sense logic to drift out of agreement with the
 * first.
 *
 * Every remaining caller is a migration debt. When the last one is gone this
 * function goes with it (SF-BUD6), and the admission gate is what makes that
 * non-optional: while a drained pass is still reachable, the bundle still
 * contains an unbounded traversal and the ledger still has to declare it as
 * one.
 *
 * Do not reach for this to "avoid making a function async". That is the
 * synchronous façade the migration plan explicitly rules out.
 */
export function drainUnbudgeted<T>(pass: BudgetedPass<T>): T {
  let step = pass.next()
  while (step.done !== true) step = pass.next()
  return step.value
}
