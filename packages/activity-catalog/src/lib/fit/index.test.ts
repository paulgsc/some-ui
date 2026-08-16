import { describe, expect, it } from "vitest"

import { MAX_RECOMMENDED_COUNT, recommendedCount } from "."

describe("recommendedCount", () => {
  it("is one row of cards at each breakpoint", () => {
    expect(recommendedCount(390)).toBe(2) // phone
    expect(recommendedCount(639)).toBe(2)
    expect(recommendedCount(640)).toBe(3) // sm
    expect(recommendedCount(1023)).toBe(3)
    expect(recommendedCount(1024)).toBe(4) // lg
    expect(recommendedCount(2560)).toBe(4)
  })

  it("never exceeds the bound a first paint has to assume", () => {
    for (const width of [0, 320, 640, 1024, 4096]) {
      expect(recommendedCount(width)).toBeLessThanOrEqual(MAX_RECOMMENDED_COUNT)
    }
  })

  it("is never zero, so a very narrow window still launches something", () => {
    expect(recommendedCount(0)).toBeGreaterThan(0)
    expect(recommendedCount(240)).toBeGreaterThan(0)
  })
})
