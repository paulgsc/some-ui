// document_start
//
// Install the dark prepaint veil as an overlay that sits ABOVE the page rather
// than restyling vendor elements. This eliminates the white-flash during load
// while leaving vendor computed styles intact, so the content script's detector
// can read true vendor colors with the veil still up (no veil-drop required).
//
// The veil is promoted to the top layer via the popover API when supported so
// vendor stacking contexts cannot paint over it; prepaint.css provides the
// fixed/max-z fallback. The element carries [data-my-ext] so the content
// script's detector and luminance patcher both skip it.

;(function () {
  const ID = "__sw_prepaint_veil"
  if (document.getElementById(ID)) return

  const veil = document.createElement("div")
  veil.id = ID
  veil.setAttribute("data-my-ext", "")
  veil.setAttribute("popover", "manual")

  const root = document.body || document.documentElement
  root.appendChild(veil)

  try {
    if (typeof veil.showPopover === "function") veil.showPopover()
  } catch (e) {
    // Popover unsupported or element not eligible — the fixed/max-z fallback
    // styling keeps the veil covering the viewport regardless.
  }
})()
