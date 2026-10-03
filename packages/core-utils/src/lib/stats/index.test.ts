import { describe, expect, it } from "vitest"

import { median, quantile } from "."

describe("median", () => {
  it("is the middle value, or the mean of the middle two", () => {
    expect(median([5, 1, 3])).toBe(3)
    expect(median([4, 1, 3, 2])).toBe(2.5)
  })

  it("is null for no values, leaving the fallback to the caller", () => {
    expect(median([])).toBeNull()
  })
})

describe("quantile", () => {
  it("interpolates between the values either side", () => {
    expect(quantile([0, 10, 20, 30], 0.25)).toBe(7.5)
    expect(quantile([0, 10, 20, 30], 1)).toBe(30)
  })
})
