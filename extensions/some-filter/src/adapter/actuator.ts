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
  DARK_THEME_STYLE_ID,
  EXT_GUARD,
  injectDarkTheme,
  LEGACY_FILTER_STYLE_ID,
  removeDarkTheme,
  restoreVendor,
} from "@filter/lib/content/theme-apply"

import type { FilterAction, SurfaceKey } from "./contracts"
import { clearAllProvisional } from "./provisional"
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

/**
 * Drops the per-surface realization outright: the dynamic `<style>` and
 * every `data-sw-patched` tag whose rules it carried.
 *
 * Used by `realize()`'s own `restore-native` branch below, and exported for
 * `pipeline.ts`'s `clearRealizedColorState` — leaving auto mode altogether
 * never reaches a `restore-native` round (`content.ts` tears the session
 * down first), so that transition has to clear this state explicitly.
 */
export function clearPerSurfaceState(): boolean {
  const style = document.getElementById(DYNAMIC_STYLE_ID)
  style?.remove()
  const tagged = document.querySelectorAll("[data-sw-patched]")
  tagged.forEach((el) => {
    el.removeAttribute("data-sw-patched")
  })
  return style !== null || tagged.length > 0
}

/**
 * A realm-independent replacement for `node instanceof HTMLElement` —
 * mirrors `shadow-scope-discovery.ts`'s own `isElementNode` (`nodeType`,
 * not a prototype check, so it survives cross-realm adoption) one level
 * more specific: an element created in a same-origin iframe's own document,
 * then adopted into this one (`adoptNode()`, or a plain `appendChild()`
 * across documents, which adopts implicitly), keeps that *other* realm's
 * `HTMLElement` constructor on its own prototype chain, failing `instanceof`
 * against *this* realm's `HTMLElement` even though it is a genuine,
 * connected, walkable HTML element. `namespaceURI` is the realm-independent
 * equivalent of "is this specifically an HTML element, not SVG/MathML" —
 * ordinary `document.createElement()` output (in any realm) always carries
 * the fixed, spec-defined `"http://www.w3.org/1999/xhtml"` value, which
 * `instanceof HTMLElement` is really testing for indirectly. Used by both
 * this function and `pipeline.ts`'s `scan()` — SF-AD's own review (round 3)
 * found this gap in both, and both need the identical fix for a cross-realm
 * element inside a shadow scope to actually get tagged: `scan()`'s own gap
 * (fixed there directly) meant such an element was never even classified as
 * evidence; this one meant that even once classified, it was silently
 * skipped at tagging time, so its own `emit-surface-color` rule — keyed on
 * `[data-sw-patched="…"]`, which only this loop ever sets — could never
 * match it either way.
 */
// A private duplicate of shadow-scope-discovery.ts's own exported
// isElementNode (same one-line nodeType check), not a shared import: that
// module imports from pipeline.ts, which imports from this one, so
// importing the other way would be circular. Small and stable enough that
// duplicating it here is simpler than restructuring the module graph to
// share it.
function isElementNode(node: Node): node is Element {
  return node.nodeType === Node.ELEMENT_NODE
}

// The XHTML namespace URI — a fixed DOM-spec identifier every element.
// namespaceURI getter returns verbatim, never a resource this extension
// (or anything else) fetches; the http:// scheme here is part of the
// spec's own literal string, not a network address to secure.
// eslint-disable-next-line no-restricted-syntax
const XHTML_NS = "http://www.w3.org/1999/xhtml"

export function isHTMLElementNode(node: Node): node is HTMLElement {
  return isElementNode(node) && node.namespaceURI === XHTML_NS
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
): boolean {
  let wrote = false
  for (const action of actions) {
    if (action.kind !== "tag-surface") continue
    const value = action.role === "preserve" ? "preserve" : action.key
    for (const el of elementsByKey.get(action.key) ?? []) {
      if (isHTMLElementNode(el) && el.dataset.swPatched !== value) {
        el.dataset.swPatched = value
        wrote = true
      }
    }
  }
  return wrote
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
): boolean {
  const restoreNative = actions.some(
    (action) => action.kind === "restore-native"
  )
  if (restoreNative) {
    // Whether there was anything to tear down, not merely whether teardown
    // ran (bot-found, Codex's closing review of #1412; an earlier version
    // returned `true` unconditionally here, on the mistaken premise that
    // this branch is rare). `decide()` emits `restore-native` on *every*
    // reactive round for a natively-dark document, not only when the
    // verdict first flips — so an unconditional `true` makes every
    // unrelated light-DOM mutation on such a page re-walk every committed
    // shadow tree, which is exactly the cost this signal exists to avoid.
    // Sampled before the teardown, since afterwards there is nothing left
    // to tell the two cases apart.
    const hadTheme =
      document.documentElement.hasAttribute(DARK_THEME_ATTR) ||
      document.getElementById(DARK_THEME_STYLE_ID) !== null ||
      document.getElementById(LEGACY_FILTER_STYLE_ID) !== null
    restoreVendor()
    // Deliberately `||` with the call on the right of an already-true
    // operand's short circuit avoided: both of these must run whatever
    // hadTheme says, so they are called first and combined after.
    const clearedSurfaces = clearPerSurfaceState()
    // A provisional fill outlives its purpose the moment the verdict is
    // "this page needs no theme": the round that would otherwise lift it
    // has just decided there is nothing to hand over to, so nothing else
    // ever would.
    const clearedProvisional = clearAllProvisional()
    return hadTheme || clearedSurfaces || clearedProvisional
  }

  const activate = actions.find(
    (action): action is Extract<typeof action, { kind: "activate-theme" }> =>
      action.kind === "activate-theme"
  )
  // Whether this call actually wrote anything to the DOM — what
  // `content.ts` gates its shadow-scope re-contrast pass on (bot-found,
  // Codex review round 3 on #1412). An earlier version of that gate
  // compared the *action list* instead, which measurement showed is wrong:
  // an element whose background matches a `SurfaceKey` the page already has
  // emits no new action at all, yet gets tagged and darkened. What moves a
  // backdrop is a write, so a write is what this reports.
  let wrote = false

  if (activate !== undefined) {
    // `setAttribute` re-queues a mutation record even when the value is
    // unchanged (unlike `removeAttribute`, which no-ops on an absent
    // attribute) — write only on a real transition, so a re-fire of an
    // unchanged verdict touches nothing at all (#831).
    if (!document.documentElement.hasAttribute(DARK_THEME_ATTR)) {
      document.documentElement.setAttribute(DARK_THEME_ATTR, "")
      wrote = true
    }
    // Reported (bot-found, Codex's confirming review of #1412): an earlier
    // version skipped this on the claim that "the static layer declares no
    // per-element colour — nothing a shadow scope's backdrop resolves
    // through", which is simply false. That layer owns the
    // `html, body { background: … }` canvas rule, and a shadow carrier
    // whose own ancestors are all transparent walks straight out of its
    // root onto `body`. A vendor framework removing or replacing this sheet
    // therefore moves that backdrop — and with `data-sw-dark` already
    // present, nothing else here would have reported a write.
    if (injectDarkTheme(getSwatch(activate.swatchId))) wrote = true
  } else {
    if (document.documentElement.hasAttribute(DARK_THEME_ATTR)) {
      document.documentElement.removeAttribute(DARK_THEME_ATTR)
      wrote = true
    }
    if (document.getElementById(DARK_THEME_STYLE_ID) !== null) wrote = true
    removeDarkTheme()
  }

  if (tagSurfaceElements(actions, elementsByKey)) wrote = true

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
      wrote = true
    }
  } else {
    const existing = document.getElementById(DYNAMIC_STYLE_ID)
    if (existing !== null) {
      existing.remove()
      wrote = true
    }
  }

  return wrote
}
