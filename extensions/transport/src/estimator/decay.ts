/**
 * Remark 3.3 (Tombstoning versus decay) — canon §3.3.
 *
 * Absence of continued evidence is strictly weaker than an explicit
 * mismatch (Corollary 4.1.1's continuity check, S5): a key briefly
 * unobserved must not be evicted — that would false-positive on
 * virtualization (Proposition 4.1) — but a key absent past a declared
 * staleness bound is evicted by a controlled, gated downward move, the one
 * sanctioned departure from §5's strict monotonicity. Gating: decay
 * bookkeeping is scoped to a single epoch (`reset()` clears it, wired to
 * the same Session reset (S3) that begins a fresh epoch) and it never
 * substitutes for the continuity check's *immediate* signal — decay only
 * ever handles "unobserved for a while," never "known to be gone now."
 */

import type { MutableHypothesis } from "./hypothesis"
import type { ProvenanceStore } from "./update"

export type DecayTracker<K, Attr> = {
  /** Records that `key` was reinforced by evidence at local tick `tick`. */
  touch(key: K, tick: number): void
  /**
   * Evicts every key whose most recent reinforcement is more than
   * `staleBound` ticks before `now`. A single call is one round of
   * sweeping — repeated, sustained absence, never a single observation,
   * is what drives an eviction. Returns the evicted keys.
   */
  sweep(
    now: number,
    staleBound: number,
    hypothesis: MutableHypothesis<K, Attr>,
    provenance: ProvenanceStore<K>
  ): Array<K>
  /** Clears all decay bookkeeping — call on an epoch reset (Definition 5.4). */
  reset(): void
}

export function createDecayTracker<K, Attr>(): DecayTracker<K, Attr> {
  const lastSeen = new Map<K, number>()

  return {
    touch(key: K, tick: number): void {
      lastSeen.set(key, tick)
    },
    sweep(now, staleBound, hypothesis, provenance): Array<K> {
      const evicted: Array<K> = []
      for (const [key, seenAt] of lastSeen) {
        if (now - seenAt > staleBound) {
          hypothesis.delete(key)
          provenance.delete(key)
          lastSeen.delete(key)
          evicted.push(key)
        }
      }
      return evicted
    },
    reset(): void {
      lastSeen.clear()
    },
  }
}
