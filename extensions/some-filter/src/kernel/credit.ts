/**
 * The credit meter — the thing that makes `budgeted` a fact rather than a
 * claim.
 *
 * `tests/budgets/effect-ledger.ts` declares a cost class for every
 * page-affecting primitive this extension ships, and the admission gate in
 * `@some-extension/common/budgets` refuses any build whose declarations
 * scale with the page. But a declaration is only as good as its enforcement:
 * nothing stopped an effect marked `budgeted` from walking the whole
 * document anyway. This module is that enforcement.
 *
 * ── the invariant ────────────────────────────────────────────────────────
 *
 * One *dispatch* is one uninterruptible task. Every page-affecting
 * operation performed inside it spends credit from a meter created with a
 * budget that is a constant of this codebase — not a function of S_i
 * (nodes), H_i (depth) or A_i (arrivals). When the meter is exhausted the
 * dispatch must stop and resume in a later task.
 *
 * That gives the property the budgets directory could previously only
 * assert: per-dispatch work is bounded by a number this repository chooses,
 * whatever page the extension was loaded against. Total work across
 * dispatches is still O(S_i) — a full scan genuinely has to look at every
 * node — but O(S_i) spread over ceil(S_i / budget) tasks is a responsive
 * page, and O(S_i) in one task is the browser's "Page unresponsive" dialog.
 *
 * ── why an explicit meter rather than a deadline ─────────────────────────
 *
 * A wall-clock deadline (`performance.now() - start > 16`) is the obvious
 * alternative and is worse here for two reasons. It is not deterministic,
 * so a conformance test cannot assert anything exact about it and a CI
 * runner's speed decides how much work a dispatch does. And it cannot be
 * checked statically at all — "this loop exits on time" is not a property
 * a reviewer can read off the code, whereas "this loop spends one unit per
 * element from a meter with a fixed budget" is.
 *
 * Wall-clock still matters, but as *calibration*: `DEFAULT_DISPATCH_BUDGET`
 * below is derived from a measurement, and the e2e canary is what falsifies
 * that derivation if it drifts.
 */

/**
 * Units of credit per operation class. These are relative weights, not
 * microseconds — the meter counts work, and the budget converts that count
 * into a task boundary.
 *
 * A computed-style read costs more than a node visit because it can force
 * the engine to resolve style for that element; measured at roughly 1.7µs
 * per read against a 36,000-element dense diff in Chromium 1194, versus a
 * bare `TreeWalker.nextNode()` which is closer to free.
 */
export const COST = {
  /** Advancing a traversal cursor by one element. */
  visit: 1,
  /** A `getComputedStyle` read, including the engine's possible style resolution. */
  styleRead: 4,
  /** Following one link of an ancestor chain, each step of which is itself a style read. */
  ancestorStep: 4,
  /** A DOM write (attribute tag, rule insertion) — cheap to issue, charged so it cannot be unbounded. */
  write: 2,
} as const

/**
 * Credit for one dispatch.
 *
 * Derived from the 50ms long-task threshold with a wide margin: at the
 * measured ~1.7µs per style read, 2,000 style reads is ~3.4ms of reads, and
 * the surrounding bookkeeping has been measured at well under the same
 * again. 8,000 units is therefore roughly 2,000 style reads or 8,000 node
 * visits — a single-digit-millisecond dispatch, an order of magnitude
 * inside the threshold, leaving room for the engine work a read can
 * trigger on a page denser than the one this was calibrated against.
 *
 * Deliberately not tuned to the fixture that motivated it. A budget chosen
 * so the current implementation "just fits" would silently become a
 * description of that implementation rather than a bound on it.
 */
export const DEFAULT_DISPATCH_BUDGET = 8_000

/** Thrown when a dispatch overspends. Never caught in production code — see `CreditMeter.spend`. */
export class CreditExhausted extends Error {
  constructor(spent: number, budget: number) {
    super(
      `dispatch overspent its credit: ${spent} of ${budget}. A budgeted ` +
        `operation ran past its task boundary instead of yielding, which ` +
        `means per-dispatch work is no longer bounded by this codebase.`
    )
    this.name = "CreditExhausted"
  }
}

export type CreditMeter = {
  /** Charges `units`. Returns false once the budget is used up, so callers can yield. */
  readonly spend: (units: number) => boolean
  /** True once the budget is used up. */
  readonly exhausted: () => boolean
  /** Units spent so far in this dispatch. */
  readonly spent: () => number
  readonly budget: number
}

/**
 * A meter for one dispatch.
 *
 * `spend` returns a boolean rather than throwing, because exhaustion is the
 * *normal* control flow — it means "yield now", not "something went wrong".
 * Overspending past exhaustion is the abnormal case: it means a caller
 * ignored the signal and kept working, which is precisely the defect this
 * module exists to prevent, so `strict` mode (used by the conformance
 * tests) throws on it.
 */
export function createCreditMeter(
  budget: number = DEFAULT_DISPATCH_BUDGET,
  strict = false
): CreditMeter {
  let spent = 0
  return {
    budget,
    spent: () => spent,
    exhausted: () => spent >= budget,
    spend: (units: number): boolean => {
      spent += units
      if (strict && spent > budget + units) {
        // `+ units` tolerates the single operation that crosses the
        // boundary: a caller that checks `exhausted()` after each step
        // necessarily discovers exhaustion one step late, and charging it
        // for that step is correct. Continuing *past* that is not.
        throw new CreditExhausted(spent, budget)
      }
      return spent < budget
    },
  }
}
