/**
 * Definition 5.3 (Monotonic update), Theorem 5.1 (order-independence) —
 * canon §5.3.
 *
 * `U(Ĥ, s) = Ĥ with entry k replaced by max_⪯(Ĥ(k), s)`. Pure: no I/O, no
 * DOM access, no mutation beyond the `MutableHypothesis` and
 * `ProvenanceStore` passed in.
 */

import type { MutableHypothesis } from "./hypothesis"
import { compareEvidentiary, type Evidentiary } from "./order"

export type Evidence<K, Attr> = Evidentiary & {
  readonly key: K
  readonly attrs: Attr
}

/**
 * Per-key evidentiary provenance — the `(epoch, tier, timestamp)` of
 * whichever evidence currently wins `Ĥ(k)`. Not part of the public
 * `Hypothesis` query surface (Definition 5.1 only promises `Attr`); kept
 * separately so future evidence has something to compare against.
 */
export type ProvenanceStore<K> = Map<K, Evidentiary>

export function createProvenanceStore<K>(): ProvenanceStore<K> {
  return new Map()
}

/**
 * `U(Ĥ, s)`: folds one piece of evidence into the hypothesis. `compare`
 * defaults to `compareEvidentiary` (the shipped, epoch-dominant order); an
 * injected comparator exists only so the Lemma 5.2 regression test can
 * exercise the epoch-less counterexample without duplicating this function.
 */
export function update<K, Attr>(
  hypothesis: MutableHypothesis<K, Attr>,
  provenance: ProvenanceStore<K>,
  evidence: Evidence<K, Attr>,
  compare: (a: Evidentiary, b: Evidentiary) => number = compareEvidentiary
): void {
  const previous = provenance.get(evidence.key)
  if (previous === undefined || compare(evidence, previous) >= 0) {
    provenance.set(evidence.key, {
      epoch: evidence.epoch,
      tier: evidence.tier,
      timestamp: evidence.timestamp,
    })
    hypothesis.set(evidence.key, evidence.attrs)
  }
}
