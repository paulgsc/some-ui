import type { TopikMetadata } from "@topik/lib/topik"
import { describe, expect, it } from "vitest"

import { getRecommendedItems } from "./index"

function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function makeMetadata(
  overrides: Partial<TopikMetadata> & { key: string }
): TopikMetadata {
  return {
    displayName: overrides.key,
    description: "d",
    batchCount: 1,
    totalQuestions: 1,
    totalMessages: 1,
    ...overrides,
  }
}

describe("getRecommendedItems", () => {
  it("filters out items with no batches", () => {
    const empty = makeMetadata({ key: "a", batchCount: 0 })
    const populated = makeMetadata({ key: "b", batchCount: 1 })
    expect(getRecommendedItems([empty, populated])).toEqual([populated])
  })

  it("sorts by batchCount descending, then totalQuestions descending", () => {
    const a = makeMetadata({ key: "a", batchCount: 2, totalQuestions: 5 })
    const b = makeMetadata({ key: "b", batchCount: 3, totalQuestions: 1 })
    const c = makeMetadata({ key: "c", batchCount: 2, totalQuestions: 9 })
    expect(getRecommendedItems([a, b, c])).toEqual([b, c, a])
  })

  it("slices to the requested count, defaulting to 6", () => {
    const items = Array.from({ length: 10 }, (_, i) =>
      makeMetadata({ key: `k${i}`, batchCount: 10 - i })
    )
    expect(getRecommendedItems(items)).toHaveLength(6)
    expect(getRecommendedItems(items, 3)).toHaveLength(3)
    expect(getRecommendedItems(items, 0)).toHaveLength(0)
  })

  it("does not mutate the input array", () => {
    const items = [
      makeMetadata({ key: "a", batchCount: 1 }),
      makeMetadata({ key: "b", batchCount: 2 }),
    ]
    const originalOrder = [...items]
    getRecommendedItems(items)
    expect(items).toEqual(originalOrder)
  })

  it("property: result never exceeds count, never includes an empty topik, and stays sorted", () => {
    const rand = mulberry32(0x5eed)
    const randInt = (min: number, max: number): number =>
      Math.floor(rand() * (max - min + 1)) + min

    for (let trial = 0; trial < 200; trial++) {
      const n = randInt(0, 15)
      const count = randInt(0, 8)
      const items = Array.from({ length: n }, (_, i) =>
        makeMetadata({
          key: `k${i}`,
          batchCount: randInt(0, 3),
          totalQuestions: randInt(0, 3),
        })
      )

      const result = getRecommendedItems(items, count)

      expect(result.length).toBeLessThanOrEqual(count)
      expect(result.length).toBeLessThanOrEqual(
        items.filter((item) => item.batchCount > 0).length
      )
      for (const item of result) {
        expect(item.batchCount).toBeGreaterThan(0)
      }

      for (let i = 1; i < result.length; i++) {
        const prev = result[i - 1]!
        const curr = result[i]!
        const sortedCorrectly =
          prev.batchCount > curr.batchCount ||
          (prev.batchCount === curr.batchCount &&
            prev.totalQuestions >= curr.totalQuestions)
        expect(sortedCorrectly).toBe(true)
      }
    }
  })
})
