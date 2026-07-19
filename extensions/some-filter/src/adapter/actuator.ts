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
 * `pipeline.ts`), and the Sensor's `MutationObserver` watches only
 * `attributeFilter: ["class", "style"]`, so writing `data-sw-patched`,
 * `data-sw-dark`, or the `<style>` elements' `textContent` can never
 * itself re-trigger ingestion. Adding transport's generic ownership
 * attributes on top would tag thousands of ordinary vendor elements with
 * extension bookkeeping for no additional loop-suppression benefit.
 *
 * Idempotence (Theorem 7.2): every `realize` call rebuilds the dynamic
 * stylesheet's *entire* content from the current action list (not an
 * incremental append), so re-running the same actions twice is a no-op
 * `style.textContent` assignment. Per-surface tagging never explicitly
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

const DYNAMIC_STYLE_ID = "__sw_dark_dynamic"

function dynamicStyleEl(): HTMLStyleElement {
  const existing = document.getElementById(DYNAMIC_STYLE_ID)
  if (existing instanceof HTMLStyleElement) return existing
  const style = document.createElement("style")
  style.id = DYNAMIC_STYLE_ID
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
    document.documentElement.setAttribute(DARK_THEME_ATTR, "")
    injectDarkTheme(getSwatch(activate.swatchId))
  } else {
    document.documentElement.removeAttribute(DARK_THEME_ATTR)
    removeDarkTheme()
  }

  for (const action of actions) {
    if (action.kind !== "tag-surface") continue
    const value = action.role === "preserve" ? "preserve" : action.key
    for (const el of elementsByKey.get(action.key) ?? []) {
      if (el instanceof HTMLElement) {
        el.dataset.swPatched = value
      }
    }
  }

  const colorRules = actions
    .filter((action) => action.kind === "emit-surface-color")
    .map(
      (action) =>
        `[data-sw-patched="${action.key}"]${EXT_GUARD}{background-color:${action.css}!important}`
    )

  if (colorRules.length > 0) {
    dynamicStyleEl().textContent = colorRules.join("\n")
  } else {
    document.getElementById(DYNAMIC_STYLE_ID)?.remove()
  }
}
