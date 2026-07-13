import { describe, expect, it } from "vitest"

import { compareEvidentiary, compareTierOnly, type Evidentiary } from "./order"

function ev(
  epoch: number,
  tier: Evidentiary["tier"],
  timestamp: number
): Evidentiary {
  return { epoch: epoch, tier, timestamp }
}

describe("estimator/order — compareEvidentiary (Definition 5.2)", () => {
  it("epoch dominates tier: a later epoch always wins, regardless of tier", () => {
    const later = ev(2, "raw", 0)
    const earlier = ev(1, "full", 1000)
    expect(compareEvidentiary(later, earlier)).toBeGreaterThan(0)
  })

  it("within the same epoch, tier dominates timestamp", () => {
    const higherTier = ev(1, "full", 0)
    const lowerTierLaterTimestamp = ev(1, "partial", 1000)
    expect(
      compareEvidentiary(higherTier, lowerTierLaterTimestamp)
    ).toBeGreaterThan(0)
  })

  it("within the same (epoch, tier), timestamp breaks the tie", () => {
    const later = ev(1, "full", 10)
    const earlier = ev(1, "full", 5)
    expect(compareEvidentiary(later, earlier)).toBeGreaterThan(0)
  })

  it("is total: any two evidentiary tuples are comparable", () => {
    const a = ev(1, "raw", 0)
    const b = ev(1, "raw", 0)
    expect(compareEvidentiary(a, b)).toBe(0)
  })

  it("is anti-symmetric", () => {
    const a = ev(2, "full", 5)
    const b = ev(1, "raw", 999)
    expect(Math.sign(compareEvidentiary(a, b))).toBe(
      -Math.sign(compareEvidentiary(b, a))
    )
  })
})

describe("estimator/order — compareTierOnly (Lemma 5.2 counterexample comparator)", () => {
  it("ignores epoch entirely — a later epoch does not win against a higher tier", () => {
    const laterEpochLowerTier = ev(2, "raw", 0)
    const earlierEpochHigherTier = ev(1, "full", 0)
    expect(
      compareTierOnly(laterEpochLowerTier, earlierEpochHigherTier)
    ).toBeLessThan(0)
  })
})
