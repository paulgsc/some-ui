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

export const PREPAINT_VEIL_ID = "__sw_prepaint_veil"
const DIRTY_CLASS = "sw-dirty"

function getVeil(): HTMLElement | null {
  return document.getElementById(PREPAINT_VEIL_ID)
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
  document.documentElement.classList.add(DIRTY_CLASS)

  if (getVeil()) return

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
  document.documentElement.classList.remove(DIRTY_CLASS)

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
