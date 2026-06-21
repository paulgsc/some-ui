export const PREPAINT_ATTR = "data-sw-prepaint"

/**
 * Suppress the prepaint veil for the duration of fn(), permanently.
 *
 * History: this previously worked by locating the manifest-injected
 * prepaint.css CSSStyleSheet object (via a window.__swPrepaintSheet
 * reference captured by prepaint-start.js at document_start) and setting
 * sheet.disabled = true. That mechanism is gone.
 *
 * Root cause (triage, classify-on-refresh): a diagnostic probe polling
 * document.styleSheets.length across a 60-frame / ~1s window on both
 * file:// and http:// fixtures showed it never leaves 0 — Chrome MV3's
 * content-script CSS injection for this manifest entry does not produce a
 * CSSOM-enumerable CSSStyleSheet object at all, on this browser/config,
 * ever. It is not a timing race; retrying longer does not help. A parallel
 * probe confirmed the CSS rules themselves DO apply to the page — a cascade
 * sentinel custom property (--sw-prepaint-sheet, defined in prepaint.css)
 * went from empty to "1" within a single animation frame — so the styling
 * is real and fast, it simply isn't exposed as an object script can grab.
 *
 * This is why the keybind-toggle path always worked while cold refresh
 * never did: toggle classification never depended on locating a sheet
 * object in the first place. It only mattered for refresh, because that's
 * the only path that ever tried the now-deleted sheet-lookup strategy.
 *
 * Fix: suppression no longer needs a sheet object. prepaint.css's rules are
 * entirely gated on the html[data-sw-prepaint] attribute selector. Removing
 * that attribute is equivalent — for every rule that matters — to disabling
 * the sheet. The attribute is plain DOM state, always present, never
 * subject to CSSOM enumeration timing.
 *
 * Suppression sequence:
 *
 * 1. A transition-freeze style (`transition/animation: none !important`) is
 *    injected so getComputedStyle reads destination colors, not mid-transition
 *    interpolated values.
 *
 * 2. PREPAINT_ATTR is removed from <html>, and a layout flush is forced via
 *    getBoundingClientRect so the cascade reflects native site styles rather
 *    than the prepaint-poisoned #0d1117 substrate before fn() samples.
 *
 * 3. The attribute is NOT re-added after fn() returns. Once the dark theme
 *    is in the DOM the prepaint canvas is superseded; re-adding it would
 *    open a window where patchObserver catches new SPA nodes under active
 *    prepaint `transparent !important` rules, reads near-zero luminance,
 *    tags them `preserve`, and permanently exposes white backgrounds after
 *    veil drop. Teardown is handled entirely by disablePrepaint() /
 *    commitVisualState() — same invariant the sheet-based version relied on,
 *    now expressed as "don't put the attribute back" instead of "don't
 *    re-enable the sheet".
 *
 * fn() always runs, regardless of whether the attribute was present to
 * begin with — there is no failure mode here equivalent to "sheet not
 * found", because there is no sheet to find. Removing an absent attribute
 * is a no-op; getBoundingClientRect() still forces a flush either way.
 */
export function withPrepaintSuppressed<T>(fn: () => T): T {
  // Freeze transitions so getComputedStyle reads settled destination colors.
  const freeze = document.createElement("style")
  freeze.textContent =
    "*, *::before, *::after { transition: none !important; animation: none !important; }"
  document.head.appendChild(freeze)

  document.documentElement.removeAttribute(PREPAINT_ATTR)
  // Force a synchronous style + layout flush so fn() sees the cascade
  // without prepaint overrides. getBoundingClientRect() is a recognised
  // side-effectful call guaranteed to trigger the flush.
  document.documentElement.getBoundingClientRect()

  try {
    return fn()
  } finally {
    // Remove the transition freeze. The prepaint attribute stays removed
    // permanently — see point 3 in the doc comment above.
    freeze.remove()
  }
}

export function enablePrepaint(): void {
  document.documentElement.setAttribute(PREPAINT_ATTR, "")
}

export function disablePrepaint(): void {
  document.documentElement.removeAttribute(PREPAINT_ATTR)
}

/*
  Transfer ownership from provisional shell to final rendering state.
  The theme stylesheet must already be injected before calling this so that
  when the veil's invert filter is lifted, dark CSS rules are already in the
  cascade and there is no intermediate white-substrate frame.
*/
export function commitVisualState(): void {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      disablePrepaint()
    })
  })
}
