import { describe, expect, it } from "vitest"

import { averageIntoBars, IDLE_LEVEL } from "."

// Deterministic PRNG (same recipe used by lib/topik/utils/index.test.ts) so
// the property test below is reproducible across runs.
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

describe("averageIntoBars", () => {
  it("floors at IDLE_LEVEL when every input byte is 0 (silence)", () => {
    const data = new Uint8Array(32 * 4).fill(0)
    const bars = averageIntoBars(data, 32, 4)
    expect(bars).toHaveLength(32)
    expect(bars.every((v) => v === IDLE_LEVEL)).toBe(true)
  })

  it("returns 1 when every input byte is at the max (255)", () => {
    const data = new Uint8Array(32 * 4).fill(255)
    const bars = averageIntoBars(data, 32, 4)
    expect(bars.every((v) => v === 1)).toBe(true)
  })

  it("averages a bucket's bytes rather than sampling only the first one", () => {
    const data = new Uint8Array([0, 255])
    const bars = averageIntoBars(data, 1, 2)
    expect(bars[0]).toBeCloseTo(0.5)
  })

  it("property: output is always within [IDLE_LEVEL, 1] for random byte data", () => {
    const random = mulberry32(42)
    for (let trial = 0; trial < 200; trial++) {
      const barCount = 1 + Math.floor(random() * 8)
      const bucketSize = 1 + Math.floor(random() * 8)
      const data = new Uint8Array(barCount * bucketSize)
      for (let i = 0; i < data.length; i++) {
        data[i] = Math.floor(random() * 256)
      }

      const bars = averageIntoBars(data, barCount, bucketSize)
      expect(bars).toHaveLength(barCount)
      for (const value of bars) {
        expect(value).toBeGreaterThanOrEqual(IDLE_LEVEL)
        expect(value).toBeLessThanOrEqual(1)
      }
    }
  })
})
