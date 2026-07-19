/**
 * The theme Adapter — `decide : Ĥ → Fin(A)` (Definition D.3, canon §D.1,
 * Axiom D.1). S3 of the some-filter-on-transport epic (#685, #688).
 *
 * Pure, total, no DOM, no `getComputedStyle`: everything domain-specific
 * about theming a page collapses into this one function of the estimator's
 * current hypothesis (S1's `SurfaceKey`/`SurfaceAttr`) and the active
 * swatch (S2). `theme-detector.ts` and `theme-apply.ts`'s JS patcher are
 * untouched by this story — they remain the live pipeline until S5 rewires
 * `content.ts` onto Sensor → Estimator → Scheduler → Actuator. This module
 * is the *destination* of that rewiring, built and proven correct first.
 *
 * Per-surface classification reuses `color.ts`/`modify-colors.ts`'s
 * existing, canon-blessed luminance math unchanged (S3's own framing: "keep
 * the existing luminance math... it simply moves inside decide as pure
 * computation over Ĥ, instead of running against live getComputedStyle
 * reads"). The page-level verdict folds `theme-detector.ts`'s
 * `classifyPage()`/`detect()` decision arithmetic (weighted-average
 * luminance vs. a threshold) into a pure predicate over Ĥ's evidenced
 * keys — deliberately *unweighted* (Ĥ's `SurfaceAttr` carries no per-key
 * weight; `classifyPage()`'s tiered/viewport-coverage weighting is what
 * decides *which* evidence lands in Ĥ and is therefore a Sensor concern,
 * S5's to supply, not this pure function's to re-derive from live DOM).
 */

import {
  modifyBackgroundColor,
  rgbaToCss,
} from "@filter/lib/content/modify-colors"
import type { Hypothesis } from "@some-extension/transport/contracts/hypothesis"

import type { FilterAction, SurfaceAttr, SurfaceKey } from "./contracts"
import type { Swatch } from "./swatches"

// Mirrors theme-apply.ts's classifyElement thresholds exactly (unchanged math).
const LIGHT_THRESHOLD = 0.3
const PRESERVE_THRESHOLD = 0.06
const OPACITY_SKIP_THRESHOLD = 0.1

// Mirrors theme-detector.ts's classifyPage()/detect() default threshold.
const PAGE_LUMINANCE_THRESHOLD = 0.4

/**
 * `detect()`'s `alreadyDark` verdict, folded into a pure predicate over Ĥ:
 * an unweighted mean luminance across every evidenced key, compared against
 * the same threshold `classifyPage()` uses. No evidence yet (`count === 0`)
 * mirrors `classifyPage()`'s own zero-samples case — assume light (the
 * browser-default-white bias), i.e. not already dark.
 */
function pageAlreadyDark(
  hypothesis: Hypothesis<SurfaceKey, SurfaceAttr>
): boolean {
  let total = 0
  let count = 0

  for (const key of hypothesis.keys()) {
    const attr = hypothesis.get(key)
    if (attr === undefined) continue
    total += attr.luminance
    count += 1
  }

  if (count === 0) return false

  const avgLuminance = total / count
  return avgLuminance <= PAGE_LUMINANCE_THRESHOLD
}

/**
 * `decide(Ĥ)`. A `swatch` of `null` is the degenerate "no theme selected"
 * case and mirrors the null adapter (Theorem D.2): `∅` unconditionally,
 * before the page-level verdict is even evaluated.
 */
export function decide(
  hypothesis: Hypothesis<SurfaceKey, SurfaceAttr>,
  swatch: Swatch | null
): ReadonlyArray<FilterAction> {
  if (swatch === null) {
    return []
  }

  if (pageAlreadyDark(hypothesis)) {
    return [{ kind: "restore-native" }]
  }

  const actions: Array<FilterAction> = []

  for (const key of hypothesis.keys()) {
    const attr = hypothesis.get(key)
    if (attr === undefined) continue
    if (attr.opacity < OPACITY_SKIP_THRESHOLD) continue

    if (attr.luminance > LIGHT_THRESHOLD) {
      actions.push({ kind: "tag-surface", key, role: "surface" })
      actions.push({
        kind: "emit-surface-color",
        key,
        css: rgbaToCss(modifyBackgroundColor(attr.color)),
      })
      continue
    }

    if (attr.luminance < PRESERVE_THRESHOLD) {
      actions.push({ kind: "tag-surface", key, role: "preserve" })
    }
  }

  return actions
}
