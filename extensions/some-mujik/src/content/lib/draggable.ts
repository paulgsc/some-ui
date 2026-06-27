// ─── Draggable ────────────────────────────────────────────────────────────────
// Attaches pointer-based drag to any element.
// Position is persisted to localStorage if a storageKey is provided.

export type DraggableOptions = {
  storageKey?: string
  /** Default position if no stored value */
  defaultX?: number
  defaultY?: number
}

export type DraggableHandle = {
  destroy(): void
}

export function makeDraggable(
  el: HTMLElement,
  opts: DraggableOptions = {}
): DraggableHandle {
  const { storageKey, defaultX, defaultY } = opts

  // ── Restore position ────────────────────────────────────────────────────────
  let posX = defaultX ?? 16
  let posY = defaultY ?? 16

  if (storageKey) {
    try {
      // eslint-disable-next-line extension-charter/no-raw-storage
      const stored = localStorage.getItem(storageKey)
      if (stored) {
        const { x, y } = JSON.parse(stored)
        posX = x
        posY = y
      }
    } catch {
      /* ignore */
    }
  }

  applyPos()

  // ── Drag state ──────────────────────────────────────────────────────────────
  let dragging = false
  let startX = 0
  let startY = 0
  let startElX = 0
  let startElY = 0

  function applyPos(): void {
    // Clamp to viewport
    const maxX = window.innerWidth - el.offsetWidth - 8
    const maxY = window.innerHeight - el.offsetHeight - 8
    posX = Math.max(8, Math.min(posX, maxX))
    posY = Math.max(8, Math.min(posY, maxY))
    el.style.left = `${posX}px`
    el.style.top = `${posY}px`
  }

  function onPointerDown(e: PointerEvent): void {
    // Only drag on the card itself (not child interactive elements)
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    if ((e.target as HTMLElement).closest("button, a, input")) return
    dragging = true
    startX = e.clientX
    startY = e.clientY
    startElX = posX
    startElY = posY
    el.setPointerCapture(e.pointerId)
    el.style.transition = "none"
    el.style.cursor = "grabbing"
    e.preventDefault()
  }

  function onPointerMove(e: PointerEvent): void {
    if (!dragging) return
    posX = startElX + (e.clientX - startX)
    posY = startElY + (e.clientY - startY)
    applyPos()
  }

  function onPointerUp(e: PointerEvent): void {
    if (!dragging) return
    dragging = false
    el.releasePointerCapture(e.pointerId)
    el.style.cursor = "grab"

    if (storageKey) {
      try {
        // eslint-disable-next-line extension-charter/no-raw-storage
        localStorage.setItem(storageKey, JSON.stringify({ x: posX, y: posY }))
      } catch {
        /* ignore */
      }
    }
  }

  function onResize(): void {
    applyPos()
  }

  el.addEventListener("pointerdown", onPointerDown)
  el.addEventListener("pointermove", onPointerMove)
  el.addEventListener("pointerup", onPointerUp)
  el.addEventListener("pointercancel", onPointerUp)
  window.addEventListener("resize", onResize)

  el.style.cursor = "grab"

  return {
    destroy(): void {
      el.removeEventListener("pointerdown", onPointerDown)
      el.removeEventListener("pointermove", onPointerMove)
      el.removeEventListener("pointerup", onPointerUp)
      el.removeEventListener("pointercancel", onPointerUp)
      window.removeEventListener("resize", onResize)
    },
  }
}
