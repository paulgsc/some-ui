import { parseColor, relativeLuminance } from "@filter/lib/content/color"
import {
  applyTheme,
  DARK_THEME_ATTR,
  injectDarkTheme,
  removeDarkTheme,
  restoreVendor,
} from "@filter/lib/content/theme-apply"
import { LEGACY_PRESETS } from "@filter/lib/legacy-presets"
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
    expect(style?.textContent).toContain("background-color: #0d1117")
    expect(style?.textContent).toContain(
      "img, video, canvas, picture { filter: invert(1) hue-rotate(180deg)"
    )
  })

  it("'legacy' without invert (dim style) skips the canvas colour and media counter-invert", () => {
    applyTheme("legacy", { invert: 0, brightness: 0.7, contrast: 0.95 })
    const style = document.getElementById(LEGACY_STYLE_ID)
    expect(style?.textContent).toContain("brightness(0.7)")
    expect(style?.textContent).not.toContain("background-color: #0d1117")
    expect(style?.textContent).not.toContain("img, video, canvas, picture")
  })
})

// ── the declared canvas colour, in both regimes it is painted in ─────────────
//
// The legacy invert canvas colour is consumed by two painters that want
// opposite values (theme-apply.ts's applyLegacyFilter has the full argument):
//
//   raw        — the declared colour, no filter applied. Visible during every
//                window where content is on screen before the root filter's
//                output covers it: the pre-commit window, and (the reported
//                bug) vendor DOM materialised after document_end and revealed
//                faster than it rasters, e.g. a held PgDn on GitHub.
//   composited — the same colour through this preset's five stages.
//
// getComputedStyle never reflects `filter` (issue-741-auto-defects.spec.ts's
// same point), so the composited regime has to be computed. The stages below
// implement CSS Filter Effects Level 1's formulas, applied in the order the
// `filter` property lists them.
//
// Composited luminance falls monotonically as source luminance rises, so no
// source is dark in both regimes and the choice is which one is visible. It
// is raw — the html canvas spends the composited regime occluded by the
// vendor's own opaque body, and the raw regime is exactly the uncovered tick
// a human sees. These tests pin that choice so the composited maths alone
// cannot flip it back (#1175 did, and reintroduced the tick).

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

/**
 * What a human actually sees once `source` (0-1 RGB) is composited through the
 * "invert" legacy preset's five-stage filter. Reads the preset rather than
 * restating it, so retuning the preset retunes this model with it.
 */
function asSeenThroughLegacyInvertFilter(source: RGB): RGB {
  const preset = LEGACY_PRESETS.invert
  const clamp = (x: number): number => Math.min(1, Math.max(0, x))
  const inverted = invertStage(source, preset.invert)
  const rotated = hueRotateStage(inverted, preset.hueRotate)
  const sepiaed = sepiaStage(rotated, preset.sepia)
  const brightened = brightnessStage(sepiaed, preset.brightness)
  const contrasted = contrastStage(brightened, preset.contrast)
  return [clamp(contrasted[0]), clamp(contrasted[1]), clamp(contrasted[2])]
}

/** The canvas colour applyLegacyFilter actually declares, as 0-1 RGB. */
function declaredCanvasColor(): RGB {
  applyTheme("legacy", LEGACY_PRESETS.invert)
  const css = document.getElementById(LEGACY_STYLE_ID)?.textContent ?? ""
  const declared = /background-color:\s*(#[0-9a-fA-F]{3,8})/.exec(css)?.[1]
  if (declared === undefined) {
    throw new Error(`no canvas colour declared in: ${css}`)
  }
  const parsed = parseColor(declared)
  if (parsed === null) throw new Error(`unparseable canvas colour ${declared}`)
  return [parsed[0], parsed[1], parsed[2]]
}

function describeRgb(rgb: RGB): string {
  return `rgb(${rgb.map((c) => Math.round(c * 255)).join(", ")})`
}

describe("legacy invert preset's declared canvas colour", () => {
  it("reads dark unfiltered — the flashbang-tick guard", () => {
    const declared = declaredCanvasColor()
    const luminance = relativeLuminance(...declared)
    // The invariant that matters to a human. White satisfies the composited
    // maths and fails here: it is a full-viewport flash on every tick where
    // vendor content is up before the root filter's output is.
    expect(
      luminance,
      `unfiltered ${describeRgb(declared)} must read dark`
    ).toBeLessThan(0.05)
  })

  it("composites light — the accepted, occluded cost of that choice", () => {
    const composited = asSeenThroughLegacyInvertFilter(declaredCanvasColor())
    const luminance = relativeLuminance(...composited)
    // Not a bug being enshrined: it is the other half of the trade-off, held
    // here so it stays a known quantity. #0d1117 composites to #7b7b7a, a
    // light grey — behind the vendor's opaque body, where nobody sees it. If
    // this ever does become visible the fix is a second, filtered floor (a
    // fixed z-index:-1 white layer inside <html>), not repolarising the
    // canvas: that is what would bring the tick back.
    expect(
      luminance,
      `composited ${describeRgb(composited)} is the occluded regime`
    ).toBeGreaterThan(0.15)
  })

  it("has no source colour that is dark in both regimes", () => {
    // Why the two tests above disagree and that is not a defect. Sampling the
    // greyscale ramp: every source is light in one regime or the other, so
    // "declare a colour that is dark either way" is not an available fix.
    const darkEnough = 0.05
    const bothDark = Array.from({ length: 256 }, (_, i) => i / 255).filter(
      (level) => {
        const source: RGB = [level, level, level]
        const composited = asSeenThroughLegacyInvertFilter(source)
        return (
          relativeLuminance(...source) < darkEnough &&
          relativeLuminance(...composited) < darkEnough
        )
      }
    )
    expect(bothDark).toEqual([])
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
