import fc from "fast-check"
import { describe, expect, it } from "vitest"

import type { ExtractionTier } from "../sensor/identity"
import { createHypothesis } from "./hypothesis"
import { compareEvidentiary, type Evidentiary } from "./order"
import { createProvenanceStore, update, type Evidence } from "./update"

type Attrs = { readonly seq: number }

describe("estimator/update — U (Definition 5.3)", () => {
  it("the first evidence for a key is always accepted (⊥ is dominated by anything)", () => {
    const h = createHypothesis<string, Attrs>()
    const p = createProvenanceStore<string>()
    update(h, p, {
      key: "k",
      epoch: 0,
      tier: "raw",
      timestamp: 0,
      attrs: { seq: 1 },
    })
    expect(h.get("k")).toEqual({ seq: 1 })
  })

  it("higher-ranked evidence replaces lower-ranked evidence for the same key", () => {
    const h = createHypothesis<string, Attrs>()
    const p = createProvenanceStore<string>()
    update(h, p, {
      key: "k",
      epoch: 0,
      tier: "raw",
      timestamp: 0,
      attrs: { seq: 1 },
    })
    update(h, p, {
      key: "k",
      epoch: 0,
      tier: "full",
      timestamp: 1,
      attrs: { seq: 2 },
    })
    expect(h.get("k")).toEqual({ seq: 2 })
  })

  it("lower-ranked evidence arriving after does not overwrite a higher-ranked value", () => {
    const h = createHypothesis<string, Attrs>()
    const p = createProvenanceStore<string>()
    update(h, p, {
      key: "k",
      epoch: 0,
      tier: "full",
      timestamp: 10,
      attrs: { seq: 2 },
    })
    update(h, p, {
      key: "k",
      epoch: 0,
      tier: "raw",
      timestamp: 100,
      attrs: { seq: 1 },
    })
    expect(h.get("k")).toEqual({ seq: 2 })
  })

  it("performs no I/O and mutates only the hypothesis/provenance passed in", () => {
    const h = createHypothesis<string, Attrs>()
    const p = createProvenanceStore<string>()
    const evidence: Evidence<string, Attrs> = {
      key: "k",
      epoch: 0,
      tier: "full",
      timestamp: 0,
      attrs: { seq: 1 },
    }
    expect(() => update(h, p, evidence)).not.toThrow()
    expect(p.get("k")).toEqual({ epoch: 0, tier: "full", timestamp: 0 })
  })
})

// Theorem 5.1: fold of U over any permutation/duplication of a finite
// multiset of tokens about a fixed key is independent of delivery order,
// and equals max_⪯({Ĥ_0(k)} ∪ M).
const tierArbitrary: fc.Arbitrary<ExtractionTier> = fc.constantFrom(
  "raw",
  "partial",
  "full"
)

// `attrs` is a deterministic function of the evidentiary triple, not an
// independently-random field: two evidences that rank equal under
// compareEvidentiary must also carry equal attrs, or "the" maximum would be
// ambiguous among ties, which is not what Theorem 5.1 claims.
const evidenceArbitrary: fc.Arbitrary<Evidence<string, Attrs>> = fc
  .record({
    epoch: fc.integer({ min: 0, max: 4 }),
    tier: tierArbitrary,
    timestamp: fc.integer({ min: 0, max: 200 }),
  })
  .map(({ epoch, tier, timestamp }) => ({
    key: "k",
    epoch: epoch,
    tier,
    timestamp,
    attrs: { seq: timestamp },
  }))

function maxEvidentiary<T extends Evidentiary>(evs: ReadonlyArray<T>): T {
  const first = evs[0]
  if (first === undefined) {
    throw new Error("empty multiset")
  }
  return evs.reduce(
    (best, e) => (compareEvidentiary(e, best) >= 0 ? e : best),
    first
  )
}

function fold(
  evidenceList: ReadonlyArray<Evidence<string, Attrs>>
): Attrs | undefined {
  const h = createHypothesis<string, Attrs>()
  const p = createProvenanceStore<string>()
  for (const e of evidenceList) {
    update(h, p, e)
  }
  return h.get("k")
}

describe("estimator/update — Theorem 5.1 (order-independence of the estimator)", () => {
  it("folding U over any permutation or duplication of a finite token multiset yields the same final hypothesis value", () => {
    fc.assert(
      fc.property(
        fc.array(evidenceArbitrary, { minLength: 1, maxLength: 30 }),
        (evidenceList) => {
          const expected = maxEvidentiary(evidenceList)

          const forward = fold(evidenceList)
          const reversed = fold([...evidenceList].reverse())
          const sorted = fold(
            [...evidenceList].sort((a, b) => compareEvidentiary(a, b))
          )
          const duplicated = fold([...evidenceList, ...evidenceList])

          expect(forward).toEqual(expected.attrs)
          expect(reversed).toEqual(expected.attrs)
          expect(sorted).toEqual(expected.attrs)
          expect(duplicated).toEqual(expected.attrs)
        }
      )
    )
  })
})
