import { describe, expect, it } from "vitest"

import { createHypothesis } from "./hypothesis"
import { compareTierOnly } from "./order"
import { createProvenanceStore, update, type Evidence } from "./update"

/**
 * Lemma 5.2 (Necessity of epoch dominance) — canon §5.4.
 *
 * A physical carrier is recycled by the vendor's rendering strategy so
 * that the logical key it renders changes across a navigation boundary.
 * A high-tier, user-driven property ("dismissed") was recorded against
 * the key while it denoted the *old* occupant; after recycling, a fresh,
 * low-tier ("raw") observation arrives in the *new* epoch for whatever now
 * occupies that key. Under the shipped, epoch-dominant order
 * (`compareEvidentiary`), the new epoch's evidence wins regardless of
 * tier, so the stale "dismissed" value does not leak onto the new
 * occupant. Under a tier-only order (`compareTierOnly`, Lemma 5.2's
 * counterexample), the stale high-tier value survives — exactly the
 * violation the lemma proves.
 */
describe("estimator — Lemma 5.2 (epoch dominance)", () => {
  const staleDismissal: Evidence<string, { dismissed: boolean }> = {
    key: "k",
    epoch: 1,
    tier: "full",
    timestamp: 100,
    attrs: { dismissed: true },
  }

  const freshPostRecycling: Evidence<string, { dismissed: boolean }> = {
    key: "k",
    epoch: 2,
    tier: "raw",
    timestamp: 5,
    attrs: { dismissed: false },
  }

  it("PASSES against the shipped comparator: the new epoch's evidence wins even though its tier is lower", () => {
    const h = createHypothesis<string, { dismissed: boolean }>()
    const p = createProvenanceStore<string>()

    update(h, p, staleDismissal)
    update(h, p, freshPostRecycling)

    expect(h.get("k")).toEqual({ dismissed: false })
  })

  it("FAILS against the epoch-less, tier-only comparator: the stale high-tier value silently survives (Lemma 5.2's counterexample, reproduced)", () => {
    const h = createHypothesis<string, { dismissed: boolean }>()
    const p = createProvenanceStore<string>()

    update(h, p, staleDismissal, compareTierOnly)
    update(h, p, freshPostRecycling, compareTierOnly)

    // This is the violation Lemma 5.2 proves is reachable without epoch
    // dominance: the stale "dismissed: true" value from the old occupant
    // is still recorded against `k` after recycling, in violation of any
    // invariant Φ distinguishing "reviewed" from "unreviewed" content.
    expect(h.get("k")).toEqual({ dismissed: true })
  })
})
