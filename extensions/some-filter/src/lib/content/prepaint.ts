export const PREPAINT_ATTR = "data-sw-prepaint"

/**
 * Locate the manifest-injected prepaint stylesheet by URL.
 *
 * Extension-injected stylesheets are cross-origin from the page's perspective
 * (moz-extension:// or chrome-extension:// vs https://). Accessing cssRules
 * on a cross-origin sheet throws SecurityError, which would cause a sentinel-
 * property scan to silently skip the prepaint sheet and return null — leaving
 * the sheet active during classification and poisoning the luminance samples.
 *
 * sheet.href is always readable without cross-origin restrictions, so matching
 * by the extension's own URL for prepaint.css is both simpler and reliable.
 */
function findPrepaintSheet(): CSSStyleSheet | null {
  const prepaintHref = browser.runtime.getURL("prepaint.css")
  for (const sheet of document.styleSheets) {
    if (sheet.href === prepaintHref) return sheet
  }
  return null
}

/**
 * Suppress the prepaint stylesheet for the duration of fn(), permanently.
 *
 * Three defences run synchronously in one JS task before fn() samples:
 *
 * 1. A transition-freeze style (`transition/animation: none !important`) is
 *    injected so getComputedStyle reads destination colors, not mid-transition
 *    interpolated values (transition trap — phantom near-zero alpha reads).
 *
 * 2. The prepaint sheet is disabled (located by its extension URL) and a
 *    layout flush is forced via getBoundingClientRect so the cascade reflects
 *    native site styles rather than prepaint-poisoned #0d1117 backgrounds.
 *
 * 3. The sheet is NOT re-enabled after fn() returns. Once the dark theme is
 *    in the DOM the prepaint canvas is superseded; re-enabling would open a
 *    window where patchObserver catches new SPA nodes under active prepaint
 *    `transparent !important` rules, reads near-zero luminance, tags them
 *    `preserve`, and permanently exposes white backgrounds after veil drop.
 *    Teardown is handled entirely by disablePrepaint() / commitVisualState().
 *
 * If the sheet cannot be located fn() runs unguarded; the caller should
 * default to applying the dark theme (safe direction — recoverable by cycle).
 */
export function withPrepaintSuppressed<T>(fn: () => T): T {
  // Freeze transitions so getComputedStyle reads settled destination colors.
  const freeze = document.createElement("style")
  freeze.textContent =
    "*, *::before, *::after { transition: none !important; animation: none !important; }"
  document.head.appendChild(freeze)

  const sheet = findPrepaintSheet()
  if (sheet) {
    sheet.disabled = true
    // Force a synchronous style + layout flush so fn() sees the cascade
    // without prepaint overrides. getBoundingClientRect() is a recognised
    // side-effectful call guaranteed to trigger the flush.
    document.documentElement.getBoundingClientRect()
  }

  try {
    return fn()
  } finally {
    // Remove the transition freeze. The sheet stays disabled permanently —
    // see point 3 in the doc comment above.
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
