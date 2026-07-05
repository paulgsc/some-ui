// ── DragController ────────────────────────────────────────────────────────────
// Owns: all pointer-event drag logic for a target element.
// No DOM building — attaches to existing elements.
// Reports position via onDragEnd; exposes didDrag for click-vs-drag detection.

import { clamp } from "@drama/logic/content/utils"

export class DragController {
  private dragging = false
  private _didDrag = false
  private offX = 0
  private offY = 0

  /** Fired continuously during drag with clamped viewport coordinates */
  onMove?: (x: number, y: number) => void
  /** Fired on pointer-up with final position */
  onDragEnd?: (x: number, y: number) => void

  constructor(
    /** Element that listens for pointerdown to start drag */
    handle: HTMLElement,
    /** Element that is repositioned (used for dimension clamping) */
    private readonly target: HTMLElement,
    /** Elements whose pointerdown should NOT start a drag */
    private readonly dragIgnoreSelectors: Array<string> = []
  ) {
    handle.addEventListener("pointerdown", (e) => this.onPointerDown(e))
    document.addEventListener("pointermove", (e) => this.onPointerMove(e))
    document.addEventListener("pointerup", () => this.onPointerUp())
  }

  /** True if the most recent mousedown resulted in an actual drag.
   *  Resets ~80ms after pointerup so click handlers can check it. */
  get didDrag(): boolean {
    return this._didDrag
  }

  // ── Handlers ────────────────────────────────────────────────────────────────

  private onPointerDown(e: PointerEvent): void {
    if (!(e.target instanceof HTMLElement)) return
    const target = e.target
    const shouldIgnore = this.dragIgnoreSelectors.some((sel) =>
      target.closest(sel)
    )
    if (shouldIgnore) return

    this.dragging = true
    this._didDrag = false
    const rect = this.target.getBoundingClientRect()
    this.offX = e.clientX - rect.left
    this.offY = e.clientY - rect.top
    this.target.classList.add("dc-dragging")
    target.setPointerCapture(e.pointerId)
  }

  private onPointerMove(e: PointerEvent): void {
    if (!this.dragging) return
    this._didDrag = true

    const cx = clamp(
      e.clientX - this.offX,
      0,
      window.innerWidth - this.target.offsetWidth
    )
    const cy = clamp(
      e.clientY - this.offY,
      0,
      window.innerHeight - this.target.offsetHeight
    )

    this.onMove?.(cx, cy)
  }

  private onPointerUp(): void {
    if (!this.dragging) return
    this.dragging = false
    this.target.classList.remove("dc-dragging")

    const rect = this.target.getBoundingClientRect()
    this.onDragEnd?.(rect.left, rect.top)

    // Give click handlers time to read didDrag before resetting
    setTimeout(() => {
      this._didDrag = false
    }, 80)
  }
}
