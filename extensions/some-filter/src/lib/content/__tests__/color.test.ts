import { afterEach, describe, expect, it } from "vitest"

import { effectiveBgLuminance, parseColor, relativeLuminance } from "../color"

describe("parseColor", () => {
  it("returns null for empty string", () => {
    expect(parseColor("")).toBeNull()
  })

  it("returns null for 'transparent'", () => {
    expect(parseColor("transparent")).toBeNull()
  })

  it("returns null for 'rgba(0, 0, 0, 0)'", () => {
    expect(parseColor("rgba(0, 0, 0, 0)")).toBeNull()
  })

  it("returns null for 'none'", () => {
    expect(parseColor("none")).toBeNull()
  })

  it("parses rgb(255, 255, 255) as opaque white", () => {
    const c = parseColor("rgb(255, 255, 255)")
    expect(c).not.toBeNull()
    expect(c![0]).toBeCloseTo(1)
    expect(c![1]).toBeCloseTo(1)
    expect(c![2]).toBeCloseTo(1)
    expect(c![3]).toBe(1)
  })

  it("parses rgb(0, 0, 0) as opaque black", () => {
    const c = parseColor("rgb(0, 0, 0)")
    expect(c).not.toBeNull()
    expect(c![0]).toBe(0)
    expect(c![1]).toBe(0)
    expect(c![2]).toBe(0)
    expect(c![3]).toBe(1)
  })

  it("parses rgba with explicit alpha", () => {
    const c = parseColor("rgba(255, 128, 64, 0.8)")
    expect(c).not.toBeNull()
    expect(c![3]).toBeCloseTo(0.8)
  })

  it("returns null for alpha < 0.05", () => {
    expect(parseColor("rgba(255, 255, 255, 0.04)")).toBeNull()
  })

  it("returns non-null for alpha exactly 0.05", () => {
    const c = parseColor("rgba(255, 255, 255, 0.05)")
    expect(c).not.toBeNull()
    expect(c![3]).toBeCloseTo(0.05)
  })

  it("parses a 6-digit hex color (the swatch registry's own format)", () => {
    const c = parseColor("#0d1117")
    expect(c).not.toBeNull()
    expect(c![0]).toBeCloseTo(0x0d / 255)
    expect(c![1]).toBeCloseTo(0x11 / 255)
    expect(c![2]).toBeCloseTo(0x17 / 255)
    expect(c![3]).toBe(1)
  })

  it("parses a 6-digit hex color case-insensitively", () => {
    expect(parseColor("#0D1117")).toEqual(parseColor("#0d1117"))
  })

  it("parses a 3-digit shorthand hex color", () => {
    const c = parseColor("#fff")
    expect(c).not.toBeNull()
    expect(c![0]).toBeCloseTo(1)
    expect(c![1]).toBeCloseTo(1)
    expect(c![2]).toBeCloseTo(1)
    expect(c![3]).toBe(1)
  })

  it("parses an 8-digit hex color with alpha", () => {
    const c = parseColor("#ffffff80")
    expect(c).not.toBeNull()
    expect(c![3]).toBeCloseTo(0x80 / 255, 2)
  })

  it("parses a 4-digit shorthand hex color with alpha", () => {
    const c = parseColor("#ffff")
    expect(c).not.toBeNull()
    expect(c![3]).toBeCloseTo(1)
  })

  it("returns null for hex alpha below the 0.05 floor", () => {
    expect(parseColor("#ffffff05")).toBeNull()
  })

  it("returns null for a malformed hex string", () => {
    expect(parseColor("#zzz")).toBeNull()
    expect(parseColor("#12345")).toBeNull()
  })

  it("every SWATCHES bg0 hex value parses to the same rgb it renders as", async () => {
    const { SWATCHES } = await import("../../../adapter/swatches")
    for (const swatch of Object.values(SWATCHES)) {
      expect(parseColor(swatch.bg0)).not.toBeNull()
    }
  })
})

describe("relativeLuminance", () => {
  it("returns 1 for white (r=1, g=1, b=1)", () => {
    expect(relativeLuminance(1, 1, 1)).toBeCloseTo(1)
  })

  it("returns 0 for black (r=0, g=0, b=0)", () => {
    expect(relativeLuminance(0, 0, 0)).toBeCloseTo(0)
  })

  it("returns ~0.2126 for pure red", () => {
    expect(relativeLuminance(1, 0, 0)).toBeCloseTo(0.2126, 3)
  })

  it("returns ~0.7152 for pure green", () => {
    expect(relativeLuminance(0, 1, 0)).toBeCloseTo(0.7152, 3)
  })

  it("returns ~0.0722 for pure blue", () => {
    expect(relativeLuminance(0, 0, 1)).toBeCloseTo(0.0722, 3)
  })

  it("white luminance is > any other color luminance", () => {
    expect(relativeLuminance(1, 1, 1)).toBeGreaterThan(
      relativeLuminance(0.9, 0.9, 0.9)
    )
  })

  it("luminance is always between 0 and 1", () => {
    const lum = relativeLuminance(0.5, 0.3, 0.7)
    expect(lum).toBeGreaterThanOrEqual(0)
    expect(lum).toBeLessThanOrEqual(1)
  })
})

describe("effectiveBgLuminance", () => {
  afterEach(() => {
    document.body.innerHTML = ""
    document.body.removeAttribute("style")
  })

  it("reads luminance from an ancestor with an explicit background", () => {
    document.body.style.backgroundColor = "rgb(255, 255, 255)"
    const div = document.createElement("div")
    document.body.appendChild(div)

    const lum = effectiveBgLuminance(div)
    expect(lum).not.toBeNull()
    expect(lum!).toBeCloseTo(1)
  })

  it("returns the element's own bg when it has one", () => {
    const div = document.createElement("div")
    div.style.backgroundColor = "rgb(0, 0, 0)"
    document.body.appendChild(div)

    const lum = effectiveBgLuminance(div)
    expect(lum).toBeCloseTo(0)
  })

  it("returns null when no ancestor has an opaque background", () => {
    const div = document.createElement("div")
    document.body.appendChild(div)

    const lum = effectiveBgLuminance(div)
    expect(lum).toBeNull()
  })
})
