/**
 * Prepaint veil — an anti-flash dark layer painted OVER the page.
 *
 * Unlike the previous implementation (which restyled the page's own elements
 * with `background-color/filter !important`, poisoning getComputedStyle), the
 * veil is now a single overlay element promoted to the top layer. Because it is
 * not an ancestor of vendor nodes, their computed styles stay intact and the
 * detector can read TRUE vendor colors while the veil is still up. There is no
 * longer any need to remove the veil before sampling.
 *
 * Trade-off: an opaque cover can only show a flat dark fill, not the previous
 * `invert(1) hue-rotate` preview — inversion requires restyling real elements.
 * Readable truth + continuous dark is worth more than an inverted preview during
 * the sub-second pre-theme window.
 *
 * The element is created at document_start by prepaint-start.js; its styles live
 * in prepaint.css (gated on the element id), so it paints the instant it is
 * inserted. It carries [data-my-ext] so the detector and patcher both skip it.
 *
 * Rerender resilience
 * ───────────────────
 * The veil is anchored to document.documentElement (<html>), not document.body.
 * This means body.innerHTML replacements cannot remove the veil. A secondary CSS
 * backstop in prepaint.css (html.sw-dirty > body { background: #000 }) ensures
 * the body canvas stays black even if the veil element itself is removed.
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
 * very few *extension* writes that lands on a *vendor* node, which makes it
 * indistinguishable from vendor churn to anything watching `class` — the
 * Sensor (`adapter/pipeline.ts`) needs the name to recognise its own echo
 * (Axiom 3.5).
 */
export const PREPAINT_DIRTY_CLASS = "sw-dirty"

const DIRTY_CLASS = PREPAINT_DIRTY_CLASS

// Matches --sw-bg-0 (SWATCHES.default.bg0) / prepaint.css's own dirty-canvas
// color — the veil's default, uncompensated dark fill.
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
 * The theory this is built on — a top-layer element is painted outside
 * every ancestor filter's render surface, so no `filter: invert()` on
 * `<html>` reaches it — held up under direct pixel measurement in this
 * project's own headless/swiftshader e2e harness, and did NOT hold up
 * against real usage: prepaint.css used to give the legacy veil's
 * `:popover-open` rule a dark value on this exact reasoning, and it
 * produced a real white flash on refresh/remount that went away once that
 * rule went back to declaring white unconditionally (prepaint.css's own
 * header comment has the full account). That means at least one real,
 * non-headless browser DOES still let an ancestor filter on `<html>` reach
 * a Popover-API top-layer element — the opposite of what this function
 * assumes.
 *
 * It's kept here, still gating the compensation below, because the *vendor*
 * filter case (#741) it protects hasn't been reported broken the way the
 * legacy-veil case was, and unwinding it without that same kind of evidence
 * would be trading a demonstrated fix for a guess. But the premise is now
 * known-unreliable rather than settled, and if a similar flash is ever
 * reported for #741's scenario (a *vendor's* invert(1) still active while
 * the veil is up), this function's own assumption is the first place to
 * doubt — not the compensation math below it.
 *
 * `:popover-open` is the signal because it matches exactly while the element
 * is in the top layer, on the theory above. Guarded: engines without
 * popover support throw on the unknown selector, and that throw *is* the
 * answer — no popover support means the veil never left the normal flow,
 * which is the filtered regime regardless.
 */
function isVeilInTopLayer(veil: HTMLElement): boolean {
  try {
    return veil.matches(":popover-open")
  } catch {
    return false
  }
}

/**
 * Counter-inverts the veil's background so it still reads dark once
 * composited through a *vendor's own*, still-active `filter:
 * invert(...)` (#741) — prepaint.css declares a fixed white for its own
 * legacy filter instead (`html[data-sw-legacy]`, unconditionally now — see
 * that file's header comment), but that CSS-only rule has no way to see a
 * filter the vendor, not this extension, applied. `!important` inline
 * (highest-specificity, author-origin) beats prepaint.css's own
 * `!important` class rule. A no-op (`invertAmount = 0`, the overwhelming
 * majority case) clears any previous override instead — enablePrepaint()
 * reuses an existing veil across repeated calls, and an override from a
 * filter that is no longer active must not linger.
 *
 * Compensation is skipped in the top layer on `isVeilInTopLayer`'s theory
 * that no ancestor filter reaches it there — see that function's own
 * comment for why this premise is no longer trusted without reservation.
 * Left as-is here because unwinding it needs the same kind of real-browser
 * evidence the legacy-veil case got, which this path doesn't have yet.
 * `detectVendorInvert()` reads the computed `filter` on `<html>` and cannot
 * tell whose it is — in legacy mode that filter is this extension's own
 * invert(1), not a vendor's, which the top-layer skip also happens to guard
 * against confusing for one.
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
 * Create and show the overlay veil. Idempotent — a no-op if one already exists
 * (e.g. the one inserted by prepaint-start.js). Uses the top layer via the
 * popover API when available so vendor stacking contexts cannot paint over it,
 * falling back to the plain fixed/max-z element styled by prepaint.css.
 *
 * Anchors the veil to document.documentElement so vendor body mutations cannot
 * remove it. Also adds the sw-dirty class which activates the CSS backstop.
 */
export function enablePrepaint(): void {
  // `classList.add`/`remove` run the DOM's "update steps" unconditionally —
  // they re-serialize and re-set the `class` attribute even when the token
  // set is unchanged, and a same-value `setAttribute` still queues a
  // MutationRecord. The Sensor watches `class` on every node including
  // <html>, so an unguarded no-op call here is not free: it is a mutation
  // the pipeline sees, reacts to, and (via commitVisualState -> this
  // module) causes again — a self-sustaining rescan loop with no vendor
  // change anywhere in it (#831). Only write when the bit actually flips.
  if (!document.documentElement.classList.contains(DIRTY_CLASS)) {
    document.documentElement.classList.add(DIRTY_CLASS)
  }

  const existing = getVeil()
  if (existing) {
    // Re-entrant call (e.g. an SPA re-navigation re-arming an already-live
    // veil, #741's second symptom): re-check the vendor filter every time,
    // not just at creation — it can still be active, or have changed, since
    // the veil was first created.
    compensateVeilBackground(existing)
    return
  }

  const veil = document.createElement("div")
  veil.id = PREPAINT_VEIL_ID
  veil.setAttribute("data-my-ext", "")
  veil.setAttribute("popover", "manual")

  // Anchor to <html>, not <body>. Body replacements by vendor SPAs cannot
  // remove a sibling of <body>; only a full documentElement.replaceChildren
  // could do so, and the CSS backstop covers that extreme case.
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
  // Remove dirty class first — this is what the self-healing observer checks
  // to distinguish intentional teardown from an accidental vendor removal.
  // Guarded for the same reason as enablePrepaint()'s add: an already-down
  // veil must produce *zero* DOM writes, or every fire re-notifies the
  // Sensor of a change that never happened (#831).
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

/**
 * Run fn() with transitions frozen so getComputedStyle reads settled
 * destination colors rather than mid-transition interpolated values.
 *
 * The overlay veil does NOT restyle vendor elements, so — unlike the old
 * attribute-based suppression — there is nothing to remove for fn() to see true
 * colors. This now only installs a transition/animation freeze for the duration
 * of fn(). The freeze style is marked [data-my-ext] so it never gets themed or
 * sampled, and getBoundingClientRect() forces a synchronous flush so the freeze
 * is in effect before fn() samples.
 */
export function withPrepaintSuppressed<T>(fn: () => T): T {
  const freeze = document.createElement("style")
  freeze.setAttribute("data-my-ext", "")
  freeze.textContent =
    "*, *::before, *::after { transition: none !important; animation: none !important; }"
  document.head.appendChild(freeze)

  // Force a synchronous style + layout flush so the freeze is applied before
  // fn() reads computed styles. getBoundingClientRect() is a recognised
  // side-effectful call guaranteed to trigger the flush.
  document.documentElement.getBoundingClientRect()

  try {
    return fn()
  } finally {
    freeze.remove()
  }
}

/*
  Transfer ownership from the provisional veil to the final rendering state.
  The theme stylesheet must already be injected before calling this so that when
  the veil is lifted, the dark CSS is already in the cascade and there is no
  intermediate native-substrate frame. Two rAFs ensure the theme has painted at
  least once under the veil before it is removed (atomic swap).

  Timer fallback: requestAnimationFrame is paused entirely in tabs the browser
  considers non-foreground (a page loaded in a background tab, or — in headed
  automation — a page that is occluded by another). Relying on rAF alone leaves
  the veil up indefinitely in exactly those cases, stranding the page under a
  dark cover forever. setTimeout continues to fire (throttled) in occluded tabs,
  so it guarantees teardown. Whichever fires first wins; `dropped` makes the
  loser a no-op so the veil is never torn down twice. On a visible tab the rAF
  pair resolves in ~1 frame, well before the timer, preserving the atomic swap.
*/
const COMMIT_FALLBACK_MS = 100

export function commitVisualState(): void {
  // Called on *every* pipeline fire (content.ts's onFire), not just the
  // first. Once the veil is down there is nothing left to commit, and
  // scheduling another rAF pair + fallback timer per fire only creates work
  // whose sole effect would be a redundant disablePrepaint().
  if (!isPrepaintActive()) return

  let dropped = false
  const drop = (): void => {
    if (dropped) return
    dropped = true
    disablePrepaint()
  }
  requestAnimationFrame(() => {
    requestAnimationFrame(drop)
  })
  setTimeout(drop, COMMIT_FALLBACK_MS)
}
