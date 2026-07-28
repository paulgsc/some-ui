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
 * Filter-aware sampling (#741): every sampled color is a *declared* value —
 * getComputedStyle never reflects a `filter` an ancestor (typically <html>)
 * has applied, so a page wrapped in its own `filter: invert(...)` (a real
 * vendor accessibility toggle, or this extension's own legacy style) reads
 * exactly backwards to a human/screenshot versus what raw backgroundColor
 * says. `vendor-filter.ts`'s `detectVendorInvert()` reads the net invert
 * amount once per call and every tier composites its raw samples through it
 * before computing luminance, so the verdict tracks what is actually
 * rendered, not just what was declared.
 *
 * NOTE: the `isLight` framing is retained from the classify-then-apply era. The
 * always-apply / already-dark reframe is tracked in #236; this module's split
 * (#233) is structural only and preserves the existing decision semantics.
 */

import {
  effectiveBgColor,
  parseColor,
  relativeLuminance,
  type RGBA,
} from "./color"
import { applyInvertToColor, detectVendorInvert } from "./vendor-filter"

/** Luminance of `color` as it actually renders once composited through a still-active ancestor `invert(amount)` filter. */
function renderedLuminance(color: RGBA, invertAmount: number): number {
  const [r, g, b] = applyInvertToColor(color, invertAmount)
  return relativeLuminance(r, g, b)
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
 *      — Samples body > * directly (no __sw_page_layer wrapper).
 *      — Excludes extension-owned nodes via [data-my-ext].
 *   4. If zero opaque samples found → assume light (browser default = white).
 *   5. Weighted average. threshold=0.4 is generous — prefer applying dark theme.
 */
export function classifyPage(threshold = 0.4): ClassificationResult {
  const samples: Array<{ lum: number; weight: number }> = []
  const invertAmount = detectVendorInvert()

  // Tier 1: html and body
  const root = document.documentElement
  const body = document.body

  const elements: Array<HTMLElement | null> = [root, body]

  for (const el of elements) {
    if (el == null) continue
    const bg = getComputedStyle(el).backgroundColor
    const c = parseColor(bg)
    if (c) samples.push({ lum: renderedLuminance(c, invertAmount), weight: 2 })
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
    const c = effectiveBgColor(el)
    if (c !== null)
      samples.push({ lum: renderedLuminance(c, invertAmount), weight: 1.5 })
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
        lum: renderedLuminance(c, invertAmount),
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

export type DetectionResult = {
  /**
   * The page is already dark enough that applying our theme would double-darken
   * it — the orchestrator should restore vendor styles instead of theming.
   */
  alreadyDark: boolean
  /** Weighted average luminance of sampled backgrounds, or null if none found. */
  avgLuminance: number | null
  /** 0–1, how far the sampled luminance sits from the decision threshold. */
  confidence: number
}

/**
 * Public detection entry point used by the orchestrator. Read-only.
 *
 * Reframes classifyPage()'s light/dark verdict as an explicit already-dark
 * decision: we theme by default and only restore vendor styles when the page is
 * already dark. A null luminance (no opaque samples) is treated as light — the
 * browser-default-white assumption — so we keep the theme.
 */
export function detect(threshold = 0.4): DetectionResult {
  const { avgLuminance, isLight } = classifyPage(threshold)

  const alreadyDark = avgLuminance !== null && !isLight

  const confidence =
    avgLuminance === null
      ? 0
      : Math.min(1, Math.abs(avgLuminance - threshold) / threshold)

  return { alreadyDark, avgLuminance, confidence }
}
