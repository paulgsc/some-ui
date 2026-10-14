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
// Bounded (canon Definition D.6, ADR 0002 §8.7)
// ───────────────────────────────────────────────
// This veil lasts at most VEIL_MAX_HOLD_MS of visible time, timed here and
// not by content.js, so the bound holds when content.js throws, hangs or
// never runs. At the bound, if the veil is still one this script put up, it
// comes down, the observer stops, and __swPrepaintExpired tells content.js
// (same isolated world) to record it. A veil content.js raised later has its
// own clock in prepaint.ts and is left alone.
//
// A tab cached as "off" (content.ts's sessionStorage key) gets no veil.
//
// Promoted to the top layer via the popover API when supported;
// prepaint.css provides the fixed/max-z fallback. [data-my-ext] makes the
// detector and patcher skip it.

;(function () {
  // Must equal prepaint.ts's VEIL_MAX_HOLD_MS (prepaint-start.test.ts pins it).
  let VEIL_MAX_HOLD_MS = 2500
  let ID = "__sw_prepaint_veil"
  let DIRTY = "sw-dirty"
  let STATE_CACHE_KEY = "__sw_tab_state"
  let docEl = document.documentElement

  function cachedOff() {
    try {
      return sessionStorage.getItem(STATE_CACHE_KEY) === "off"
    } catch (e) {
      // Storage unavailable (sandboxed frame, blocked site data): veil as usual.
      return false
    }
  }

  if (cachedOff()) return

  /** Every veil element this script created, so the deadline touches only those. */
  let ours = new WeakSet()

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
    ours.add(veil)
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

  function expire() {
    let veil = document.getElementById(ID)
    // Already resolved, or re-raised by content.js under its own clock.
    if (veil === null || !ours.has(veil)) return
    observer.disconnect()
    docEl.classList.remove(DIRTY)
    try {
      veil.hidePopover()
    } catch (e) {
      // not open / unsupported — removal below still tears it down
    }
    veil.remove()
    globalThis.__swPrepaintExpired = true
    let hook = globalThis.__swOnPrepaintExpired
    if (typeof hook === "function") {
      try {
        hook()
      } catch (e) {
        // Recording is best-effort; the veil is already down.
      }
    }
  }

  // Visible time: a background-loaded tab starts its clock when first shown.
  function startClock() {
    setTimeout(expire, VEIL_MAX_HOLD_MS)
  }
  if (document.visibilityState !== "hidden") {
    startClock()
  } else {
    let onVisible = function () {
      if (document.visibilityState === "hidden") return
      document.removeEventListener("visibilitychange", onVisible)
      startClock()
    }
    document.addEventListener("visibilitychange", onVisible)
  }
})()
