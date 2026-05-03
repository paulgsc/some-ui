
/**
 * Luminance classification utilities.
 *
 * Used to decide whether to apply the dark theme to a given page.
 * We only intervene on light pages — already-dark pages are left alone.
 */

/**
 * Parse any CSS color string to [r, g, b, a] in 0–1 range.
 * Returns null if unparseable (e.g. "transparent", gradients, "none").
 */
function parseColor(css: string): [number, number, number, number] | null {
  if (!css || css === "transparent" || css === "rgba(0, 0, 0, 0)") return null

  // rgba(r, g, b, a) or rgb(r, g, b)
  const rgba = css.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/)
  if (rgba) {
    return [
      parseInt(rgba[1]!) / 255,
      parseInt(rgba[2]!) / 255,
      parseInt(rgba[3]!) / 255,
      rgba[4] !== undefined ? parseFloat(rgba[4]!) : 1,
    ]
  }

  return null
}

/**
 * Relative luminance per WCAG 2.1 spec.
 * Input: r, g, b in 0–1 range.
 */
function relativeLuminance(r: number, g: number, b: number): number {
  const linearize = (c: number) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b)
}

/**
 * Walk up the DOM to find the effective background color of an element,
 * compositing transparent layers onto parents.
 *
 * Returns luminance in 0–1 or null if no opaque background found.
 */
function effectiveBackgroundLuminance(el: Element): number | null {
  let current: Element | null = el

  while (current && current !== document.documentElement) {
    const bg = getComputedStyle(current).backgroundColor
    const parsed = parseColor(bg)

    if (parsed) {
      const [r, g, b, a] = parsed
      if (a > 0.05) {
        // Treat any non-trivially-transparent background as the effective one
        return relativeLuminance(r, g, b)
      }
    }

    current = current.parentElement
  }

  return null
}

type ClassificationResult = {
  /** 0–1, average luminance across sampled elements. null if insufficient data. */
  avgLuminance: number | null
  /** Whether the page is classified as "light" (needs dark theme). */
  isLight: boolean
  /** Whether to skip the page (already dark or indeterminate). */
  skip: boolean
}

/**
 * Sample a small set of large/prominent elements and classify
 * the page as light or dark.
 *
 * Conservative: defaults to "skip" (don't apply theme) when uncertain.
 * We'd rather leave a dark-ish page alone than fight it.
 */
export function classifyPage(threshold = 0.55): ClassificationResult {
  // Sample candidates: body plus first few large semantic containers
  const candidates: Element[] = [document.body]

  const selectors = ["main", "article", "#app", "#root", "#content", "[role='main']"]
  for (const sel of selectors) {
    const el = document.querySelector(sel)
    if (el) candidates.push(el)
    if (candidates.length >= 5) break
  }

  const luminances: number[] = []

  for (const el of candidates) {
    const lum = effectiveBackgroundLuminance(el)
    if (lum !== null) luminances.push(lum)
  }

  if (luminances.length === 0) {
    // No usable samples — conservative skip
    return { avgLuminance: null, isLight: false, skip: true }
  }

  const avg = luminances.reduce((a, b) => a + b, 0) / luminances.length
  const isLight = avg > threshold

  return { avgLuminance: avg, isLight, skip: false }
}
