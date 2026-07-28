/**
 * `some-filter`'s instantiation of the transport kernel's generic
 * parameters — the key space `K`, attribute space `Attr`, and action
 * alphabet `A` of `Adapter<K, Attr, A>` (Definition D.3, canon §D.1).
 * `@some-extension/transport` has no opinion about what these are (#618
 * ran the whole kernel with `K = string`, `Attr = { seq: number }`); this
 * module is that choice, written down as types.
 *
 * Types only, mirroring the shape of `@some-extension/transport/contracts/*`:
 * no `decide` implementation (S3), no swatch registry data (S2, #687), no
 * DOM reference or pipeline wiring (S5). A throwaway `decide: () => []`
 * stub was used during development to confirm these three choices satisfy
 * `Adapter` before this file was written; it is not committed —
 * `FilterAdapter` below is the permanent, zero-runtime-cost form of that
 * same proof.
 */

import type { RGBA } from "@filter/lib/content/color"
import type { Adapter } from "@some-extension/transport/contracts/adapter"

/**
 * The key space `K` (Definition 5.1) — canon §5.
 *
 * A key is a canonicalized *observed background color* — a surface bucket
 * — not a DOM node or node identity. `theme-apply.ts`'s existing
 * `colorTokens` registry (`tokenForBackground`) already makes this choice
 * implicitly: it dedupes by color rather than by element, because the same
 * background color recurs across thousands of nodes (a site's shared
 * card/table/button background) and the decide-what-to-do-with-it question
 * is per-color, not per-node. Today `tokenForBackground` dedupes on the
 * *computed dark output* (`modifiedCss`); because `modifyBackgroundColor`
 * is a pure function of the source color, that is operationally equivalent
 * to deduping on the *source* color. `SurfaceKey` canonicalizes the source
 * instead — the more principled choice, since it keeps target-color
 * computation inside `decide` (S3) rather than baked into the estimator's
 * notion of identity. Keying `K` on node identity instead would force one
 * hypothesis entry per occurrence rather than per distinct surface, against
 * Definition 5.1's whole point ("one hypothesis per key").
 *
 * Concretely: the canonical `rgba()` form of `color.ts`'s `parseColor`
 * output, integer-quantized. Two elements share a key exactly when
 * `classifyElement` would make the same call for both.
 */
export type SurfaceKey = string

/**
 * The attribute space `Attr` (Definition 5.1) — canon §5.
 *
 * The evidence `classifyElement` already derives per element via
 * `color.ts`, minus anything that would duplicate transport's own
 * bookkeeping. `color` and `luminance` mirror `parseColor` +
 * `relativeLuminance`'s return values; `opacity` is the alpha channel
 * `classifyElement` already reads to skip near-transparent glass layers
 * (`color.ts`'s `parseColor` guards `a < 0.05`, `classifyElement`'s own
 * early-return guards `a < 0.1`).
 *
 * Deliberately excluded: a per-attribute certainty/tier field. Definition
 * 4.1's `raw | partial | full` codomain is transport's own evidentiary
 * bookkeeping — kept in the estimator's `ProvenanceStore`
 * (`estimator/update.ts`), not the public `Hypothesis<K, Attr>` surface
 * (Definition 5.1's own comment: "not part of the public Hypothesis query
 * surface"). Folding a tier into `Attr` here would duplicate state
 * transport already orders on.
 */
export type SurfaceAttr = {
  readonly color: RGBA
  readonly luminance: number
  readonly opacity: number
  /**
   * The element's own, non-inherited text color — set only when it differs
   * from its parent's computed `color` (an explicit vendor declaration, not
   * ambient inheritance). `undefined`/`null` when there is nothing of the
   * carrier's own to re-target. A `surface`-classified element's inline
   * text was authored for its *original* (light) background and is
   * otherwise left untouched when that background gets darkened — #741's
   * "it darkens text so that it's not visible at all".
   */
  readonly text?: RGBA | null
  /**
   * True when this key's `color`/`luminance` are an *assumed* stand-in
   * (not a real `background-color`) for a light `background-image`
   * gradient the sampler found no other way to evidence — #741's "white
   * gradients leak". The actuator suppresses the image itself for these
   * keys, since there is no real color to recolor.
   */
  readonly imageOnly?: boolean
}

/**
 * The action alphabet `A` (Definition D.3) — canon §D.1, §7.
 *
 * The two effects `theme-apply.ts`'s JS luminance patcher performs today,
 * re-expressed as declarative records instead of direct DOM writes:
 *   - `patchElement` sets `el.dataset.swPatched = token | "preserve"` —
 *     a `tag-surface` action, parameterized by which `SwatchRole` the
 *     surface was classified into.
 *   - `tokenForBackground` appends a `[data-sw-patched="…"]{…}` rule to the
 *     dynamic stylesheet the first time a distinct dark surface color is
 *     needed — an `emit-surface-color` action, one per key, not per node.
 * Both extend transport's base `Action` (the `kind` discriminant); the
 * Actuator (S5) will be the only module permitted to realize them.
 */
export type SwatchRole = "surface" | "preserve"

export type TagSurfaceAction = {
  readonly kind: "tag-surface"
  readonly key: SurfaceKey
  readonly role: SwatchRole
}

export type EmitSurfaceColorAction = {
  readonly kind: "emit-surface-color"
  readonly key: SurfaceKey
  readonly css: string
  /** Hue-preserving-lightened override for the carrier's own text color (`SurfaceAttr.text`), when it has one. */
  readonly textCss?: string
  /** Suppresses `background-image` on the carrier — set when this key's evidence came from `SurfaceAttr.imageOnly`, so there is no real background color underneath the emitted `css` to show through otherwise. */
  readonly suppressImage?: boolean
}

/**
 * The page-level counterpart to `theme-detector.ts`'s `alreadyDark` verdict
 * (added in S3, #688): `runAutoTheme()`'s `if (verdict.alreadyDark)
 * restoreVendor()` branch becomes an action `decide` emits instead of an
 * imperative call — withholding every per-surface action for the round
 * rather than issuing them and having a caller undo the result.
 */
export type RestoreNativeAction = {
  readonly kind: "restore-native"
}

/**
 * The static-layer counterpart to `content.ts`'s unconditional
 * `applyTheme("dark")` call (added in S5, #690, while wiring the real
 * pipeline surfaced the gap): `activateDarkTheme()` sets `DARK_THEME_ATTR`
 * and injects `buildDarkThemeCSS(swatch)` *regardless* of whether any
 * per-surface evidence exists yet (the `transparent-page` e2e fixture — no
 * element anywhere has an explicit background, so `Ĥ` is empty — still
 * expects the static dark layer to activate). Emitted first, whenever a
 * swatch is selected and the page does not already read as dark; the
 * Actuator (S5) realizes it exactly once regardless of how many times
 * `decide` re-emits it for an unchanged verdict (idempotent per Theorem
 * 7.2, same as every other action here).
 */
export type ActivateThemeAction = {
  readonly kind: "activate-theme"
  readonly swatchId: string
}

export type FilterAction =
  | ActivateThemeAction
  | TagSurfaceAction
  | EmitSurfaceColorAction
  | RestoreNativeAction

/**
 * The instantiated kernel: `Adapter<SurfaceKey, SurfaceAttr, FilterAction>`.
 * Naming this alias forces `FilterAction` to satisfy transport's `Action`
 * bound at the type level — the permanent proof that `K`, `Attr`, and `A`
 * as chosen above type-check against `@some-extension/transport`'s exported
 * `Adapter`, with no logic and no DOM reference anywhere in this file.
 */
export type FilterAdapter = Adapter<SurfaceKey, SurfaceAttr, FilterAction>
