/**
 * Theme detector — decides whether a page needs our dark theme.
 *
 * Read-only: this module samples computed styles via getComputedStyle but never
 * mutates the DOM. It is the counterpart to theme-apply, which owns all writes.
 * Keeping detection side-effect-free lets the orchestrator (content.ts) run it
 * inside a prepaint-suppression lock without worrying about ordering of writes.
 *
 * Key design decisions:
 *   - When body.backgroundColor is transparent, we don't skip — we bias toward
 *     applying the theme, because a transparent body typically means the page
 *     relies on the browser default (white). Unknown == probably light.
 *   - We sample widely (body, html, large containers by viewport area) rather
 *     than just named semantic elements, because real-world pages are soup.
 *   - Conservative only against false-darkening: dark pages almost always set
 *     an explicit bg, so they'll be caught. Light pages with no bg → assume light.
 *
 * Tier 3 samples `body > *` directly (vendor DOM is not wrapped). Extension-owned
 * nodes are excluded via the [data-my-ext] attribute filter.
 *
 * NOTE: the `isLight` framing is retained from the classify-then-apply era. The
 * always-apply / already-dark reframe is tracked in #236; this module's split
 * (#233) is structural only and preserves the existing decision semantics.
 */

import { effectiveBgLuminance, parseColor, relativeLuminance } from "./color"

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
 *      — Samples body > * directly (no __sw_page_layer wrapper).
 *      — Excludes extension-owned nodes via [data-my-ext].
 *   4. If zero opaque samples found → assume light (browser default = white).
 *   5. Weighted average. threshold=0.4 is generous — prefer applying dark theme.
 */
export function classifyPage(threshold = 0.4): ClassificationResult {
  const samples: Array<{ lum: number; weight: number }> = []

  // Tier 1: html and body
  const root = document.documentElement
  const body = document.body

  const elements: Array<HTMLElement | null> = [root, body]

  for (const el of elements) {
    if (el == null) continue
    const bg = getComputedStyle(el).backgroundColor
    const c = parseColor(bg)
    if (c) samples.push({ lum: relativeLuminance(c[0], c[1], c[2]), weight: 2 })
  }

  // Tier 2: semantic containers
  const semanticSelectors = [
    "main",
    "article",
    "#app",
    "#root",
    "#content",
    "#wrapper",
    "#container",
    "#main",
    "#page",
    "[role='main']",
    "[role='document']",
  ]
  for (const sel of semanticSelectors) {
    const el = document.querySelector(sel)
    if (!el) continue
    if (el.hasAttribute("data-my-ext") || el.closest("[data-my-ext]")) continue
    const lum = effectiveBgLuminance(el)
    if (lum !== null) samples.push({ lum, weight: 1.5 })
  }

  // Tier 3: largest visible containers by viewport coverage.
  // Samples body > * directly — vendor DOM is no longer wrapped.
  // Extension-owned nodes excluded via [data-my-ext] attribute check.
  const containerCandidates = Array.from(
    document.querySelectorAll(
      "body > *, body > div, body > section, body > main, body > header"
    )
  )
    .filter((el) => {
      if (el.id === "__sw_overlay_root") return false
      if (el.hasAttribute("data-my-ext")) return false
      if (el.closest("[data-my-ext]")) return false
      return true
    })
    .map((el) => ({ el, coverage: viewportCoverage(el) }))
    .filter(({ coverage }) => coverage > 0.05)
    .sort((a, b) => b.coverage - a.coverage)
    .slice(0, 8)

  for (const { el, coverage } of containerCandidates) {
    const bg = getComputedStyle(el).backgroundColor
    const c = parseColor(bg)
    if (c)
      samples.push({
        lum: relativeLuminance(c[0], c[1], c[2]),
        weight: coverage,
      })
  }

  if (samples.length === 0) {
    return { avgLuminance: null, isLight: true, skip: false }
  }

  const totalWeight = samples.reduce((a, s) => a + s.weight, 0)
  const avg = samples.reduce((a, s) => a + s.lum * s.weight, 0) / totalWeight

  const isLight = avg > threshold
  const skip = avg < threshold * 0.5

  return { avgLuminance: avg, isLight, skip }
}

/**
 * Public detection entry point used by the orchestrator. Currently a thin
 * wrapper over classifyPage(); #236 will evolve the returned shape toward an
 * explicit already-dark decision. Read-only.
 */
export function detect(threshold?: number): ClassificationResult {
  return classifyPage(threshold)
}
