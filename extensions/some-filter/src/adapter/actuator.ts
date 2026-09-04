/**
 * The Actuator — realizes S1/S3's `FilterAction`s against the DOM
 * (Definition 7.3, canon §7; §8's `(ACT)` rule). S5 of the
 * some-filter-on-transport epic (#685, #690).
 *
 * The *only* module that writes `data-sw-patched`, the dynamic per-surface
 * color stylesheet, or (via `theme-apply.ts`'s exported primitives) the
 * static dark-theme layer and `data-sw-dark`. Everything upstream —
 * `pipeline.ts`'s Sensor/Estimator, `theme-adapter.ts`'s `decide` — only
 * ever *describes* what should happen; this is where description becomes
 * effect.
 *
 * Self-tagging (Definition 7.3, Remark 7.2): deliberately does *not* route
 * through `@some-extension/transport/actuator/apply`'s generic
 * `tag()`/self-tag-attribute wrapper. The structural exclusion Corollary
 * 7.3.1 requires is already discharged the way canon §9.2 already
 * describes for this extension — `[data-my-ext]` marks extension-owned
 * subtrees (checked by the Sensor before an element is ever read, in
 * `pipeline.ts`). Adding transport's generic ownership attributes on top
 * would tag thousands of ordinary vendor elements with extension
 * bookkeeping for no additional loop-suppression benefit.
 *
 * The `attributeFilter: ["class", "style"]` on the Sensor's observer is
 * *not*, on its own, the reason our writes cannot re-trigger ingestion —
 * this module's doc used to claim it was, and that claim cost #831. The
 * filter constrains only the `attributes` records; the observer is also
 * subscribed to `childList` over the whole `documentElement` subtree, and
 * injecting a `<style>` into `<head>` (or reassigning its `textContent`,
 * which replaces its child text node) is exactly such a mutation. Two
 * things close that hole, both required: every stylesheet this extension
 * inserts carries `[data-my-ext]` so the Sensor can *recognise* the record
 * as its own (`pipeline.ts`'s `isSelfAuthored`), and every write below is
 * guarded so an unchanged round emits no record to recognise.
 *
 * Idempotence (Theorem 7.2): every `realize` call rebuilds the dynamic
 * stylesheet's *entire* content from the current action list (not an
 * incremental append), and assigns it only when the rebuilt text actually
 * differs, so re-running the same actions twice is not merely a no-op in
 * *effect* but a no-op in *DOM writes*. Per-surface tagging never explicitly
 * clears a stale attribute when an element's classification changes away
 * from "surface"/"preserve" — this matches the pre-S5 patcher's own
 * behavior exactly (`patchElement` never cleared either), not a new gap.
 */

import {
  DARK_THEME_ATTR,
  EXT_GUARD,
  injectDarkTheme,
  removeDarkTheme,
  restoreVendor,
} from "@filter/lib/content/theme-apply"

import type { FilterAction, SurfaceKey } from "./contracts"
import { getSwatch } from "./swatches"

export const DYNAMIC_STYLE_ID = "__sw_dark_dynamic"

function dynamicStyleEl(): HTMLStyleElement {
  const existing = document.getElementById(DYNAMIC_STYLE_ID)
  if (existing instanceof HTMLStyleElement) return existing
  const style = document.createElement("style")
  style.id = DYNAMIC_STYLE_ID
  // Marks this sheet extension-owned for both EXT_GUARD and the Sensor's
  // self-authored-mutation filter — see theme-apply.ts's createExtensionStyle.
  style.setAttribute("data-my-ext", "")
  document.head.appendChild(style)
  return style
}

function clearPerSurfaceState(): void {
  document.getElementById(DYNAMIC_STYLE_ID)?.remove()
  document.querySelectorAll("[data-sw-patched]").forEach((el) => {
    el.removeAttribute("data-sw-patched")
  })
}

/**
 * Sets `data-sw-patched` on every element `elementsByKey` maps a
 * `tag-surface` action's key to. Scope-agnostic — an `HTMLElement` tags
 * identically whether it lives in the light DOM or inside a shadow tree —
 * so `shadow-scope-theming.ts` (SF-AD, #1268) reuses this unchanged rather
 * than re-implementing the same loop for a per-scope realization.
 */
export function tagSurfaceElements(
  actions: ReadonlyArray<FilterAction>,
  elementsByKey: ReadonlyMap<SurfaceKey, ReadonlyArray<Element>>
): void {
  for (const action of actions) {
    if (action.kind !== "tag-surface") continue
    const value = action.role === "preserve" ? "preserve" : action.key
    for (const el of elementsByKey.get(action.key) ?? []) {
      if (el instanceof HTMLElement && el.dataset.swPatched !== value) {
        el.dataset.swPatched = value
      }
    }
  }
}

/**
 * Builds the one `[data-sw-patched="…"]{…}` CSS rule text for a single
 * `emit-surface-color` action. Extracted so `shadow-scope-theming.ts`
 * (SF-AD, #1268) can construct the identical rule text a shadow scope's own
 * `ShadowRoot.adoptedStyleSheets` realization needs — this module's own
 * `DYNAMIC_STYLE_ID` `<style>` element is injected into `document.head` and
 * cannot select into a shadow tree at all (CSS encapsulation), so a shadow
 * scope needs its own realization path, built from the same rule text.
 */
export function buildSurfaceColorRule(
  action: Extract<FilterAction, { kind: "emit-surface-color" }>
): string {
  const declarations = [`background-color:${action.css}!important`]
  if (action.textCss !== undefined) {
    declarations.push(`color:${action.textCss}!important`)
  }
  if (action.suppressImage === true) {
    declarations.push("background-image:none!important")
  }
  return `[data-sw-patched="${action.key}"]${EXT_GUARD}{${declarations.join(";")}}`
}

/**
 * Realizes `actions` (S3's `Fin(A)`) against the DOM. `elementsByKey` is
 * the current scan's `SurfaceKey -> elements` mapping (`pipeline.ts`) —
 * `decide` only ever names a key, never a physical element, so the
 * Actuator is where a key is resolved back to the carriers currently
 * believed to share it.
 */
export function realize(
  actions: ReadonlyArray<FilterAction>,
  elementsByKey: ReadonlyMap<SurfaceKey, ReadonlyArray<Element>>
): void {
  const restoreNative = actions.some(
    (action) => action.kind === "restore-native"
  )
  if (restoreNative) {
    restoreVendor()
    clearPerSurfaceState()
    return
  }

  const activate = actions.find(
    (action): action is Extract<typeof action, { kind: "activate-theme" }> =>
      action.kind === "activate-theme"
  )
  if (activate !== undefined) {
    // `setAttribute` re-queues a mutation record even when the value is
    // unchanged (unlike `removeAttribute`, which no-ops on an absent
    // attribute) — write only on a real transition, so a re-fire of an
    // unchanged verdict touches nothing at all (#831).
    if (!document.documentElement.hasAttribute(DARK_THEME_ATTR)) {
      document.documentElement.setAttribute(DARK_THEME_ATTR, "")
    }
    injectDarkTheme(getSwatch(activate.swatchId))
  } else {
    document.documentElement.removeAttribute(DARK_THEME_ATTR)
    removeDarkTheme()
  }

  tagSurfaceElements(actions, elementsByKey)

  const colorRules = actions
    .filter(
      (
        action
      ): action is Extract<FilterAction, { kind: "emit-surface-color" }> =>
        action.kind === "emit-surface-color"
    )
    .map(buildSurfaceColorRule)

  if (colorRules.length > 0) {
    const css = colorRules.join("\n")
    const style = dynamicStyleEl()
    // Same reason as the attribute guard above, one level up: `textContent =`
    // replaces the element's child text node unconditionally, so re-emitting
    // byte-identical CSS is still a childList mutation the Sensor sees. That
    // is what turned "rebuild the whole sheet every round" (this module's
    // idempotence strategy) into a self-sustaining rescan loop (#831).
    if (style.textContent !== css) {
      style.textContent = css
    }
  } else {
    document.getElementById(DYNAMIC_STYLE_ID)?.remove()
  }
}
