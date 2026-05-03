/**
 * Layer architecture contract.
 *
 * Two sibling layers live inside <body>:
 *
 *   <body>
 *     <div id="__sw_page_layer">   ← vendor DOM, filter target
 *       [original body children moved here]
 *     </div>
 *     <div id="__sw_overlay_root" data-my-ext>  ← extension UI mount point
 *     </div>
 *   </body>
 *
 * Invariant: __sw_page_layer contains vendor DOM.
 * Invariant: __sw_overlay_root is never a descendant of __sw_page_layer.
 * Invariant: any filter applied to __sw_page_layer does NOT affect __sw_overlay_root.
 */

export const PAGE_LAYER_ID = "__sw_page_layer"
export const OVERLAY_ROOT_ID = "__sw_overlay_root"

// Attribute that marks extension-owned subtrees.
// Used by the dark-theme CSS to exclude these nodes from overrides.
export const EXT_ATTR = "data-my-ext"

/**
 * Performs one-time body surgery to create the two-layer DOM split.
 *
 * Safe to call multiple times — idempotent after first call.
 * Must be called before any filter or theme logic runs.
 *
 * Returns { pageLayer, overlayRoot }.
 */
export function ensureLayers(): {
  pageLayer: HTMLElement
  overlayRoot: HTMLElement
} {
  const existingPage = document.getElementById(PAGE_LAYER_ID)
  const existingOverlay = document.getElementById(OVERLAY_ROOT_ID)

  if (
    existingPage instanceof HTMLElement &&
    existingOverlay instanceof HTMLElement
  ) {
    return { pageLayer: existingPage, overlayRoot: existingOverlay }
  }

  // Create page layer and move all current body children into it.
  // We do this before creating overlayRoot so overlayRoot is never
  // accidentally captured into pageLayer.
  const pageLayer =
    existingPage instanceof HTMLElement ? existingPage : createPageLayer()

  if (!existingPage) {
    // Collect children snapshot first (live HTMLCollection mutates during move)
    const children = Array.from(document.body.childNodes)
    for (const child of children) {
      pageLayer.appendChild(child)
    }
    document.body.appendChild(pageLayer)
  }

  // Create overlay root as body sibling to pageLayer (never inside it)
  const overlayRoot =
    existingOverlay instanceof HTMLElement
      ? existingOverlay
      : createOverlayRoot()

  if (!existingOverlay) {
    document.body.appendChild(overlayRoot)
  }

  return { pageLayer, overlayRoot }
}

function createPageLayer(): HTMLElement {
  const el = document.createElement("div")
  el.id = PAGE_LAYER_ID
  // No position needed here — filter on this element creates its own
  // stacking context, which is what we want.
  el.style.cssText = `
    position: relative;
    min-height: 100%;
  `
  return el
}

function createOverlayRoot(): HTMLElement {
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
  return el
}

/**
 * Returns the overlay root, creating the full layer split if needed.
 *
 * This is the public API for other extensions to use as their mount point.
 * Extensions should append their UI into this element, not into document.body.
 *
 * Usage:
 *   const root = getOverlayRoot()
 *   const card = document.createElement("div")
 *   card.style.pointerEvents = "auto"  // re-enable for interactive UI
 *   root.appendChild(card)
 */
export function getOverlayRoot(): HTMLElement {
  const { overlayRoot } = ensureLayers()
  return overlayRoot
}

/**
 * Returns the page layer. Exposed for the filter/theme engine to target.
 * Extensions should not need this directly.
 */
export function getPageLayer(): HTMLElement {
  const { pageLayer } = ensureLayers()
  return pageLayer
}
