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
 *
 * `ActivateThemeAction` (S5, #690) is always the first action whenever a
 * swatch is active and the page doesn't already read as dark — the static
 * layer (`buildDarkThemeCSS`) is a page-wide binary switch, independent of
 * whether any individual surface needs its own tag/emit action.
 */

import {
  modifyBackgroundColor,
  modifyForegroundColor,
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

// Below this many evidenced keys, an unweighted mean is not a page-level
// verdict — it is one or two elements' colors standing in for the whole
// page. Real pages routinely render a handful of dark chrome/skeleton
// elements (nav bars, loading placeholders) well before their actual (light)
// body content hydrates; on a heavy client-rendered SPA that reloads itself
// shortly after initial paint (an observed real-world pattern, exact
// trigger unconfirmed), a reactive rescan can fire while evidence is this
// sparse and conclude "page is already dark" from pure happenstance. That
// verdict then emits restore-native, which strips the theme and — via
// content.ts's onFire, applied=false takes the immediate disablePrepaint()
// branch rather than the atomic commitVisualState() swap — drops the veil
// right away, exposing the page's true (light) background with no further
// correction once more evidence arrives. Below the threshold, the existing
// "insufficient evidence -> assume light" bias (previously only count === 0)
// just extends to "not enough evidence to trust either way."
const MIN_EVIDENCE_FOR_DARK_VERDICT = 3

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

  if (count < MIN_EVIDENCE_FOR_DARK_VERDICT) return false

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

  // Static layer first, independent of per-surface evidence: a page with
  // zero evidenced keys (nothing anywhere has an explicit background) still
  // gets the dark canvas + text tokens (the transparent-page fixture).
  const actions: Array<FilterAction> = [
    { kind: "activate-theme", swatchId: swatch.id },
  ]

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
        // The carrier's own inline text color (if it has one) was authored
        // for its *original* light background and is otherwise left
        // untouched by darkening that background out from under it — #741
        // ("it darkens text so that it's not visible at all"). Lifted
        // through the same hue-preserving band the swatch registry's own
        // text tokens use, never a raw #fff (Φ_comfort's "text is never the
        // brightest thing on screen" — the "bright white text" failure mode
        // is exactly as unacceptable here as the unthemed-bright-bg one).
        ...(attr.text !== undefined && attr.text !== null
          ? { textCss: rgbaToCss(modifyForegroundColor(attr.text)) }
          : {}),
        // imageOnly evidence (a light background-image gradient, #741 "white
        // gradients leak") has no real background-color underneath the
        // emitted css above — the image itself must go, or it keeps
        // rendering exactly as authored on top of it.
        ...(attr.imageOnly === true ? { suppressImage: true } : {}),
      })
      continue
    }

    if (attr.luminance < PRESERVE_THRESHOLD) {
      actions.push({ kind: "tag-surface", key, role: "preserve" })
    }
  }

  return actions
}
