export const PREPAINT_ATTR = "data-sw-prepaint"

// Matches the sentinel declared in prepaint.css :root block.
const PREPAINT_SENTINEL_PROP = "--sw-prepaint-sheet"

/**
 * Locate the manifest-injected prepaint stylesheet by its sentinel custom
 * property so callers can toggle sheet.disabled without touching the DOM.
 */
function findPrepaintSheet(): CSSStyleSheet | null {
  for (const sheet of document.styleSheets) {
    try {
      for (const rule of sheet.cssRules) {
        if (
          rule instanceof CSSStyleRule &&
          rule.style.getPropertyValue(PREPAINT_SENTINEL_PROP).trim() !== ""
        ) {
          return sheet
        }
      }
    } catch {
      // Cross-origin sheets throw on cssRules access — skip them.
    }
  }
  return null
}

/**
 * Suppress the prepaint stylesheet for the duration of fn(), then restore it.
 *
 * All steps run synchronously in one JS task — the user never sees the page
 * un-veiled. The getComputedStyle call after disabling the sheet forces the
 * browser to flush the cascade so fn() observes native (non-prepaint) styles.
 *
 * If the sheet cannot be located (e.g. not yet loaded), fn() runs unguarded
 * and the caller should default to applying the dark theme (safe direction).
 */
export function withPrepaintSuppressed<T>(fn: () => T): T {
  const sheet = findPrepaintSheet()
  if (sheet) {
    sheet.disabled = true
    // Force a synchronous style + layout flush so fn() observes the
    // cascade without the prepaint rules. getBoundingClientRect() is a
    // recognised side-effectful call that is guaranteed to cause the flush.
    document.documentElement.getBoundingClientRect()
  }
  try {
    return fn()
  } finally {
    if (sheet) sheet.disabled = false
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
