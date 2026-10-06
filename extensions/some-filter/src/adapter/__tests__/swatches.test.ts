import {
  borderHierarchyReport,
  borderSample,
  comfortReport,
  DEFAULT_SWATCH_ID,
  getSwatch,
  satisfiesBorderHierarchy,
  satisfiesComfort,
  SWATCHES,
  swatchSample,
  type Swatch,
} from "@filter/adapter/swatches"
import { describe, expect, it } from "vitest"

/** The default swatch with `overrides` applied. */
function variant(overrides: Partial<Swatch> & { id: string }): Swatch {
  return { ...SWATCHES[DEFAULT_SWATCH_ID], label: overrides.id, ...overrides }
}

describe("SWATCHES", () => {
  // No exceptions, by design: a swatch failing Φ_comfort is a shipped
  // regression, not a carve-out to document.
  it("every registry entry satisfies Φ_comfort — a hostile swatch never ships", () => {
    for (const swatch of Object.values(SWATCHES)) {
      expect(satisfiesComfort(swatchSample(swatch)), swatch.id).toBe(true)
    }
  })

  it("the default swatch's current values", () => {
    const defaultSwatch = SWATCHES[DEFAULT_SWATCH_ID]
    expect(defaultSwatch.bg0).toBe("#171c25")
    expect(defaultSwatch.text0).toBe("#8699b1")
    expect(defaultSwatch.codeFg).toBe("#e879f9")
  })

  it("getSwatch falls back to the default for an unknown id", () => {
    expect(getSwatch("does-not-exist")).toBe(SWATCHES[DEFAULT_SWATCH_ID])
  })

  it("getSwatch resolves a known id", () => {
    expect(getSwatch("purple-gray")).toBe(SWATCHES["purple-gray"])
  })
})

describe("Φ_comfort", () => {
  it("rejects a #fff-on-#000 maximum-contrast swatch", () => {
    const hostile = variant({ id: "hostile", bg0: "#000000", text0: "#ffffff" })

    const report = comfortReport(swatchSample(hostile))
    expect(report.bgNotBlack).toBe(false)
    expect(report.textNotBrightest).toBe(false)
    expect(report.chromaticBias).toBe(false)
    expect(report.contrastInBand).toBe(false)
    expect(satisfiesComfort(swatchSample(hostile))).toBe(false)
  })

  it("rejects an achromatic gray (no chromatic bias)", () => {
    const achromatic = variant({
      id: "achromatic",
      bg0: "#141414",
      text0: "#e0e0e0",
    })

    expect(comfortReport(swatchSample(achromatic)).chromaticBias).toBe(false)
    expect(satisfiesComfort(swatchSample(achromatic))).toBe(false)
  })
})

describe("border hierarchy (ADR 0002 §2.3)", () => {
  // Same no-exceptions discipline as Φ_comfort above.
  it("every registry entry's borderStrong clears the WCAG 1.4.11 non-text-contrast floor against bg0", () => {
    for (const swatch of Object.values(SWATCHES)) {
      expect(satisfiesBorderHierarchy(borderSample(swatch)), swatch.id).toBe(
        true
      )
    }
  })

  it("rejects a border indistinguishable from its background", () => {
    const invisible = variant({
      id: "invisible-border",
      borderStrong: "rgba(255, 255, 255, 0.02)",
    })

    expect(
      borderHierarchyReport(borderSample(invisible)).nonTextContrastMet
    ).toBe(false)
    expect(satisfiesBorderHierarchy(borderSample(invisible))).toBe(false)
  })

  it("accepts a fully opaque white border (the trivial ceiling case)", () => {
    const opaque = variant({ id: "opaque-border", borderStrong: "#ffffff" })

    expect(satisfiesBorderHierarchy(borderSample(opaque))).toBe(true)
  })
})
