/**
 * Classifier corpus harness.
 *
 * This file is a *test fixture*, not part of any shipped package — it is
 * bundled (via esbuild, see `global-setup.ts`) and injected into a real
 * browser page so Playwright can exercise the actual, shipped classifier
 * modules under real `getComputedStyle`/rendering behavior, not jsdom.
 * Mirrors `extensions/transport/tests/e2e/harness/entry.ts`'s own
 * "harness wires the real modules, no reimplementation" discipline.
 *
 * Two independent verdicts are exposed, deliberately kept separate rather
 * than folded into one boolean, because they answer different questions and
 * conflating them is exactly the gap #722 is about:
 *
 *   - `classify`/`detect` — `theme-detector.ts`'s existing page-level
 *     light/dark heuristic ("does this page need theming, or is it already
 *     dark enough to leave alone?"). Luminance-only.
 *   - `sampleBodyComfort` — `adapter/swatches.ts`'s Φ_comfort, generalized
 *     (#722) to run over a live-sampled `(bg, text)` pair instead of only a
 *     registry `Swatch`'s hex tokens. A page can be `alreadyDark` per the
 *     first verdict while still failing Φ_comfort — a `#fff`-on-`#000`
 *     surface reads as "dark" by luminance alone, but is the "sun" pattern
 *     (#722's motivating screenshot) by any human's immediate judgment.
 *     The corpus spec asserts both verdicts against the same fixture so
 *     that gap is a checked, falsifiable property of this repo instead of
 *     an unarticulated observation in an issue thread.
 */

import {
  comfortReport,
  satisfiesComfort,
  type ComfortReport,
} from "@some-extension/filter/adapter/swatches"
import { parseColor } from "@some-extension/filter/lib/content/color"
import {
  classifyPage,
  detect,
  type ClassificationResult,
  type DetectionResult,
} from "@some-extension/filter/lib/content/theme-detector"

export type BodyComfortResult = {
  /** false when the body has no parseable bg or text color (nothing to judge). */
  readonly sampled: boolean
  readonly comfortable: boolean
  readonly report: ComfortReport | null
}

function sampleBodyComfort(): BodyComfortResult {
  const style = getComputedStyle(document.body)
  const bg = parseColor(style.backgroundColor)
  const text = parseColor(style.color)

  if (bg === null || text === null) {
    return { sampled: false, comfortable: false, report: null }
  }

  const sample = { bg, text }
  return {
    sampled: true,
    comfortable: satisfiesComfort(sample),
    report: comfortReport(sample),
  }
}

declare global {
  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- TS global augmentation requires `interface`, not `type`
  interface Window {
    __classifier: {
      classify(threshold?: number): ClassificationResult
      detect(threshold?: number): DetectionResult
      sampleBodyComfort(): BodyComfortResult
    }
  }
}

window.__classifier = {
  classify: (threshold): ClassificationResult => classifyPage(threshold),
  detect: (threshold): DetectionResult => detect(threshold),
  sampleBodyComfort,
}
