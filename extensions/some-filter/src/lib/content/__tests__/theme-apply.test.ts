import { SWATCHES } from "@filter/adapter/swatches"
import { parseColor, relativeLuminance } from "@filter/lib/content/color"
import {
  applyTheme,
  buildHostTokenRule,
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
// *single* surface can be dark in both regimes — which is why there are two.
// The canvas takes the raw-safe value and the floor (html::before, inside
// the filtered subtree) takes the composited-safe one, so every regime has a
// surface tuned for it. These tests assert that pairing, which is stronger
// than the "pick the lesser evil" invariant it replaces: neither regime is
// an accepted cost any more, and flipping either surface to serve the other
// regime's maths (#1175's mistake) fails here.

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

/** The `background-color` declared in the legacy stylesheet rule whose selector contains `selectorFragment`, as 0-1 RGB. */
function declaredBackground(selectorFragment: string): RGB {
  applyTheme("legacy", LEGACY_PRESETS.invert)
  const css = document.getElementById(LEGACY_STYLE_ID)?.textContent ?? ""
  const block = css.split("}").find((rule) => rule.includes(selectorFragment))
  if (block === undefined) {
    throw new Error(`no rule matching ${selectorFragment} in: ${css}`)
  }
  const declared = /background-color:\s*(#[0-9a-fA-F]{3,8})/.exec(block)?.[1]
  if (declared === undefined) {
    throw new Error(`no background-color in rule ${selectorFragment}: ${block}`)
  }
  const parsed = parseColor(declared)
  if (parsed === null) throw new Error(`unparseable colour ${declared}`)
  return [parsed[0], parsed[1], parsed[2]]
}

/** The propagated canvas colour — the surface the raw regime paints. */
const canvasColor = (): RGB => declaredBackground("html {")

/** The floor behind the page — the surface the composited regime paints. */
const floorColor = (): RGB => declaredBackground("html[data-sw-legacy]::before")

/** The `scrollbar-color` thumb/track declared in the `html {}` rule, as 0-1 RGB pairs. */
function declaredScrollbarColors(): { thumb: RGB; track: RGB } {
  applyTheme("legacy", LEGACY_PRESETS.invert)
  const css = document.getElementById(LEGACY_STYLE_ID)?.textContent ?? ""
  const block = css.split("}").find((rule) => rule.includes("html {"))
  const declared =
    block === undefined
      ? undefined
      : /scrollbar-color:\s*(#[0-9a-fA-F]{3,8})\s+(#[0-9a-fA-F]{3,8})/.exec(
          block
        )
  if (declared?.[1] === undefined || declared[2] === undefined) {
    throw new Error(`no scrollbar-color in the html {} rule: ${css}`)
  }
  const thumb = parseColor(declared[1])
  const track = parseColor(declared[2])
  if (thumb === null || track === null) {
    throw new Error(`unparseable scrollbar-color ${declared[1]} ${declared[2]}`)
  }
  return {
    thumb: [thumb[0], thumb[1], thumb[2]],
    track: [track[0], track[1], track[2]],
  }
}

function describeRgb(rgb: RGB): string {
  return `rgb(${rgb.map((c) => Math.round(c * 255)).join(", ")})`
}

const DARK = 0.05

describe("legacy invert mode paints a dark surface in both regimes", () => {
  it("the canvas reads dark unfiltered — the flashbang-tick guard", () => {
    const canvas = canvasColor()
    // The invariant that matters to a human. White satisfies the composited
    // maths and fails here: it is a full-viewport flash on every tick where
    // vendor content is up before the root filter's output is.
    expect(
      relativeLuminance(...canvas),
      `unfiltered canvas ${describeRgb(canvas)} must read dark`
    ).toBeLessThan(DARK)
  })

  it("the floor reads dark composited — what makes the canvas free to be raw-safe", () => {
    const composited = asSeenThroughLegacyInvertFilter(floorColor())
    expect(
      relativeLuminance(...composited),
      `composited floor ${describeRgb(composited)} must read dark`
    ).toBeLessThan(DARK)
  })

  it("the floor is behind content and inert", () => {
    applyTheme("legacy", LEGACY_PRESETS.invert)
    const css = document.getElementById(LEGACY_STYLE_ID)?.textContent ?? ""
    const floor = css.split("}").find((r) => r.includes("::before")) ?? ""
    // A floor that intercepts clicks or paints over the page is worse than
    // the grey canvas it replaces.
    expect(floor).toContain("z-index: -1")
    expect(floor).toContain("pointer-events: none")
    expect(floor).toContain("position: fixed")
  })

  it("neither surface is declared for the dim style, which has no invert", () => {
    applyTheme("legacy", LEGACY_PRESETS.dim)
    const css = document.getElementById(LEGACY_STYLE_ID)?.textContent ?? ""
    expect(css).not.toContain("::before")
    expect(css).not.toContain("background-color:")
    expect(css).not.toContain("scrollbar-color:")
  })

  it("the scrollbar reads dark unfiltered — it has no composited regime to weigh against", () => {
    // The root scrollbar is browser chrome: painted outside the root
    // filter's render surface unconditionally (verified by pixel probe —
    // extensions/some-filter/tests/e2e/fixtures/pixels.ts's contentWidth()
    // doc comment has the measurement). Unlike the canvas, there is only
    // one regime here, so both the thumb and the track must simply be dark.
    const { thumb, track } = declaredScrollbarColors()
    expect(
      relativeLuminance(...thumb),
      `unfiltered scrollbar thumb ${describeRgb(thumb)} must read dark`
    ).toBeLessThan(DARK)
    expect(
      relativeLuminance(...track),
      `unfiltered scrollbar track ${describeRgb(track)} must read dark`
    ).toBeLessThan(DARK)
  })

  it("resets scrollbar-color for descendants, not for html itself", () => {
    // scrollbar-color is inherited, so without a reset, an unstyled nested
    // `overflow: auto` container would inherit html's dark declaration and
    // (being inside the filtered subtree, unlike the root/viewport
    // scrollbar) composite it to a light one. Not pixel-verified — see this
    // rule's own comment in theme-apply.ts for why — so this only pins the
    // declared shape: descendants reset to scrollbar-color's own initial
    // value (`auto`, i.e. what they already had before html declared one),
    // and html's own dark value is untouched.
    applyTheme("legacy", LEGACY_PRESETS.invert)
    const css = document.getElementById(LEGACY_STYLE_ID)?.textContent ?? ""
    const reset = css
      .split("}")
      .find((rule) => rule.includes(":where(:root *)"))
    expect(reset, `no descendant scrollbar-color reset in: ${css}`).toContain(
      "scrollbar-color: auto"
    )
    expect(css).toContain("scrollbar-color: #272b37 #0d1117")
  })

  it("has no single source colour that would serve both regimes alone", () => {
    // Why two surfaces rather than one better-chosen colour. Sampling the
    // greyscale ramp: every source is light in one regime or the other, so
    // "just declare a colour that is dark either way" was never available.
    const bothDark = Array.from({ length: 256 }, (_, i) => i / 255).filter(
      (level) => {
        const source: RGB = [level, level, level]
        return (
          relativeLuminance(...source) < DARK &&
          relativeLuminance(...asSeenThroughLegacyInvertFilter(source)) < DARK
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

describe("buildHostTokenRule — forces the shadow host's own color, mirroring the document canvas rule (bot-found, SF-AD's own review, round 5)", () => {
  // buildDarkThemeCSS()'s own `html, body { …; color: var(--sw-text-0) }`
  // canvas rule is what makes an *inherited* (not per-element-explicit) dark
  // foreground self-heal for the document: any light-DOM descendant that
  // declares no color of its own inherits the newly-forced root value
  // through ordinary cascade. A shadow scope's host is the structural
  // equivalent of that root for everything inside its own tree — without
  // this same `color` declaration on `:host`, a vendor's own host-level
  // foreground (or the shadow content's default inherited black) kept
  // flowing unaltered into every shadow descendant that relies on plain
  // inheritance, producing dark-on-dark once that descendant's own
  // background was independently darkened by an emit-surface-color action.
  it("declares color on :host, not just the --sw-* custom properties", () => {
    const rule = buildHostTokenRule(SWATCHES.default)

    expect(rule).toContain(`color: var(--sw-text-0) !important`)
  })

  it("still declares every --sw-* token the static layer's rules reference", () => {
    const rule = buildHostTokenRule(SWATCHES.default)

    expect(rule).toContain(`--sw-text-0: ${SWATCHES.default.text0}`)
    expect(rule).toContain(`--sw-bg-0: ${SWATCHES.default.bg0}`)
  })
})
