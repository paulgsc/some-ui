import type { VideoId } from "@censor/types/ids"

import { SEL } from "./observer"
import type { VideoManager } from "./video-manager"

/**
 * Event delegation layer.
 *
 * One listener per event type on document (capture phase).
 * We walk up from e.target to find .boyo-veil, then to the renderer element
 * which carries data-boyo-vid (cached at mount time by VideoRecord) for O(1)
 * VideoManager lookup — no re-extraction of IDs during event handling.
 *
 * Hover state is CSS-only (:hover on .boyo-veil) — no JS listener needed.
 */
export function attachEvents(mgr: VideoManager): void {
  document.addEventListener(
    "click",
    (e) => {
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
      const vid = veilVideoId(e.target as Element)
      if (!vid) return
      e.preventDefault()
      e.stopImmediatePropagation()
      mgr.handleClick(vid)
    },
    { capture: true }
  )

  document.addEventListener(
    "dblclick",
    (e) => {
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
      const vid = veilVideoId(e.target as Element)
      if (!vid) return
      e.preventDefault()
      e.stopImmediatePropagation()
      mgr.handleDblClick(vid)
    },
    { capture: true }
  )

  document.addEventListener(
    "contextmenu",
    (e) => {
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
      const vid = veilVideoId(e.target as Element)
      if (!vid) return
      e.preventDefault()
      if (
        confirm(
          "Add this channel to whitelist?\n(Always show content from this channel)"
        )
      ) {
        void mgr.whitelistChannel(vid)
      }
    },
    { capture: true }
  )
}

/**
 * Walk up from an event target to the nearest .boyo-veil, then to the
 * renderer element, and return the cached VideoId (data-boyo-vid).
 */
function veilVideoId(target: Element): VideoId | null {
  const veil = target.closest(".boyo-veil")
  if (!veil) return null
  const renderer = veil.closest(SEL)
  // Check if it exists AND is an HTMLElement
  if (!(renderer instanceof HTMLElement)) return null
  const vid = renderer.dataset["boyoVid"]
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  return vid ? (vid as VideoId) : null
}
