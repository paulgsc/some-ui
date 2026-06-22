/**
 * HSL-based color modification — adapted from Dark Reader (MIT).
 * https://github.com/darkreader/darkreader
 * See docs/third-party/darkreader-LICENSE.md for attribution + license.
 *
 * Dark Reader maps colors into a dark palette by manipulating lightness in HSL
 * space while preserving hue, with separate curves for backgrounds, foregrounds
 * and borders. This is a focused adaptation of that idea (not a line-for-line
 * port): enough to produce hue-preserving dark surfaces (a light-blue panel
 * becomes a dark-blue panel) instead of the previous flat grey buckets.
 *
 * Pure functions only — RGBA components are 0–1, matching color.ts.
 */

import type { RGBA } from "./color"

export type HSLA = { h: number; s: number; l: number; a: number }

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}

export function rgbToHSL([r, g, b, a]: RGBA): HSLA {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  const l = (max + min) / 2

  let h = 0
  let s = 0

  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1))

    if (max === r) {
      h = ((g - b) / d) % 6
    } else if (max === g) {
      h = (b - r) / d + 2
    } else {
      h = (r - g) / d + 4
    }

    h *= 60
    if (h < 0) h += 360
  }

  return { h, s, l, a }
}

export function hslToRGB({ h, s, l, a }: HSLA): RGBA {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2

  let r = 0
  let g = 0
  let b = 0

  if (h < 60) {
    r = c
    g = x
  } else if (h < 120) {
    r = x
    g = c
  } else if (h < 180) {
    g = c
    b = x
  } else if (h < 240) {
    g = x
    b = c
  } else if (h < 300) {
    r = x
    b = c
  } else {
    r = c
    b = x
  }

  return [r + m, g + m, b + m, a]
}

// Dark-theme target bands (lightness 0–1).
const BG_DARK_MIN = 0.08
const BG_DARK_MAX = 0.3
const FG_LIGHT_MIN = 0.62
const FG_LIGHT_MAX = 0.9
const BORDER_L = 0.25

/**
 * Map a background color into the dark band, inverting lightness so that light
 * backgrounds become dark surfaces (and already-dark ones stay dark) while
 * preserving hue. Saturation is eased back for calmer surfaces.
 */
export function modifyBackgroundColor(rgba: RGBA): RGBA {
  const hsl = rgbToHSL(rgba)
  const l = BG_DARK_MIN + (1 - hsl.l) * (BG_DARK_MAX - BG_DARK_MIN)
  return hslToRGB({ h: hsl.h, s: hsl.s * 0.6, l, a: hsl.a })
}

/**
 * Lift a foreground (text) color into a readable light band, preserving hue and
 * relative ordering (darker source text → slightly dimmer light text).
 */
export function modifyForegroundColor(rgba: RGBA): RGBA {
  const hsl = rgbToHSL(rgba)
  const l = FG_LIGHT_MIN + hsl.l * (FG_LIGHT_MAX - FG_LIGHT_MIN)
  return hslToRGB({ h: hsl.h, s: hsl.s, l, a: hsl.a })
}

/** Map a border color to a low-contrast mid-dark tone. */
export function modifyBorderColor(rgba: RGBA): RGBA {
  const hsl = rgbToHSL(rgba)
  return hslToRGB({ h: hsl.h, s: hsl.s * 0.5, l: BORDER_L, a: hsl.a })
}

/** Serialize an RGBA (0–1) back to a CSS rgb()/rgba() string. */
export function rgbaToCss([r, g, b, a]: RGBA): string {
  const to255 = (v: number): number => Math.round(clamp(v, 0, 1) * 255)
  if (a >= 1) {
    return `rgb(${to255(r)}, ${to255(g)}, ${to255(b)})`
  }
  return `rgba(${to255(r)}, ${to255(g)}, ${to255(b)}, ${Number(a.toFixed(3))})`
}
