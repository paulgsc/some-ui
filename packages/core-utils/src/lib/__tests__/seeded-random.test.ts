import {
  fnv1a,
  shuffledBySeed,
  unitIntervalBySeed,
  unitIntervalsBySeed,
} from "@core-utils/lib/seeded-random"
import { describe, expect, it } from "vitest"

describe("shuffledBySeed", () => {
  it("returns a permutation of its items and leaves them as they were", () => {
    const items = Array.from({ length: 22 }, (_, i) => i)
    const order = shuffledBySeed(items, 7)
    expect([...order].sort((a, b) => a - b)).toEqual(items)
    expect(items).toEqual(Array.from({ length: 22 }, (_, i) => i))
  })

  it("gives the same order for the same seed, and another for another", () => {
    const items = Array.from({ length: 10 }, (_, i) => i)
    expect(shuffledBySeed(items, 7)).toEqual(shuffledBySeed(items, 7))
    expect(shuffledBySeed(items, 7)).not.toEqual(shuffledBySeed(items, 8))
  })

  it("shuffles from a zero seed too, never stuck at zero", () => {
    const items = Array.from({ length: 10 }, (_, i) => i)
    // A generator stuck at zero swaps every place with the first.
    const stuck = [...items]
    for (let i = stuck.length - 1; i > 0; i -= 1) {
      const first = stuck[0]
      const here = stuck[i]
      if (first === undefined || here === undefined) continue
      stuck[0] = here
      stuck[i] = first
    }
    const order = shuffledBySeed(items, 0)
    expect(order).not.toEqual(items)
    expect(order).not.toEqual(stuck)
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
      expect(count).toBeGreaterThan(900)
      expect(count).toBeLessThan(1100)
    }
  })
})

describe("unitIntervalsBySeed", () => {
  it("replays the same draws in [0, 1) for a seed, starting where unitIntervalBySeed draws", () => {
    const draws = (seed: number): Array<number> => {
      const next = unitIntervalsBySeed(seed)
      return Array.from({ length: 1000 }, () => next())
    }
    expect(draws(7)).toEqual(draws(7))
    expect(draws(7)).not.toEqual(draws(8))
    expect(draws(7)[0]).toBe(unitIntervalBySeed(7))
    expect(draws(7).every((d) => d >= 0 && d < 1)).toBe(true)
    expect(new Set(draws(1)).size).toBe(1000)
  })
})
