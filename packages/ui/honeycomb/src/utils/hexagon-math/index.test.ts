import {
  getCellCountForHexagonalGridRadius,
  getHexagonalGridRadiusForCellCount,
} from "@honeycomb/utils/hexagon-math"
import { describe, expect, it } from "vitest"

describe("getCellCountForHexagonalGridRadius", () => {
  it.each([
    [0, 1],
    [1, 7],
    [2, 19],
    [3, 37],
    [4, 61],
  ])("radius %i has %i cells", (radius, expected) => {
    expect(getCellCountForHexagonalGridRadius(radius)).toBe(expected)
  })
})

describe("getHexagonalGridRadiusForCellCount", () => {
  it("returns 0 for a non-positive target", () => {
    expect(getHexagonalGridRadiusForCellCount(0)).toBe(0)
    expect(getHexagonalGridRadiusForCellCount(-5)).toBe(0)
  })

  it.each([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10])(
    "round-trips exactly through getCellCountForHexagonalGridRadius at radius %i",
    (radius) => {
      const cellCount = getCellCountForHexagonalGridRadius(radius)
      expect(getHexagonalGridRadiusForCellCount(cellCount)).toBe(radius)
    }
  )

  it("rounds an in-between cell count to the nearer radius", () => {
    // Between radius 1 (7 cells) and radius 2 (19 cells); 10 is closer to 7.
    expect(getHexagonalGridRadiusForCellCount(10)).toBe(1)
    // 14 is closer to 19 than to 7.
    expect(getHexagonalGridRadiusForCellCount(14)).toBe(2)
  })
})
