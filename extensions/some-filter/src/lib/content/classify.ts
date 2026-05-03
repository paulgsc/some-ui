
/**
 * Luminance classification utilities.
 *
 * Goal: decide whether a page is "light" (needs our dark theme) or already dark.
 *
 * Key design decisions:
 *   - When body.backgroundColor is transparent, we don't skip — we bias toward
 *     applying the theme, because a transparent body typically means the page
 *     relies on the browser default (white). Unknown == probably light.
 *   - We sample widely (body, html, large containers by viewport area) rather
 *     than just named semantic elements, because real-world pages are soup.
 *   - Conservative only against false-darkening: dark pages almost always set
 *     an explicit bg, so they'll be caught. Light pages with no bg → assume light.
 */

export type RGBA = [number, number, number, number]

/**
 * Parse any CSS color string to [r, g, b, a] in 0–1 range.
 * Returns null for unparseable values (gradients, "none", transparent).
 */
export function parseColor(css: string): RGBA | null {
  if (!css || css === "none") return null
  if (css === "transparent" || css === "rgba(0, 0, 0, 0)") return null

  const rgba = css.match(
    /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/
  )
  if (rgba) {
    const a = rgba[4] !== undefined ? parseFloat(rgba[4]!) : 1
    if (a < 0.05) return null // effectively transparent
    return [
      parseInt(rgba[1]!) / 255,
      parseInt(rgba[2]!) / 255,
      parseInt(rgba[3]!) / 255,
      a,
    ]
  }

  return null
}

/**
 * Relative luminance per WCAG 2.1.
 * Input: r, g, b in 0–1 range.
 */
export function relativeLuminance(r: number, g: number, b: number): number {
  const lin = (c: number) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

/**
 * Walk up the DOM from el to find the first ancestor with a non-transparent
 * background-color. Returns luminance 0-1, or null if none found.
 */
export function effectiveBgLuminance(el: Element): number | null {
  let cur: Element | null = el
  while (cur) {
    const bg = getComputedStyle(cur).backgroundColor
    const c = parseColor(bg)
    if (c) return relativeLuminance(c[0], c[1], c[2])
    cur = cur.parentElement
  }
  return null
}

function viewportCoverage(el: Element): number {
  const rect = el.getBoundingClientRect()
  const vw = window.innerWidth || 1
  const vh = window.innerHeight || 1
  return (rect.width / vw) * (rect.height / vh)
}

export type ClassificationResult = {
  avgLuminance: number | null
  isLight: boolean
  skip: boolean
}

/**
 * Classify the page as light or dark.
 *
 * Strategy:
 *   1. Check html and body for explicit backgrounds (weight=2).
 *   2. Sample named semantic containers (weight=1.5).
 *   3. Sample large containers by viewport coverage (top 8 by area).
 *   4. If zero opaque samples found → assume light (browser default = white).
 *   5. Weighted average. threshold=0.4 is generous — prefer applying dark theme.
 */
export function classifyPage(threshold = 0.4): ClassificationResult {
  const samples: Array<{ lum: number; weight: number }> = []

  // Tier 1: html and body
  for (const el of [document.documentElement, document.body]) {
    if (!el) continue
    const bg = getComputedStyle(el).backgroundColor
    const c = parseColor(bg)
    if (c) samples.push({ lum: relativeLuminance(c[0], c[1], c[2]), weight: 2 })
  }

  // Tier 2: semantic containers
  const semanticSelectors = [
    "main", "article", "#app", "#root", "#content",
    "#wrapper", "#container", "#main", "#page",
    "[role='main']", "[role='document']",
  ]
  for (const sel of semanticSelectors) {
    const el = document.querySelector(sel)
    if (!el) continue
    const lum = effectiveBgLuminance(el)
    if (lum !== null) samples.push({ lum, weight: 1.5 })
  }

  // Tier 3: largest visible containers by viewport coverage
  const containerCandidates = Array.from(
    document.querySelectorAll(
      "#__sw_page_layer > *, body > div, body > section, body > main, body > header"
    )
  )
    .filter((el) => {
      if (el.id === "__sw_page_layer" || el.id === "__sw_overlay_root") return false
      if (el.hasAttribute("data-my-ext")) return false
      return true
    })
    .map((el) => ({ el, coverage: viewportCoverage(el) }))
    .filter(({ coverage }) => coverage > 0.05)
    .sort((a, b) => b.coverage - a.coverage)
    .slice(0, 8)

  for (const { el, coverage } of containerCandidates) {
    const bg = getComputedStyle(el).backgroundColor
    const c = parseColor(bg)
    if (c) samples.push({ lum: relativeLuminance(c[0], c[1], c[2]), weight: coverage })
  }

  if (samples.length === 0) {
    // No opaque bg anywhere = browser default white. Treat as light.
    return { avgLuminance: null, isLight: true, skip: false }
  }

  const totalWeight = samples.reduce((a, s) => a + s.weight, 0)
  const avg = samples.reduce((a, s) => a + s.lum * s.weight, 0) / totalWeight

  const isLight = avg > threshold
  // Only skip (leave alone) when clearly already dark
  const skip = avg < threshold * 0.5

  return { avgLuminance: avg, isLight, skip }
}
