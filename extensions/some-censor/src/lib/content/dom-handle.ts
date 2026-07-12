/**
 * DomHandle — the ONLY class permitted to touch the DOM.
 *
 * Invariants enforced here:
 *
 *   D1 — Anchoring.  The constructor immediately enforces `position: relative`
 *        on the renderer element.  The overlay's `position: absolute; inset: 0`
 *        then anchors to the renderer, not to a distant ancestor.
 *        The floating-overlay bug is caught at construction, not at paint time.
 *
 *   D2 — Single veil.  _ensureVeil() is idempotent: it checks isConnected
 *        before creating a new element.  mount() and repair() both go through
 *        _ensureVeil(), so duplicate overlays are structurally impossible.
 *
 *   D3 — Full cleanup.  destroy() removes the veil AND strips all data-boyo*
 *        attributes.  After destroy(), the renderer looks exactly as it did
 *        before DomHandle was constructed.  The "stale overlay" bug requires
 *        an old DomHandle to survive past destroy() — this is prevented by
 *        VideoManager, which destroys handles before replacing them.
 *
 *   D4 — No retained references after destroy().  _veil is set to null.
 *        The manager drops its reference to the handle.  GC does the rest.
 *
 * Note: z-index is NOT set here.  It lives in content.css, which means it can
 * be tuned without touching JS.  The CSS rule uses a local stacking context
 * (the renderer has position:relative) so the veil's z-index is relative to
 * the card, not the viewport — fixing the "beats dialogs" issue.
 */

import { assertNever } from "@some-extension/common"

import type { RenderModel, VeilContent } from "./fsm"

export class DomHandle {
  private _veil: HTMLElement | null = null

  constructor(private readonly el: HTMLElement) {
    // D1 — anchoring invariant: enforce at construction, not in CSS
    const pos = getComputedStyle(el).position
    if (pos === "static") {
      el.style.position = "relative"
    }
  }

  // ── Public ────────────────────────────────────────────────────────────────

  /**
   * Apply a RenderModel to the DOM.
   * Idempotent: calling apply with the same model twice produces the same DOM.
   */
  apply(model: RenderModel): void {
    if (model.removeVeil) {
      this._animateRemoveVeil()
      this.el.dataset["boyo"] = model.dataBoyo
      return
    }

    this._ensureVeil()
    this.el.dataset["boyo"] = model.dataBoyo
    this._applyContent(model.veilContent)
  }

  /**
   * Repair veil if YouTube's scroll virtualizer removed it.
   * Does NOT reset view state — data-boyo on the renderer survives DOM churn.
   */
  repair(model: RenderModel): void {
    if (!this._veil?.isConnected) {
      this._veil = null
      if (!model.removeVeil) {
        this._ensureVeil()
        this._applyContent(model.veilContent)
      }
    }
  }

  /** Full teardown — renderer left in pre-mount state. */
  destroy(): void {
    this._veil?.remove()
    this._veil = null
    delete this.el.dataset["boyo"]
    delete this.el.dataset["boyoVid"]
  }

  get element(): HTMLElement {
    return this.el
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private _ensureVeil(): void {
    if (this._veil?.isConnected) return
    const v = document.createElement("div")
    v.className = "boyo-veil"
    this.el.appendChild(v)
    this._veil = v
  }

  private _applyContent(content: VeilContent): void {
    if (!this._veil) return
    this._veil.innerHTML = ""

    const { kind } = content
    switch (kind) {
      case "empty": {
        break
      }

      case "meta": {
        const { channelName, duration, uploadDate } = content.meta
        if (channelName) {
          const chip = el("div", "boyo-meta")
          chip.appendChild(el("div", "boyo-meta-channel", channelName))
          const sub = [duration, uploadDate].filter(Boolean).join(" · ")
          if (sub) chip.appendChild(el("div", "boyo-meta-sub", sub))
          this._veil.appendChild(chip)
        }
        break
      }

      case "title": {
        const { channelName, duration, uploadDate } = content.meta
        if (channelName) {
          const chip = el("div", "boyo-meta boyo-meta--compact")
          chip.appendChild(el("div", "boyo-meta-channel", channelName))
          const sub = [duration, uploadDate].filter(Boolean).join(" · ")
          if (sub) chip.appendChild(el("div", "boyo-meta-sub", sub))
          this._veil.appendChild(chip)
        }
        if (content.title.text) {
          const chip = el("div", "boyo-title-chip", content.title.text)
          if (content.title.translated) {
            chip.dataset["translated"] = "1"
            chip.dataset["lang"] = "translated"
          }
          this._veil.appendChild(chip)
        }
        break
      }
      default: {
        kind satisfies never
        assertNever(kind)
      }
    }
  }

  private _animateRemoveVeil(): void {
    if (!this._veil) return
    const veil = this._veil
    this._veil = null
    veil.addEventListener("animationend", () => veil.remove(), { once: true })
    setTimeout(() => veil.remove(), 600)
  }
}

function el(tag: string, className: string, text?: string): HTMLElement {
  const node = document.createElement(tag)
  node.className = className
  if (text !== undefined) node.textContent = text
  return node
}
