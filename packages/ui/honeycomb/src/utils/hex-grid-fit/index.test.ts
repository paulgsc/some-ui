import { fitHexGrid, measureHexGridBounds } from "@honeycomb/utils/hex-grid-fit"
import { describe, expect, it } from "vitest"

const SQRT3 = Math.sqrt(3)

describe("measureHexGridBounds", () => {
  it.each([
    [0, 1, SQRT3, 2],
    [0, 10, SQRT3 * 10, 20],
    [1, 1, SQRT3 * 3, 5],
    [2, 1, SQRT3 * 5, 8],
    [4, 70, SQRT3 * 70 * 9, 70 * 14],
  ])(
    "radius %i, hexSize %i -> width %p, height %p",
    (radius, hexSize, width, height) => {
      const bounds = measureHexGridBounds(radius, hexSize)
      expect(bounds.width).toBeCloseTo(width)
      expect(bounds.height).toBeCloseTo(height)
    }
  )

  it("clamps negative radius and hexSize to zero", () => {
    expect(measureHexGridBounds(-3, 10)).toEqual(measureHexGridBounds(0, 10))
    expect(measureHexGridBounds(2, -10)).toEqual({ width: 0, height: 0 })
  })
})

describe("fitHexGrid", () => {
  it("fits at the preferred size when the viewport is generously large", () => {
    const result = fitHexGrid({
      viewport: { width: 1200, height: 1000 },
      requestedRadius: 4,
      preferredHexSize: 70,
    })

    expect(result).toMatchObject({
      radius: 4,
      hexSize: 70,
      status: "fit",
      canFit: true,
      warning: undefined,
    })
    expect(result.bounds).toEqual(measureHexGridBounds(4, 70))
  })

  it("reports shrunk when the preferred size no longer fits but the minimum does", () => {
    const result = fitHexGrid({
      viewport: { width: 800, height: 700 },
      requestedRadius: 4,
      preferredHexSize: 70,
    })

    expect(result.status).toBe("shrunk")
    expect(result.radius).toBe(4)
    expect(result.hexSize).toBe(70)
    expect(result.canFit).toBe(true)
    expect(result.warning).toMatch(/scaled down/i)
  })

  it("never reduces radius under the shrink-only strategy (the default)", () => {
    const result = fitHexGrid({
      viewport: { width: 100, height: 80 },
      requestedRadius: 4,
      preferredHexSize: 70,
    })

    expect(result.status).toBe("impossible")
    expect(result.radius).toBe(4)
    expect(result.canFit).toBe(false)
  })

  it("reports impossible with a minimum-required-size warning when even the minimum doesn't fit", () => {
    const result = fitHexGrid({
      viewport: { width: 100, height: 80 },
      requestedRadius: 4,
      preferredHexSize: 70,
      minHexSize: 18,
    })

    const expectedBounds = measureHexGridBounds(4, 18)
    expect(result.hexSize).toBe(18)
    expect(result.bounds).toEqual(expectedBounds)
    expect(result.warning).toContain(`${Math.ceil(expectedBounds.width)}`)
    expect(result.warning).toContain(`${Math.ceil(expectedBounds.height)}`)
  })

  it("reduces radius under shrink-then-reduce once shrinking alone can't keep cells legible", () => {
    const result = fitHexGrid({
      viewport: { width: 200, height: 200 },
      requestedRadius: 4,
      preferredHexSize: 70,
      minHexSize: 18,
      strategy: "shrink-then-reduce",
    })

    expect(result.status).toBe("reduced-radius")
    expect(result.radius).toBeLessThan(4)
    expect(result.hexSize).toBe(70)
    expect(result.canFit).toBe(true)
    expect(result.bounds).toEqual(measureHexGridBounds(result.radius, 70))
  })

  it("still reports impossible under shrink-then-reduce if even radius 0 can't fit", () => {
    const result = fitHexGrid({
      viewport: { width: 10, height: 10 },
      requestedRadius: 4,
      preferredHexSize: 70,
      minHexSize: 18,
      strategy: "shrink-then-reduce",
    })

    expect(result.status).toBe("impossible")
    expect(result.radius).toBe(0)
    expect(result.canFit).toBe(false)
  })

  it("subtracts padding from both dimensions before fitting", () => {
    const bare = fitHexGrid({
      viewport: { width: 200, height: 200 },
      requestedRadius: 0,
      preferredHexSize: 50,
      minHexSize: 10,
    })
    const padded = fitHexGrid({
      viewport: { width: 200, height: 200 },
      requestedRadius: 0,
      preferredHexSize: 50,
      minHexSize: 10,
      padding: 70,
    })

    expect(bare.status).toBe("fit")
    expect(padded.status).toBe("shrunk")
  })

  describe("boundary behavior around the minimum hex size", () => {
    // radius 0 -> width = hexSize * sqrt(3); pin height so width is the
    // binding constraint, and probe exactly at, just below, and just above
    // the point where the available width equals minHexSize * sqrt(3).
    const minHexSize = 10
    const threshold = minHexSize * SQRT3

    it("is impossible one unit below the threshold", () => {
      const result = fitHexGrid({
        viewport: { width: threshold - 0.01, height: 1000 },
        requestedRadius: 0,
        preferredHexSize: 20,
        minHexSize,
      })
      expect(result.status).toBe("impossible")
    })

    it("fits (as shrunk) exactly at the threshold", () => {
      const result = fitHexGrid({
        viewport: { width: threshold, height: 1000 },
        requestedRadius: 0,
        preferredHexSize: 20,
        minHexSize,
      })
      expect(result.status).toBe("shrunk")
      expect(result.canFit).toBe(true)
    })

    it("still fits (as shrunk) one unit above the threshold", () => {
      const result = fitHexGrid({
        viewport: { width: threshold + 0.01, height: 1000 },
        requestedRadius: 0,
        preferredHexSize: 20,
        minHexSize,
      })
      expect(result.status).toBe("shrunk")
    })
  })
})
