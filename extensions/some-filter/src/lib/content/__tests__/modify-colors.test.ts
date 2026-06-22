import { describe, expect, it } from "vitest"

import type { RGBA } from "../color"
import { relativeLuminance } from "../color"
import {
  hslToRGB,
  modifyBackgroundColor,
  modifyBorderColor,
  modifyForegroundColor,
  rgbaToCss,
  rgbToHSL,
} from "../modify-colors"

const lum = ([r, g, b]: RGBA): number => relativeLuminance(r, g, b)

describe("rgbToHSL / hslToRGB", () => {
  it("round-trips primary colors", () => {
    const colors: Array<RGBA> = [
      [1, 0, 0, 1],
      [0, 1, 0, 1],
      [0, 0, 1, 1],
      [0.2, 0.4, 0.6, 1],
    ]
    for (const c of colors) {
      const back = hslToRGB(rgbToHSL(c))
      expect(back[0]).toBeCloseTo(c[0], 5)
      expect(back[1]).toBeCloseTo(c[1], 5)
      expect(back[2]).toBeCloseTo(c[2], 5)
    }
  })

  it("computes hue for pure red as 0", () => {
    expect(rgbToHSL([1, 0, 0, 1]).h).toBeCloseTo(0)
  })

  it("computes hue for pure blue as 240", () => {
    expect(rgbToHSL([0, 0, 1, 1]).h).toBeCloseTo(240)
  })
})

describe("modifyBackgroundColor", () => {
  it("turns white into a dark surface", () => {
    expect(lum(modifyBackgroundColor([1, 1, 1, 1]))).toBeLessThan(0.2)
  })

  it("keeps already-dark backgrounds dark", () => {
    expect(lum(modifyBackgroundColor([0, 0, 0, 1]))).toBeLessThan(0.2)
  })

  it("preserves hue (light blue → dark blue, blue channel dominant)", () => {
    const [r, g, b] = modifyBackgroundColor([0.78, 0.86, 1, 1])
    expect(b).toBeGreaterThan(r)
    expect(b).toBeGreaterThan(g)
  })

  it("preserves alpha", () => {
    expect(modifyBackgroundColor([1, 1, 1, 0.5])[3]).toBe(0.5)
  })
})

describe("modifyForegroundColor", () => {
  it("lifts dark text into a readable light range", () => {
    expect(lum(modifyForegroundColor([0, 0, 0, 1]))).toBeGreaterThan(0.3)
  })

  it("preserves hue for colored text", () => {
    const [r, g, b] = modifyForegroundColor([0.6, 0, 0, 1]) // dark red
    expect(r).toBeGreaterThan(g)
    expect(r).toBeGreaterThan(b)
  })
})

describe("modifyBorderColor", () => {
  it("produces a low, mid-dark lightness", () => {
    const l = lum(modifyBorderColor([1, 1, 1, 1]))
    expect(l).toBeGreaterThan(0.02)
    expect(l).toBeLessThan(0.2)
  })
})

describe("rgbaToCss", () => {
  it("serializes opaque colors as rgb()", () => {
    expect(rgbaToCss([1, 0, 0, 1])).toBe("rgb(255, 0, 0)")
  })

  it("serializes translucent colors as rgba()", () => {
    expect(rgbaToCss([1, 1, 1, 0.5])).toBe("rgba(255, 255, 255, 0.5)")
  })

  it("clamps out-of-range channels", () => {
    expect(rgbaToCss([1.4, -0.2, 0.5, 1])).toBe("rgb(255, 0, 128)")
  })
})
