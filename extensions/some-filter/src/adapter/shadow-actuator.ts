/**
 * The per-scope Actuator counterpart for both of `theme-apply.ts`'s CSS
 * layers — SF-AD (#1268), issue #1262's gap #3: `actuator.ts`'s
 * `DYNAMIC_STYLE_ID` `<style>` and the document-level static layer
 * (`buildDarkThemeCSS`) are both injected into `document.head`, and CSS's
 * own shadow-tree encapsulation means neither can ever select an element
 * inside a shadow root, however that root's own custody state
 * (`scope-registry.ts`) reads. `tag-surface` has no such gap — setting
 * `data-sw-patched` on an `HTMLElement` works identically inside a shadow
 * tree, so `actuator.ts`'s own `tagSurfaceElements` is reused unchanged
 * (see `shadow-scope-theming.ts`, this story's per-scope orchestrator,
 * which calls both). This module exists for the other two halves:
 * realizing `emit-surface-color` *and* the static text/border/form/etc.
 * layer into a `ShadowRoot` via `ShadowRoot.adoptedStyleSheets` — MDN's own
 * documented pattern for sharing style across shadow trees without
 * re-injecting a `<style>` element into each one. The static layer's own
 * addition here was bot-found on this story's own review: without it, a
 * shadow-internal `<p>` inheriting a light-theme foreground color from its
 * own shadow tree's stylesheet stayed dark-on-dark once its ancestor
 * surface's background was darkened — the per-surface `textCss` mechanism
 * only ever handles an element's own *explicit* differing color, never
 * plain inheritance, which is exactly what the static layer's blanket
 * `p`/`span`/`label`/… rule exists to cover for the light-DOM case.
 *
 * Sheet reuse (#1268's own acceptance criterion): a distinct dark surface
 * color's CSS rule text is parsed into a `CSSStyleSheet` at most once,
 * cached by that exact rule text, and every scope needing the identical
 * color *adopts the same object* — not a fresh parse per scope. Two scopes
 * sharing a `SurfaceKey` (the common case: the same vendor white recurs
 * across many shadow-hosted cards) share the memory and parse cost of one
 * sheet, proven by object identity in this module's own test suite, not
 * merely by visual equivalence.
 *
 * `insertRule`, not `replaceSync`: both have the identical effect for the
 * single-rule text this module ever constructs a sheet from, but jsdom (this
 * package's own unit-test environment, v26 at last check) has never
 * implemented `CSSStyleSheet.replaceSync` — only the original
 * `insertRule`/`deleteRule` pair — while real engines support both. Using
 * the one every environment this codebase actually runs in agrees on avoids
 * a jsdom-only stub for otherwise-real production code.
 *
 * `ShadowRoot.adoptedStyleSheets` is itself unimplemented by jsdom entirely
 * (no getter/setter on its prototype at all — a longstanding, still-open
 * jsdom gap, jsdom/jsdom#2916) — reading it back before this module's own
 * first write returns `undefined` there, never the real DOM's guaranteed
 * `[]`. `?? []` below keeps this module's own logic on one path in both
 * environments rather than branching test code around the gap; this
 * module's unit tests assert this module's own bookkeeping (identity,
 * reuse, idempotence), not real cascade application — that half is an e2e
 * concern, verified against the actual built extension in a real Chromium.
 */

import { DARK_THEME_BODY_RULES } from "@filter/lib/content/theme-apply"

import { buildSurfaceColorRule, tagSurfaceElements } from "./actuator"
import type { FilterAction } from "./contracts"

/** Re-exported so `shadow-scope-theming.ts` has one import for both halves of a shadow scope's realization — this module's own `realizeShadowColors` plus `actuator.ts`'s unchanged tag-surface loop. */
export { tagSurfaceElements }

/**
 * Every distinct dark-surface CSS rule this extension has ever realized
 * into any shadow scope, keyed by its own exact rule text — shared, never
 * cleared. The number of distinct colors a page's own design vocabulary can
 * produce is bounded independently of how many shadow scopes discover it,
 * so this cannot grow without bound the way a per-element cache could.
 */
const sheetCache = new Map<string, CSSStyleSheet>()

function sheetFor(cssText: string): CSSStyleSheet {
  const existing = sheetCache.get(cssText)
  if (existing !== undefined) return existing
  const sheet = new CSSStyleSheet()
  sheet.insertRule(cssText, 0)
  sheetCache.set(cssText, sheet)
  return sheet
}

/**
 * Which sheets *this module* has adopted into a given root — so a round
 * that stops needing a color removes only its own prior entry, never a
 * sheet the vendor page (or, in principle, some other extension) adopted on
 * its own. A `WeakMap`: once a scope's `ShadowRoot` becomes unreachable
 * (its host detached and `scope-registry.ts`'s own record purged), this
 * entry is free to be collected along with it — no explicit teardown call
 * needed on top of `scope-registry.ts`'s own `retire()`/`purge()`.
 */
const ownedSheetsByRoot = new WeakMap<ShadowRoot, ReadonlySet<CSSStyleSheet>>()

/**
 * The scoped counterpart to `theme-apply.ts`'s own static `<style>` layer
 * (headings/links/borders/code/tables/forms/scrollbars/selection/dialogs/
 * media, plus the `[data-sw-patched="preserve"]` revert rule) — built once,
 * lazily, and shared by every shadow scope regardless of swatch
 * (`DARK_THEME_BODY_RULES`'s own doc comment has the full reasoning: every
 * declaration references a `var(--sw-*)` custom property, inherited from
 * the document's own `:root` across the shadow boundary for free). Built
 * via a loop of `insertRule()` calls, one rule at a time — `replaceSync`
 * would take the whole block in one call, but jsdom (this package's own
 * unit-test environment) has never implemented it, and `insertRule` only
 * ever parses a single rule per call, which is exactly why
 * `DARK_THEME_BODY_RULES` is an array of complete, individual rules rather
 * than one pre-joined block of CSS text.
 */
let staticLayerSheet: CSSStyleSheet | null = null

function staticShadowLayer(): CSSStyleSheet {
  if (staticLayerSheet !== null) return staticLayerSheet
  const sheet = new CSSStyleSheet()
  for (const rule of DARK_THEME_BODY_RULES) {
    sheet.insertRule(rule, sheet.cssRules.length)
  }
  staticLayerSheet = sheet
  return sheet
}

/**
 * Realizes `actions` into `root`: the shared static layer (above) whenever
 * `actions` includes `activate-theme` — `decide()`'s own signal that this
 * round is actually committing the scope, present unconditionally whenever
 * a swatch is selected and the scope doesn't read as already-dark,
 * independent of whether any individual surface also needs its own
 * `emit-surface-color` color (mirrors `actuator.ts`'s document-level
 * `realize()`, where `activate-theme`'s static layer is realized
 * unconditionally alongside, not gated on, any given round's per-surface
 * actions) — plus one sheet per distinct `emit-surface-color` action.
 * Idempotent: re-running an unchanged action list touches
 * `root.adoptedStyleSheets` zero times (the reference itself is left
 * untouched, not merely reassigned to an equal-looking array), mirroring
 * `actuator.ts`'s own `realize()` idempotence discipline for the DOM writes
 * this module *can* observe (`adoptedStyleSheets` assignment is not itself
 * a DOM mutation — no `MutationObserver` anywhere in this codebase can see
 * it — but the discipline is worth keeping for its own sake: no needless
 * array churn on an unchanged round).
 *
 * An empty `actions` list (the uninstall half of a scope's committed
 * realization, `shadow-scope-theming.ts`) clears every sheet this module
 * previously adopted into `root`, static layer included, leaving any
 * non-extension entry (should one ever exist) untouched.
 */
export function realizeShadowColors(
  actions: ReadonlyArray<FilterAction>,
  root: ShadowRoot
): void {
  const desired = new Set<CSSStyleSheet>()
  if (actions.some((action) => action.kind === "activate-theme")) {
    desired.add(staticShadowLayer())
  }
  for (const action of actions) {
    if (action.kind !== "emit-surface-color") continue
    desired.add(sheetFor(buildSurfaceColorRule(action)))
  }

  const owned = ownedSheetsByRoot.get(root) ?? new Set<CSSStyleSheet>()
  // lib.dom.d.ts types this as always CSSStyleSheet[], never undefined —
  // true for every real engine, false for jsdom (this package's own
  // unit-test environment), which has no adoptedStyleSheets accessor on
  // ShadowRoot.prototype at all (jsdom/jsdom#2916) and so reads back
  // `undefined` here until this module's own first write. See this file's
  // own header.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  const current = root.adoptedStyleSheets ?? []
  const kept = current.filter(
    (sheet) => !owned.has(sheet) || desired.has(sheet)
  )
  const additions = [...desired].filter((sheet) => !kept.includes(sheet))
  const changed = additions.length > 0 || kept.length !== current.length
  const next = changed ? [...kept, ...additions] : current

  if (changed) {
    root.adoptedStyleSheets = next
  }
  ownedSheetsByRoot.set(root, desired)
}

/**
 * The per-scope counterpart to `actuator.ts`'s own `clearPerSurfaceState()`
 * (its `restore-native` branch) — strips every `data-sw-patched` tag and
 * every adopted sheet (static layer included) this module's own realization
 * placed on `root`.
 *
 * `decide()`'s own page-already-dark verdict withholds *every* per-surface
 * action outright (`theme-adapter.ts`'s early `if (pageAlreadyDark(...))
 * return [{ kind: "restore-native" }]`, before its per-surface loop ever
 * runs) — a scope moving toward `EXONERATED_NATIVE` therefore gets no fresh
 * `tag-surface`/`emit-surface-color` action to naturally overwrite a stale
 * tag from a *previous* commit the way a genuine re-commit with new evidence
 * would (`tagSurfaceElements`'s own `!==` guard only ever updates an
 * element's tag when a current action actually names it). Left uncleared, a
 * scope that goes `COMMITTED -> RESOLVING -> EXONERATED_NATIVE` (a real
 * path: a vendor mutation invalidates a themed scope, and the fresh scan
 * finds the mutation itself made the scope read as already-dark) would
 * release its occlusion hold with a stray element still carrying the old
 * commit's dark styling, visibly contradicting the "already correct, leave
 * it alone" verdict that just released the veil over it.
 */
export function clearShadowSurfaceState(root: ShadowRoot): void {
  root.querySelectorAll("[data-sw-patched]").forEach((el) => {
    el.removeAttribute("data-sw-patched")
  })
  realizeShadowColors([], root)
}
