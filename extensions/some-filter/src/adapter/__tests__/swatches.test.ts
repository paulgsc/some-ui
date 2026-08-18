import {
  comfortReport,
  DEFAULT_SWATCH_ID,
  getSwatch,
  satisfiesComfort,
  SWATCHES,
  swatchSample,
  type Swatch,
} from "@filter/adapter/swatches"
import { describe, expect, it } from "vitest"

describe("SWATCHES", () => {
  // No exceptions, by design (#735): a swatch that fails Φ_comfort is a
  // shipped regression, not a documentable exception — `default` failed
  // this exact check until its `text0` was redimmed (see this file's own
  // header comment). If a future edit makes any registry entry hostile
  // again, this must fail the build, not grow another named carve-out.
  it("every registry entry satisfies Φ_comfort — a hostile swatch never ships", () => {
    for (const swatch of Object.values(SWATCHES)) {
      expect(satisfiesComfort(swatchSample(swatch)), swatch.id).toBe(true)
    }
  })

  // Not "byte-for-byte" or "unchanged" — bg0, bg1, bg2, bg3, surface,
  // inputBg, and text0 have all moved since the original TOKENS import
  // (#735: first a text0 redim, then a bg0-and-text0 pair chosen to
  // minimize adaptation cost across a session rather than maximize static
  // contrast). codeFg is the one token untouched through all of it.
  it("the default swatch's current values (#735)", () => {
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
