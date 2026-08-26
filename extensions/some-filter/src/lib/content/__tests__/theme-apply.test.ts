import { relativeLuminance } from "@filter/lib/content/color"
import {
  applyTheme,
  DARK_THEME_ATTR,
  injectDarkTheme,
  removeDarkTheme,
  restoreVendor,
} from "@filter/lib/content/theme-apply"
import { afterEach, describe, expect, it } from "vitest"

const STYLE_ID = "__sw_dark_theme"
const LEGACY_STYLE_ID = "__sw_legacy_filter"

afterEach(() => {
  restoreVendor()
})

describe("DARK_THEME_ATTR", () => {
  it("is the expected attribute name", () => {
    expect(DARK_THEME_ATTR).toBe("data-sw-dark")
  })
})

describe("injectDarkTheme", () => {
  it("appends a <style id='__sw_dark_theme'> to document.head", () => {
    injectDarkTheme()
    const style = document.getElementById(STYLE_ID)
    expect(style).not.toBeNull()
    expect(style?.tagName).toBe("STYLE")
    expect(document.head.contains(style)).toBe(true)
  })

  it("is idempotent — a second call reuses the same element", () => {
    injectDarkTheme()
    injectDarkTheme()
    expect(document.querySelectorAll(`#${STYLE_ID}`)).toHaveLength(1)
  })

  it("does not write data-sw-patched anywhere — that is the actuator's job now", () => {
    const div = document.createElement("div")
    div.style.backgroundColor = "rgb(255, 255, 255)"
    document.body.appendChild(div)

    injectDarkTheme()

    expect(div.dataset.swPatched).toBeUndefined()
  })
})

describe("removeDarkTheme", () => {
  it("removes the base style element", () => {
    injectDarkTheme()
    expect(document.getElementById(STYLE_ID)).not.toBeNull()

    removeDarkTheme()

    expect(document.getElementById(STYLE_ID)).toBeNull()
  })

  it("is safe to call when no theme has been injected", () => {
    expect(() => removeDarkTheme()).not.toThrow()
  })
})

describe("applyTheme", () => {
  it("'dark' sets the dark attribute and injects the theme style", () => {
    applyTheme("dark")
    expect(document.documentElement.hasAttribute(DARK_THEME_ATTR)).toBe(true)
    expect(document.getElementById(STYLE_ID)).not.toBeNull()
  })

  it("'legacy' installs the global filter style with the configured values", () => {
    applyTheme("legacy", { invert: 1, hueRotate: 180 })
    const style = document.getElementById(LEGACY_STYLE_ID)
    expect(style).not.toBeNull()
    expect(style?.textContent).toContain("invert(1)")
    expect(style?.textContent).toContain("hue-rotate(180deg)")
  })

  it("'legacy' does not touch the dark-theme attribute or style", () => {
    applyTheme("legacy", { invert: 1 })
    expect(document.documentElement.hasAttribute(DARK_THEME_ATTR)).toBe(false)
    expect(document.getElementById(STYLE_ID)).toBeNull()
  })

  it("'legacy' with invert forces the canvas colour and counter-inverts media", () => {
    applyTheme("legacy", { invert: 1, brightness: 0.5 })
    const style = document.getElementById(LEGACY_STYLE_ID)
    expect(style?.textContent).toContain("background-color: #fff")
    expect(style?.textContent).toContain(
      "img, video, canvas, picture { filter: invert(1) hue-rotate(180deg)"
    )
  })

  it("'legacy' without invert (dim style) skips the canvas colour and media counter-invert", () => {
    applyTheme("legacy", { invert: 0, brightness: 0.7, contrast: 0.95 })
    const style = document.getElementById(LEGACY_STYLE_ID)
    expect(style?.textContent).toContain("brightness(0.7)")
    expect(style?.textContent).not.toContain("background-color: #fff")
    expect(style?.textContent).not.toContain("img, video, canvas, picture")
  })
})

// ── the declared canvas colour must composite dark, not just be dark ──────────
//
// getComputedStyle never reflects `filter` (issue-741-auto-defects.spec.ts's
// same point) — a *declared* dark canvas colour can still *render* light once
// composited through this preset's own invert/hue-rotate/sepia/brightness/
// contrast chain. These replicate that composite (CSS Filter Effects Level 1's
// formulas for each function, applied in the order the `filter` property
// lists them) to assert what a human actually sees, not what was declared.

type RGB = [number, number, number]

function invertStage([r, g, b]: RGB, amount: number): RGB {
  const c = (x: number): number => (1 - 2 * amount) * x + amount
  return [c(r), c(g), c(b)]
}

function hueRotateStage([r, g, b]: RGB, deg: number): RGB {
  const rad = (deg * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  return [
    (0.213 + cos * 0.787 - sin * 0.213) * r +
      (0.715 - cos * 0.715 - sin * 0.715) * g +
      (0.072 - cos * 0.072 + sin * 0.928) * b,
    (0.213 - cos * 0.213 + sin * 0.143) * r +
      (0.715 + cos * 0.285 + sin * 0.14) * g +
      (0.072 - cos * 0.072 - sin * 0.283) * b,
    (0.213 - cos * 0.213 - sin * 0.787) * r +
      (0.715 - cos * 0.715 + sin * 0.715) * g +
      (0.072 + cos * 0.928 + sin * 0.072) * b,
  ]
}

function sepiaStage([r, g, b]: RGB, amount: number): RGB {
  // Sepia matrix (amount=1) interpolated against identity (amount=0); the
  // 1/0 terms below are identity's diagonal/off-diagonal.
  const lerp = (
    identityCoefficient: number,
    sepiaCoefficient: number
  ): number => identityCoefficient * (1 - amount) + sepiaCoefficient * amount
  return [
    lerp(1, 0.393) * r + lerp(0, 0.769) * g + lerp(0, 0.189) * b,
    lerp(0, 0.349) * r + lerp(1, 0.686) * g + lerp(0, 0.168) * b,
    lerp(0, 0.272) * r + lerp(0, 0.534) * g + lerp(1, 0.131) * b,
  ]
}

function brightnessStage([r, g, b]: RGB, amount: number): RGB {
  return [r * amount, g * amount, b * amount]
}

function contrastStage([r, g, b]: RGB, amount: number): RGB {
  const c = (x: number): number => (x - 0.5) * amount + 0.5
  return [c(r), c(g), c(b)]
}

/** What a human actually sees once `source` (0-1 RGB) is composited through the exact "invert" legacy preset's five-stage filter. */
function asSeenThroughLegacyInvertFilter(source: RGB): RGB {
  const clamp = (x: number): number => Math.min(1, Math.max(0, x))
  const inverted = invertStage(source, 1)
  const rotated = hueRotateStage(inverted, 180)
  const sepiaed = sepiaStage(rotated, 0.12)
  const brightened = brightnessStage(sepiaed, 0.5)
  const contrasted = contrastStage(brightened, 0.92)
  return [clamp(contrasted[0]), clamp(contrasted[1]), clamp(contrasted[2])]
}

describe("legacy invert preset's declared canvas colour, as actually composited", () => {
  it("white (the current source) composites to a dark canvas", () => {
    const [r, g, b] = asSeenThroughLegacyInvertFilter([1, 1, 1])
    const luminance = relativeLuminance(r, g, b)
    const rounded = [r, g, b].map((c) => Math.round(c * 255)).join(", ")
    expect(
      luminance,
      `composited rgb(${rounded}) should read dark`
    ).toBeLessThan(0.05)
  })

  it("the previous #0d1117 source (the reported polarity bug) composites to a light canvas, not dark", () => {
    const [r, g, b] = asSeenThroughLegacyInvertFilter([
      0x0d / 255,
      0x11 / 255,
      0x17 / 255,
    ])
    const luminance = relativeLuminance(r, g, b)
    // Documents the bug this preset used to have: a near-black *declared*
    // source read as light once actually composited (#7b7b7a). If this ever
    // stops being true the reasoning in theme-apply.ts's comment is stale.
    expect(luminance).toBeGreaterThan(0.15)
  })
})

describe("restoreVendor", () => {
  it("removes dark theme (attr + style)", () => {
    applyTheme("dark")

    restoreVendor()

    expect(document.documentElement.hasAttribute(DARK_THEME_ATTR)).toBe(false)
    expect(document.getElementById(STYLE_ID)).toBeNull()
  })

  it("removes the legacy filter style", () => {
    applyTheme("legacy", { invert: 1 })
    expect(document.getElementById(LEGACY_STYLE_ID)).not.toBeNull()

    restoreVendor()

    expect(document.getElementById(LEGACY_STYLE_ID)).toBeNull()
  })

  it("is safe to call when nothing is applied", () => {
    expect(() => restoreVendor()).not.toThrow()
  })

  it("never writes inline styles or data-sw-patched — this module only ever touches its own style elements and DARK_THEME_ATTR", () => {
    document.body.innerHTML =
      '<div style="background-color: rgb(255, 255, 255)">' +
      '<p style="background-color: rgb(200, 200, 200)">hi</p></div>'
    const before = document.body.innerHTML

    applyTheme("dark")
    restoreVendor()

    expect(document.body.innerHTML).toBe(before)
  })
})
