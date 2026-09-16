import { SEL } from "./observer"
import type { VideoManager } from "./video-manager"

/**
 * Event delegation layer.
 *
 * One listener per event type on document (capture phase).
 * We walk up from e.target to find .boyo-veil, then to the renderer element —
 * always the card's anchor, since a veil only ever mounts there (D6/#1426) —
 * for O(1) VideoManager lookup, dispatched by the element itself rather than
 * by its cached videoId: two distinct cards can legitimately show the same
 * video, and a videoId-keyed dispatch could not tell which one was actually
 * clicked (M7/#1426). No re-extraction of IDs during event handling either
 * way.
 *
 * Hover state is CSS-only (:hover on .boyo-veil) — no JS listener needed.
 */
export function attachEvents(mgr: VideoManager): void {
  document.addEventListener(
    "click",
    (e) => {
      const renderer = veilRenderer(e.target)
      if (!renderer) return
      e.preventDefault()
      e.stopImmediatePropagation()
      mgr.handleClick(renderer)
    },
    { capture: true }
  )

  document.addEventListener(
    "dblclick",
    (e) => {
      const renderer = veilRenderer(e.target)
      if (!renderer) return
      e.preventDefault()
      e.stopImmediatePropagation()
      mgr.handleDblClick(renderer)
    },
    { capture: true }
  )

  document.addEventListener(
    "contextmenu",
    (e) => {
      const renderer = veilRenderer(e.target)
      if (!renderer) return
      e.preventDefault()
      // boyoVid is only stamped once a card is mounted — a cheap proxy for
      // "does this renderer have a live entry" without asking VideoManager.
      if (!renderer.dataset.boyoVid) return
      if (
        confirm(
          "Add this channel to whitelist?\n(Always show content from this channel)"
        )
      ) {
        void mgr.whitelistChannel(renderer)
      }
    },
    { capture: true }
  )
}

/**
 * Walk up from an event target to the nearest .boyo-veil, then to the
 * renderer element it belongs to.
 */
function veilRenderer(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) {
    return null
  }

  const veil = target.closest(".boyo-veil")
  if (!veil) return null

  const renderer = veil.closest(SEL)
  return renderer instanceof HTMLElement ? renderer : null
}
