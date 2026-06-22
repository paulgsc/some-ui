// document_start
//
// Install the dark prepaint veil as an overlay that sits ABOVE the page rather
// than restyling vendor elements. This eliminates the white-flash during load
// while leaving vendor computed styles intact, so the content script's detector
// can read true vendor colors with the veil still up (no veil-drop required).
//
// Resilience against vendor repaints
// ────────────────────────────────────
// The veil is anchored to document.documentElement (the <html> element), not
// document.body. This means even a full body.innerHTML replacement cannot
// remove it — the veil survives as a sibling of <body>.
//
// A secondary CSS backstop in prepaint.css targets html.sw-dirty > body, so
// the body canvas stays black even in the rare event the veil element itself
// is removed by vendor code. The sw-dirty class is added here and removed only
// by disablePrepaint() after the content script has committed a visual state,
// which ensures no white flash can bleed through during rerender storms.
//
// A lightweight MutationObserver watches documentElement's direct children and
// re-inserts the veil if vendor code removes it before content.ts takes over.
// Once content.ts calls disablePrepaint() it removes sw-dirty first, which
// prevents the observer from re-creating the veil after intentional teardown.
//
// The veil is promoted to the top layer via the popover API when supported so
// vendor stacking contexts cannot paint over it; prepaint.css provides the
// fixed/max-z fallback. The element carries [data-my-ext] so the content
// script's detector and luminance patcher both skip it.

;(function () {
  let ID = "__sw_prepaint_veil"
  let DIRTY = "sw-dirty"
  let docEl = document.documentElement

  function showVeil(veil) {
    try {
      if (typeof veil.showPopover === "function") veil.showPopover()
    } catch (e) {
      // Popover unsupported or element not eligible — the fixed/max-z fallback
      // styling keeps the veil covering the viewport regardless.
    }
  }

  function createVeil() {
    if (document.getElementById(ID)) return
    // Re-check: if sw-dirty was already removed by disablePrepaint, do not
    // resurrect the veil — content.ts already committed a visual state.
    if (!docEl.classList.contains(DIRTY)) return

    let veil = document.createElement("div")
    veil.id = ID
    veil.setAttribute("data-my-ext", "")
    veil.setAttribute("popover", "manual")
    // Anchor to <html>, not <body>, so body.innerHTML wipes cannot remove it.
    docEl.appendChild(veil)
    showVeil(veil)
  }

  // Mark page as dirty-by-default. prepaint.css turns this into a CSS backstop
  // on body so there is ALWAYS a dark canvas even if the veil element is gone.
  docEl.classList.add(DIRTY)

  createVeil()

  // Self-healing: if vendor code removes the veil before content.ts takes over,
  // re-insert it immediately. We only watch direct children of <html> to avoid
  // the overhead of a subtree observer on a potentially large document.
  let observer = new MutationObserver(() => {
    createVeil()
  })
  observer.observe(docEl, { childList: true })
})()
