/**
 * Definition 5.2 (Per-key evidentiary order) — canon §5.2, Remark 5.1,
 * Lemma 5.2 (necessity of epoch dominance).
 *
 * Tokens about a fixed key are compared by the lexicographic order
 * `(epoch, tier, timestamp)`: epoch dominates tier dominates timestamp.
 * Total by construction — a lexicographic product of totally ordered
 * coordinates the estimator itself controls (Remark 5.1): epoch (S3) and
 * tier (S5) are the estimator's own bookkeeping; timestamp is the
 * channel's local clock, immune to cross-machine skew because it is never
 * compared across two different observer instances.
 */

import { compareTiers, type ExtractionTier } from "../sensor/identity"
import type { Epoch } from "../session/epoch"

export type Evidentiary = {
  readonly epoch: Epoch
  readonly tier: ExtractionTier
  readonly timestamp: number
}

/** `< 0` if `a ≺ b`, `0` if `a ≈ b`, `> 0` if `a ≻ b`. Epoch strictly dominates tier (Lemma 5.2). */
export function compareEvidentiary(a: Evidentiary, b: Evidentiary): number {
  if (a.epoch !== b.epoch) {
    return a.epoch - b.epoch
  }
  const tierCmp = compareTiers(a.tier, b.tier)
  if (tierCmp !== 0) {
    return tierCmp
  }
  return a.timestamp - b.timestamp
}

/**
 * Lemma 5.2's counterexample comparator — orders by `(tier, timestamp)`
 * alone, omitting epoch entirely. Exported *only* for the Lemma 5.2
 * regression test (`epoch-dominance.test.ts`): never wired into `update()`
 * for real use. A recycled carrier's stale high-tier value survives under
 * this comparator, which is exactly what that test observes failing.
 */
export function compareTierOnly(a: Evidentiary, b: Evidentiary): number {
  const tierCmp = compareTiers(a.tier, b.tier)
  if (tierCmp !== 0) {
    return tierCmp
  }
  return a.timestamp - b.timestamp
}
