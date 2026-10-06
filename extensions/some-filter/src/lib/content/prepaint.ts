/**
 * Prepaint veil — an anti-flash dark layer painted OVER the page.
 *
 * A single overlay element promoted to the top layer. It is not an ancestor
 * of vendor nodes, so their computed styles stay intact and the detector
 * reads TRUE vendor colors with the veil still up. Trade-off: an opaque
 * cover shows a flat dark fill, not an inverted preview; readable truth plus
 * continuous dark is worth more for the sub-second pre-theme window.
 *
 * Created at document_start by prepaint-start.js; its styles live in
 * prepaint.css (gated on the element id), so it paints the instant it is
 * inserted. It carries [data-my-ext] so the detector and patcher skip it.
 *
 * Rerender resilience
 * ───────────────────
 * The veil is anchored to <html>, not <body>, so body.innerHTML replacements
 * cannot remove it. A CSS backstop in prepaint.css
 * (html.sw-dirty > body { background: #000 }) keeps the canvas black even if
 * the element is removed.
 *
 * The sw-dirty class on <html> is the ownership signal:
 *   enablePrepaint()  → adds sw-dirty + creates veil element
 *   disablePrepaint() → removes sw-dirty first (prevents self-healing observer
 *                       from re-creating) then removes veil element
 */

import { parseColor } from "./color"
import { rgbaToCss } from "./modify-colors"
import { counterInvertColor, detectVendorInvert } from "./vendor-filter"

export const PREPAINT_VEIL_ID = "__sw_prepaint_veil"

/**
 * The veil's ownership signal on `<html>`. Exported because it is one of the
 * few extension writes on a vendor node, indistinguishable from vendor churn
 * to anything watching `class`; the Sensor needs the name to recognise its
 * own echo (Axiom 3.5).
 */
export const PREPAINT_DIRTY_CLASS = "sw-dirty"

const DIRTY_CLASS = PREPAINT_DIRTY_CLASS

// Matches --sw-bg-0 (SWATCHES.default.bg0) and prepaint.css's dirty-canvas
// colour — the veil's uncompensated dark fill.
const VEIL_BG = "#171c25"

function getVeil(): HTMLElement | null {
  return document.getElementById(PREPAINT_VEIL_ID)
}

/** True while the veil is up in either of its two halves (element, CSS backstop). */
export function isPrepaintActive(): boolean {
  return (
    document.documentElement.classList.contains(DIRTY_CLASS) ||
    getVeil() !== null
  )
}

/**
 * True while the veil is painted in the top layer.
 *
 * Premise: a top-layer element is painted outside every ancestor filter's
 * render surface, so no `filter: invert()` on `<html>` reaches it. That held
 * in the headless e2e harness but NOT in at least one real browser (the
 * legacy veil flashed white; see prepaint.css's header). It still gates the
 * vendor-filter compensation (#741), which has not been reported broken, but
 * if a similar flash is reported for a vendor's invert(1), doubt this premise
 * first, not the compensation math.
 *
 * Guarded: engines without popover support throw on the unknown selector,
 * and that throw is the answer — the veil never left the normal flow.
 */
function isVeilInTopLayer(veil: HTMLElement): boolean {
  try {
    return veil.matches(":popover-open")
  } catch {
    return false
  }
}

/**
 * Counter-inverts the veil's background so it still reads dark composited
 * through a *vendor's* still-active `filter: invert(...)` (#741).
 * prepaint.css's legacy rule cannot see a vendor filter. Inline `!important`
 * beats prepaint.css's `!important` class rule. With no vendor invert (the
 * usual case) any previous override is cleared, since enablePrepaint()
 * reuses an existing veil.
 *
 * Skipped in the top layer per `isVeilInTopLayer`'s (no longer fully
 * trusted) premise. `detectVendorInvert()` cannot tell whose filter it reads;
 * in legacy mode it is our own invert(1), which the top-layer skip also
 * keeps from being mistaken for a vendor's.
 */
function compensateVeilBackground(veil: HTMLElement): void {
  if (isVeilInTopLayer(veil)) {
    veil.style.removeProperty("background-color")
    return
  }

  const invertAmount = detectVendorInvert()
  if (invertAmount === 0) {
    veil.style.removeProperty("background-color")
    return
  }
  const base = parseColor(VEIL_BG)
  if (base === null) return
  veil.style.setProperty(
    "background-color",
    rgbaToCss(counterInvertColor(base, invertAmount)),
    "important"
  )
}

/**
 * Bumped on every `enablePrepaint()` call, idempotent re-affirmations
 * included. `commitVisualState()` captures it at schedule time and checks it
 * before its `disablePrepaint()`, so any caller that re-arms the veil
 * (`yt-navigate-start`, `reengage()`, the coverage watchdog's repair, all via
 * `enablePrepaint()`) invalidates a teardown a superseded caller scheduled.
 */
let commitToken = 0

/**
 * Create and show the overlay veil. Idempotent — a no-op if one already exists
 * (e.g. the one inserted by prepaint-start.js). Uses the top layer via the
 * popover API when available so vendor stacking contexts cannot paint over it,
 * falling back to the plain fixed/max-z element styled by prepaint.css.
 *
 * Anchors the veil to document.documentElement so vendor body mutations cannot
 * remove it. Also adds the sw-dirty class which activates the CSS backstop.
 */
export function enablePrepaint(): void {
  // Bumped before the idempotency guards: the race commitToken guards is a
  // call that finds the veil *already* up racing a pending teardown.
  commitToken += 1

  // `classList.add`/`remove` re-set the `class` attribute (queuing a
  // MutationRecord) even when the token set is unchanged. The Sensor watches
  // `class` on <html>, so an unguarded no-op would feed a self-sustaining
  // rescan loop (#831). Only write when the bit actually flips.
  if (!document.documentElement.classList.contains(DIRTY_CLASS)) {
    document.documentElement.classList.add(DIRTY_CLASS)
  }

  const existing = getVeil()
  if (existing) {
    // Re-entrant call (e.g. an SPA re-navigation, #741's second symptom):
    // re-check the vendor filter, which can have changed since creation.
    compensateVeilBackground(existing)
    return
  }

  const veil = document.createElement("div")
  veil.id = PREPAINT_VEIL_ID
  veil.setAttribute("data-my-ext", "")
  veil.setAttribute("popover", "manual")

  // Anchor to <html>: a vendor body replacement cannot remove a sibling of
  // <body>, and the CSS backstop covers documentElement.replaceChildren.
  document.documentElement.appendChild(veil)

  try {
    veil.showPopover()
  } catch {
    // Popover unsupported or element not eligible — the fixed/max-z fallback
    // styling in prepaint.css keeps the veil covering the viewport regardless.
  }

  // After showPopover(), never before: compensation is regime-dependent and
  // the regime is not settled until the promotion has been attempted.
  compensateVeilBackground(veil)
}

/**
 * Remove the overlay veil, returning the page to normal compositing. Safe to
 * call when no veil exists.
 *
 * Removes sw-dirty before the veil element so the self-healing MutationObserver
 * in prepaint-start.js sees the class gone and does not re-create the veil after
 * this intentional teardown.
 */
export function disablePrepaint(): void {
  // Remove dirty class first — the self-healing observer checks it to tell
  // intentional teardown from vendor removal. Guarded like enablePrepaint():
  // an already-down veil must produce zero DOM writes (#831).
  if (document.documentElement.classList.contains(DIRTY_CLASS)) {
    document.documentElement.classList.remove(DIRTY_CLASS)
  }

  const veil = getVeil()
  if (!veil) return
  try {
    veil.hidePopover()
  } catch {
    // not open / unsupported — removal below still tears it down
  }
  veil.remove()
}

/** The transition/animation freeze, shared with the enforcement handshake (`enforcement-dom.ts`). */
export const TRANSITION_FREEZE_CSS =
  "*, *::before, *::after { transition: none !important; animation: none !important; }"

/**
 * Run fn() with transitions frozen so getComputedStyle reads settled
 * destination colors rather than mid-transition values. The veil does not
 * restyle vendor elements, so the freeze is all that is needed. The freeze
 * style is [data-my-ext] so it is never themed or sampled.
 */
export function withPrepaintSuppressed<T>(fn: () => T): T {
  const freeze = document.createElement("style")
  freeze.setAttribute("data-my-ext", "")
  freeze.textContent = TRANSITION_FREEZE_CSS
  document.head.appendChild(freeze)

  // Force a synchronous style + layout flush so the freeze applies before
  // fn() reads computed styles.
  document.documentElement.getBoundingClientRect()

  try {
    return fn()
  } finally {
    freeze.remove()
  }
}

/** Exported for document-scope.ts's `awaitAtomicSwap()`, which mirrors this gate as a `Promise`. */
export const COMMIT_FALLBACK_MS = 100

/**
 * Transfer ownership from the veil to the final rendering state. The theme
 * stylesheet must already be in the cascade. Two rAFs ensure the theme has
 * painted once under the veil before it is removed (atomic swap).
 *
 * Timer fallback: rAF is paused in non-foreground tabs (background-loaded,
 * or occluded in headed automation), which would strand the page under the
 * veil forever; setTimeout still fires (throttled). Whichever fires first
 * wins; `dropped` makes the loser a no-op. On a visible tab the rAF pair
 * resolves in ~1 frame, preserving the atomic swap.
 */
export function commitVisualState(): void {
  // Used by theme-apply.ts's applyTheme(); auto mode goes through
  // document-scope.ts instead. Idempotent: once the veil is down there is
  // nothing to commit.
  if (!isPrepaintActive()) return

  // Captured at schedule time: a later re-arm makes this commit stale, and
  // it must not tear that re-arm down (see `commitToken`).
  const tokenAtSchedule = commitToken

  let dropped = false
  const drop = (): void => {
    if (dropped) return
    dropped = true
    if (commitToken !== tokenAtSchedule) return
    disablePrepaint()
  }
  requestAnimationFrame(() => {
    requestAnimationFrame(drop)
  })
  setTimeout(drop, COMMIT_FALLBACK_MS)
}
