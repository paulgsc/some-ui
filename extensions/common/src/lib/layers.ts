/**
 * Layer architecture contract — surgery-free revision.
 *
 * Previous model moved all body children into a wrapper div so that
 * CSS filters could be scoped to that wrapper. This caused:
 *   - Reflow / remount on injection
 *   - Scroll-root invalidation (broke Gemini and other virtual-scroll SPAs)
 *   - Overflow geometry corruption
 *
 * Current model:
 *   - Vendor DOM is left completely untouched.
 *   - Extension-owned nodes carry data-my-ext="" and are excluded by
 *     the patcher and CSS selectors via :not([data-my-ext]).
 *   - The overlay root is a simple fixed/pointer-events:none div
 *     appended to body — no child migration.
 *   - "Page layer" is just document.body (the patcher already walks body
 *     and gates on data-my-ext, so no wrapper is needed).
 *
 * Invariants:
 *   I1. Extension UI nodes always carry data-my-ext="".
 *   I2. The luminance patcher skips any node with data-my-ext or
 *       that is a descendant of such a node.
 *   I3. Dark-theme CSS rules carry :not([data-my-ext] *) guards.
 *   I4. Legacy filter targets <html> and is orthogonal to all of the above.
 */

export const OVERLAY_ROOT_ID = "__sw_overlay_root"

// Attribute that marks extension-owned subtrees.
// CSS rules and the JS patcher use this to exclude extension nodes.
export const EXT_ATTR = "data-my-ext"

/**
 * Returns the overlay root, creating it if absent.
 *
 * This is the mount point for extension UI injected into vendor pages.
 * Append your UI here, not into document.body directly.
 *
 * The element is:
 *   - position: fixed, zero-size, overflow: visible
 *   - pointer-events: none  (children opt in via pointer-events: auto)
 *   - z-index: max
 *   - marked with data-my-ext so patcher and CSS skip it
 *
 * Safe to call multiple times — idempotent.
 */
export function getOverlayRoot(): HTMLElement {
  const existing = document.getElementById(OVERLAY_ROOT_ID)
  if (existing instanceof HTMLElement) return existing

  const el = document.createElement("div")
  el.id = OVERLAY_ROOT_ID
  el.setAttribute(EXT_ATTR, "")
  el.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 0;
    height: 0;
    z-index: 2147483647;
    pointer-events: none;
    overflow: visible;
  `
  document.body.appendChild(el)
  return el
}

/**
 * Returns document.body as the "page layer" — the root the patcher walks.
 *
 * The patcher already gates on data-my-ext, so no wrapper div is needed.
 * This function exists so call sites remain stable if the model ever changes.
 */
export function getPageLayer(): HTMLElement {
  return document.body
}

/**
 * No-op. Kept for call-site compatibility during migration.
 * Previously performed DOM surgery; that surgery is now removed.
 */
export function ensureLayers(): {
  pageLayer: HTMLElement
  overlayRoot: HTMLElement
} {
  return { pageLayer: getPageLayer(), overlayRoot: getOverlayRoot() }
}

// Legacy export — some-filter/README documents this import path.
export { getOverlayRoot as default }
