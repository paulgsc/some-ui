import { fnv1a, shuffledBySeed } from "@core-utils/lib/seeded-random"
import { describe, expect, it } from "vitest"

describe("shuffledBySeed", () => {
  it("returns a permutation of its items and leaves them as they were", () => {
    const items = Array.from({ length: 22 }, (_, i) => i)
    const order = shuffledBySeed(items, 7)
    expect([...order].sort((a, b) => a - b)).toEqual(items)
    expect(items).toEqual(Array.from({ length: 22 }, (_, i) => i))
  })

  it("gives the same order for the same seed, a zero seed included", () => {
    for (const seed of [0, 1, 7, 2 ** 32 - 1])
      expect(shuffledBySeed(["a", "b", "c", "d"], seed)).toEqual(
        shuffledBySeed(["a", "b", "c", "d"], seed)
      )
    expect(shuffledBySeed(["a", "b", "c"], 0)).toHaveLength(3)
  })

  it("draws every order of three about equally often across seeds", () => {
    const counts = new Map<string, number>()
    for (let n = 0; n < 6000; n++) {
      // Seeds spread as a visit's would be, from one fixed hash chain.
      const order = shuffledBySeed(["a", "b", "c"], fnv1a(String(n))).join("")
      counts.set(order, (counts.get(order) ?? 0) + 1)
    }
    expect(counts.size).toBe(6)
    for (const count of counts.values()) {
      expect(count).toBeGreaterThan(850)
      expect(count).toBeLessThan(1150)
    }
  })
})
