const OVERLAY_ROOT_ID = "__sw_overlay_root"

export function getOverlayRoot(): HTMLElement {
  const existing = document.getElementById(OVERLAY_ROOT_ID)

  if (existing) {
    // If it's the valid type, return it immediately
    if (existing instanceof HTMLElement) {
      return existing
    }

    // If it's an Element but not an HTMLElement (rare, but possible in XML/SVG contexts),
    // we remove it. We cast to Element to access the .remove() method.
    ;(existing as Element).remove()
  }

  const root = document.createElement("div")
  root.id = OVERLAY_ROOT_ID

  // Hard guarantee: always attach to documentElement
  document.documentElement.appendChild(root)

  return root
}
