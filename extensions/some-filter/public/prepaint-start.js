// document_start
//
// Install the dark prepaint veil as an overlay ABOVE the page rather than
// restyling vendor elements: no white flash during load, and vendor computed
// styles stay intact for the detector.
//
// Resilience against vendor repaints
// ────────────────────────────────────
// The veil is anchored to <html>, not <body>, so a body.innerHTML
// replacement cannot remove it. prepaint.css's html.sw-dirty > body backstop
// keeps the canvas black if the element itself is removed; sw-dirty is
// removed only by disablePrepaint(). A MutationObserver on <html>'s direct
// children re-inserts a removed veil; disablePrepaint() removes sw-dirty
// first, so intentional teardown is not undone.
//
// Promoted to the top layer via the popover API when supported;
// prepaint.css provides the fixed/max-z fallback. [data-my-ext] makes the
// detector and patcher skip it.

;(function () {
  let ID = "__sw_prepaint_veil"
  let DIRTY = "sw-dirty"
  let docEl = document.documentElement

  function showVeil(veil) {
    try {
      if (typeof veil.showPopover === "function") veil.showPopover()
    } catch (e) {
      // Popover unsupported or element not eligible — the fixed/max-z
      // fallback keeps the veil covering the viewport.
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

  // Self-healing: re-insert a removed veil. Direct children of <html> only,
  // to avoid a subtree observer.
  let observer = new MutationObserver(() => {
    createVeil()
  })
  observer.observe(docEl, { childList: true })
})()
