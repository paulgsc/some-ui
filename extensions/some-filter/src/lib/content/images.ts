/**
 * Image inversion heuristic — adapted from Dark Reader (MIT).
 * https://github.com/darkreader/darkreader
 * See docs/third-party/darkreader-LICENSE.md for attribution + license.
 *
 * Goal: decide per-image whether to invert it for dark mode. Photos should be
 * left alone; dark line-art / icons on transparent or dark backgrounds read
 * better inverted. This replaces the previous all-or-nothing handling (legacy
 * inverts every image; auto leaves them all).
 *
 * The decision core (shouldInvertImage) is pure and unit-tested. analyzeImage
 * uses a canvas and is therefore browser-only; it is guarded and returns null
 * when canvas sampling is unavailable (e.g. cross-origin, jsdom).
 */

import { relativeLuminance } from "./color"

export type ImageDetails = {
  isDark: boolean
  isLight: boolean
  isTransparent: boolean
  isLarge: boolean
}

// Thresholds mirror Dark Reader's classification ratios.
const DARK_LUM = 0.4
const LIGHT_LUM = 0.7
const DARK_RATIO = 0.7
const LIGHT_RATIO = 0.7
const TRANSPARENT_RATIO = 0.1
const LARGE_PX = 512
const SAMPLE = 32

/**
 * Decide whether an image should be inverted under the dark theme.
 *
 * Invert a predominantly-dark image (e.g. a black icon) so it shows light on
 * the dark canvas — but only when it is not also a large photo and not mostly
 * transparent-with-light-content. Light images and photos are left untouched.
 */
export function shouldInvertImage(details: ImageDetails): boolean {
  if (details.isLarge) return false // likely a photo — never invert
  if (details.isLight) return false // already light — leave it
  if (details.isDark) return true // dark icon/line-art — invert to light
  return false
}

/**
 * Sample an image element on a downscaled canvas and classify it. Returns null
 * if the image is not decodable or the canvas is unavailable/tainted.
 */
export function analyzeImage(img: HTMLImageElement): ImageDetails | null {
  const w = img.naturalWidth
  const h = img.naturalHeight
  if (!w || !h) return null

  const isLarge = w > LARGE_PX || h > LARGE_PX

  try {
    const sw = Math.min(SAMPLE, w)
    const sh = Math.min(SAMPLE, h)
    const canvas = document.createElement("canvas")
    canvas.width = sw
    canvas.height = sh
    const ctx = canvas.getContext("2d")
    if (!ctx) return null

    ctx.drawImage(img, 0, 0, sw, sh)
    const { data } = ctx.getImageData(0, 0, sw, sh)

    let transparent = 0
    let dark = 0
    let light = 0
    let opaque = 0
    const total = sw * sh

    for (let i = 0; i < data.length; i += 4) {
      const a = (data[i + 3] ?? 255) / 255
      if (a < 0.05) {
        transparent++
        continue
      }
      opaque++
      const lum = relativeLuminance(
        (data[i] ?? 0) / 255,
        (data[i + 1] ?? 0) / 255,
        (data[i + 2] ?? 0) / 255
      )
      if (lum < DARK_LUM) dark++
      else if (lum > LIGHT_LUM) light++
    }

    const denom = opaque || 1
    return {
      isDark: dark / denom >= DARK_RATIO,
      isLight: light / denom >= LIGHT_RATIO,
      isTransparent: transparent / total >= TRANSPARENT_RATIO,
      isLarge,
    }
  } catch {
    // Cross-origin (tainted canvas) or no canvas support — caller leaves the
    // image untouched.
    return null
  }
}
