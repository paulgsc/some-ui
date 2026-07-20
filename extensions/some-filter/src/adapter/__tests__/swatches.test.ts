import { describe, expect, it } from "vitest"

import {
  comfortReport,
  DEFAULT_SWATCH_ID,
  getSwatch,
  satisfiesComfort,
  SWATCHES,
  swatchSample,
  type Swatch,
} from "../swatches"

describe("SWATCHES", () => {
  // `default` is excluded, not silently passing: it predates Φ_comfort
  // (kept byte-for-byte as "today's palette, verbatim" — see this file's
  // own header comment) and a blind Comfort Lab eye score on its exact
  // (bg0, text0) pair came back hostile (#735) once CONTRAST_BAND_MAX was
  // tightened to the value the other six swatches were actually designed
  // around. See the dedicated test below — this isn't a gap, it's a named,
  // checked exception.
  it("every purpose-built registry entry satisfies Φ_comfort", () => {
    for (const swatch of Object.values(SWATCHES)) {
      if (swatch.id === DEFAULT_SWATCH_ID) continue
      expect(satisfiesComfort(swatchSample(swatch)), swatch.id).toBe(true)
    }
  })

  it("the default swatch does not satisfy Φ_comfort (#735) — legacy, not yet redesigned", () => {
    const defaultSwatch = SWATCHES[DEFAULT_SWATCH_ID]
    const report = comfortReport(swatchSample(defaultSwatch))
    // contrast 15.35 — inside the old [7.5, 16] band, outside today's
    // [7.5, 14]; every other clause still passes.
    expect(report.contrastInBand).toBe(false)
    expect(report.textNotBrightest).toBe(true)
    expect(report.chromaticBias).toBe(true)
    expect(report.bgNotBlack).toBe(true)
    expect(satisfiesComfort(swatchSample(defaultSwatch))).toBe(false)
  })

  it("the default swatch is byte-for-byte today's palette", () => {
    const defaultSwatch = SWATCHES[DEFAULT_SWATCH_ID]
    expect(defaultSwatch.bg0).toBe("#0d1117")
    expect(defaultSwatch.text0).toBe("#e2e8f0")
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
    const hostile: Swatch = {
      ...SWATCHES[DEFAULT_SWATCH_ID],
      id: "hostile",
      label: "Hostile",
      bg0: "#000000",
      text0: "#ffffff",
    }

    const report = comfortReport(swatchSample(hostile))
    expect(report.bgNotBlack).toBe(false)
    expect(report.textNotBrightest).toBe(false)
    expect(report.chromaticBias).toBe(false)
    expect(report.contrastInBand).toBe(false)
    expect(satisfiesComfort(swatchSample(hostile))).toBe(false)
  })

  it("rejects an achromatic gray (no chromatic bias)", () => {
    const achromatic: Swatch = {
      ...SWATCHES[DEFAULT_SWATCH_ID],
      id: "achromatic",
      label: "Achromatic",
      bg0: "#141414",
      text0: "#e0e0e0",
    }

    expect(comfortReport(swatchSample(achromatic)).chromaticBias).toBe(false)
    expect(satisfiesComfort(swatchSample(achromatic))).toBe(false)
  })
})
