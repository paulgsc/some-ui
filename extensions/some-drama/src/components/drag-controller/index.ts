// ── DragController ────────────────────────────────────────────────────────────
// Owns: all pointer-event drag logic for a target element.
// No DOM building — attaches to existing elements.
// Reports position via onDragEnd; exposes didDrag for click-vs-drag detection.
//
// Lifetimes (Charter §8), all derived from the owner's:
//   - `pointerdown` on the handle — this controller's lifetime.
//   - `pointermove` / `pointerup` / `pointercancel` on the document — one drag
//     gesture's: added on pointerdown, gone on release. (They used to be
//     added at construction and never removed, and the card is rebuilt on
//     every state change, so they piled up for the life of the tab.)
//   - the didDrag reset timer — this controller's.

import { clamp } from "@drama/logic/content/utils"
import { Disposables } from "@some-extension/common"

export class DragController {
  private dragging = false
  private _didDrag = false
  private offX = 0
  private offY = 0

  private readonly life: Disposables
  private gesture: Disposables | null = null

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
    private readonly dragIgnoreSelectors: Array<string> = [],
    /** The owner's lifetime; everything here ends with it (or with destroy()). */
    owner?: Disposables
  ) {
    this.life = owner ? owner.child() : new Disposables()
    handle.addEventListener("pointerdown", (e) => this.onPointerDown(e), {
      signal: this.life.signal,
    })
  }

  /** True if the most recent mousedown resulted in an actual drag.
   *  Resets ~80ms after pointerup so click handlers can check it. */
  get didDrag(): boolean {
    return this._didDrag
  }

  /** Release every listener and timer this controller holds. */
  destroy(): void {
    this.life.dispose()
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

    this.gesture?.dispose()
    const gesture = this.life.child()
    this.gesture = gesture
    const { signal } = gesture
    document.addEventListener("pointermove", (ev) => this.onPointerMove(ev), {
      signal,
    })
    document.addEventListener("pointerup", () => this.onPointerUp(), { signal })
    document.addEventListener("pointercancel", () => this.onPointerUp(), {
      signal,
    })
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
    this.gesture?.dispose()
    this.gesture = null
    if (!this.dragging) return
    this.dragging = false
    this.target.classList.remove("dc-dragging")

    const rect = this.target.getBoundingClientRect()
    this.onDragEnd?.(rect.left, rect.top)

    // Give click handlers time to read didDrag before resetting
    this.life.timeout(() => {
      this._didDrag = false
    }, 80)
  }
}
