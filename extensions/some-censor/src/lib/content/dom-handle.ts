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
 *   D5 — No class names here.  Every class string comes from veil-styles.ts,
 *        which is the only file UnoCSS scans; a literal written here would not
 *        be generated and so would silently do nothing.  This module decides
 *        *what* nodes exist, never what they look like.
 *
 *   D6 — Nested custody (#1426).  `el` is always the *outermost* element of a
 *        card (VideoManager never constructs a DomHandle for a nested match —
 *        see `outermostCard()`), but YouTube sometimes nests a second element
 *        matching `SEL` inside it (a `yt-lockup-view-model` inside a
 *        `ytd-rich-item-renderer`). That inner element has its own PREMASK_
 *        SELECTORS rule and is occluded independently of the outer one, so
 *        lifting the occluder on `el` alone leaves the inner match blurred
 *        and inert. apply()/repair() re-derive `el`'s nested matches from the
 *        live DOM and stamp `data-boyo` on all of them — no veil of their
 *        own, since the outer veil already covers the whole tile.
 *
 * Note: z-index is a utility on the veil (`z-2`), not a rule here, and the
 * renderer's local stacking context comes from styles/content.css — so the
 * veil's z-index is relative to the card, not the viewport, and cannot beat a
 * YouTube dialog.
 */

import { assertNever } from "@some-extension/common"

import type { RenderModel, VeilContent } from "./fsm"
import { SEL } from "./selectors"
import {
  hintClass,
  META,
  META_CHANNEL,
  META_SUB,
  railClass,
  TITLE,
  TITLE_LANG,
  VEIL,
} from "./veil-styles"

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
    this._stampCustody(model.dataBoyo)

    if (model.removeVeil) {
      this._animateRemoveVeil()
      this.el.dataset["boyo"] = model.dataBoyo
      return
    }

    this._ensureVeil()
    this.el.dataset["boyo"] = model.dataBoyo
    this._render(model)
  }

  /**
   * Repair veil if YouTube's scroll virtualizer removed it.
   * Does NOT reset view state — the view is projected from the entry's own FSM.
   *
   * `data-boyo` is re-asserted rather than assumed: it is the only thing
   * suppressing the static occluder in `styles/content.css`, and that occluder
   * takes no pointer events, so an element that loses the attribute to vendor
   * churn goes inert rather than merely unstyled (#1421). Writing it here is
   * idempotent — this is a repair path, and the value comes from the same
   * projection `apply()` would have used.
   */
  repair(model: RenderModel): void {
    this._stampCustody(model.dataBoyo)
    this.el.dataset["boyo"] = model.dataBoyo

    if (!this._veil?.isConnected) {
      this._veil = null
      if (!model.removeVeil) {
        this._ensureVeil()
        this._render(model)
      }
    }
  }

  /** Full teardown — renderer left in pre-mount state. */
  destroy(): void {
    this._veil?.remove()
    this._veil = null
    delete this.el.dataset["boyo"]
    delete this.el.dataset["boyoVid"]
    for (const nested of this.el.querySelectorAll<HTMLElement>(SEL)) {
      delete nested.dataset["boyo"]
    }
  }

  get element(): HTMLElement {
    return this.el
  }

  // ── Private ───────────────────────────────────────────────────────────────

  /**
   * Stamp `data-boyo` on every element nested inside `el` that also matches
   * `SEL` (D6/#1426). Re-derived from the live DOM on every apply()/repair()
   * rather than cached, so a lockup that hydrates after `el` was already
   * mounted is picked up by the next repair pass instead of needing its own
   * adoption. Bounded by `el`'s own subtree and a no-op query when there is
   * nothing nested, which is the common case — no cost for a single-element
   * card.
   */
  private _stampCustody(dataBoyo: string): void {
    for (const nested of this.el.querySelectorAll<HTMLElement>(SEL)) {
      nested.dataset["boyo"] = dataBoyo
    }
  }

  private _ensureVeil(): void {
    if (this._veil?.isConnected) return
    const v = document.createElement("div")
    v.className = VEIL.occluding
    this.el.appendChild(v)
    this._veil = v
  }

  /**
   * Project the model onto the veil's subtree.
   *
   * The whole subtree is rebuilt on every apply. That is cheap (at most four
   * nodes) and it is what makes apply() idempotent by construction: there is no
   * partial-update path that could leave a chip from a previous state behind.
   *
   * Child order is the reading order — hint, then meta, then title — so the
   * flex column lays them out without anyone needing absolute positioning. The
   * previous design pinned the hint and the compact meta chip at fixed `top`
   * offsets, which is precisely what could not survive a short card (#973).
   */
  private _render(model: RenderModel): void {
    const veil = this._veil
    if (!veil) return

    veil.className = VEIL[model.veilTone]
    veil.replaceChildren()

    const { hint } = model
    if (hint) {
      veil.appendChild(el("div", hintClass(hint.tone), hint.label))
    }

    this._appendContent(veil, model.veilContent)

    veil.appendChild(el("div", railClass(model.rail)))
  }

  private _appendContent(veil: HTMLElement, content: VeilContent): void {
    const { kind } = content
    switch (kind) {
      case "empty": {
        break
      }

      case "meta": {
        appendMetaChip(veil, content.meta, META.roomy)
        break
      }

      case "title": {
        appendMetaChip(veil, content.meta, META.compact)
        appendTitleChip(veil, content.title)
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
    veil.className = VEIL.revealed
    veil.addEventListener("animationend", () => veil.remove(), { once: true })
    setTimeout(() => veil.remove(), 600)
  }
}

// ── Chip builders ────────────────────────────────────────────────────────────

/**
 * The channel chip, with the duration · date sub-line beneath it.
 *
 * The sub-line is always built; `META_SUB` hides it below a 220px card rather
 * than this code deciding. Keeping the decision in CSS means it responds to the
 * card's real width — including a card that is resized after mount — without
 * this module measuring anything or holding a ResizeObserver per card.
 */
function appendMetaChip(
  veil: HTMLElement,
  meta: {
    channelName: string | null
    duration: string | null
    uploadDate: string | null
  },
  chipClass: string
): void {
  const { channelName, duration, uploadDate } = meta
  if (!channelName) return

  const chip = el("div", chipClass)
  chip.appendChild(el("div", META_CHANNEL, channelName))

  const sub = [duration, uploadDate].filter(Boolean).join(" · ")
  if (sub) chip.appendChild(el("div", META_SUB, sub))

  veil.appendChild(chip)
}

function appendTitleChip(
  veil: HTMLElement,
  title: { text: string; translated: boolean }
): void {
  if (!title.text) return

  const { translated } = title
  const chip = el(
    "div",
    translated ? TITLE.translated : TITLE.plain,
    title.text
  )
  if (translated) {
    chip.dataset["translated"] = "1"
    chip.appendChild(el("span", TITLE_LANG, "translated"))
  }
  veil.appendChild(chip)
}

function el(tag: string, className: string, text?: string): HTMLElement {
  const node = document.createElement(tag)
  node.className = className
  if (text !== undefined) node.textContent = text
  return node
}
