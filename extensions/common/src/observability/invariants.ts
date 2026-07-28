/**
 * Invariant registry and runner — tier-0 (pure, no browser globals).
 *
 * An invariant is a statement that must hold every time it is checked ("no
 * active tab is suspended", "the scheduler's alarm exists"). Running them on a
 * cadence catches logic bugs *before* a user notices, and — more usefully for
 * an intermittent bug — records **which invariant broke first**, which is
 * almost always nearer the root cause than the symptom the user reports.
 *
 * Checks are pure with respect to a caller-supplied context: gathering the
 * context (querying tabs, reading alarms) is the adapter's job, so the checks
 * themselves are unit-testable with a plain object and no browser mock.
 */

import type { Invariant, InvariantOutcome, InvariantResult } from "./types"

/** Evaluate every invariant against one context snapshot. */
export async function runInvariants<Ctx>(
  invariants: ReadonlyArray<Invariant<Ctx>>,
  ctx: Ctx,
  now: number = Date.now()
): Promise<Array<InvariantResult>> {
  const results: Array<InvariantResult> = []
  for (const inv of invariants) {
    let outcome: InvariantOutcome
    try {
      outcome = await inv.check(ctx)
    } catch (error) {
      // A check that throws is itself a defect, but it must not take the
      // health report down with it — report it as unknown, not as a violation
      // of the property it was meant to test.
      outcome = {
        ok: "unknown",
        details: error instanceof Error ? error.message : String(error),
      }
    }
    results.push({
      name: inv.name,
      description: inv.description,
      status:
        outcome.ok === true
          ? "ok"
          : outcome.ok === false
            ? "violated"
            : "unknown",
      details: outcome.ok === true ? undefined : outcome.details,
      t: now,
    })
  }
  return results
}

/**
 * Reduce invariant results plus a recent-error count into a single score.
 *
 * Scoring is intentionally blunt: violations dominate, recent errors shave a
 * few points, and `unknown` costs nothing (an un-evaluable check is not
 * evidence of breakage). The number exists to make a *trend* legible on the
 * debug page and to decide when the popup should warn — not to be precise.
 */
export function scoreHealth(
  results: ReadonlyArray<InvariantResult>,
  recentErrors: number
): { score: number; status: "healthy" | "degraded" | "unhealthy" } {
  const evaluated = results.filter((r) => r.status !== "unknown")
  const violated = evaluated.filter((r) => r.status === "violated").length
  const base =
    evaluated.length === 0
      ? 100
      : Math.round(((evaluated.length - violated) / evaluated.length) * 100)
  const errorPenalty = Math.min(20, recentErrors * 2)
  const score = Math.max(0, base - errorPenalty)
  const status =
    violated > 0 || score < 60
      ? "unhealthy"
      : score < 95
        ? "degraded"
        : "healthy"
  return { score, status }
}
