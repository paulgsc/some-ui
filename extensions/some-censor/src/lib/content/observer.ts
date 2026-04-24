import type { VideoManager } from "./video-manager"

const VIDEO_SELECTORS = [
  "ytd-video-renderer",
  "ytd-rich-item-renderer",
  "ytd-grid-video-renderer",
  "ytd-compact-video-renderer",
  "ytd-playlist-panel-video-renderer",
]
export const SEL = VIDEO_SELECTORS.join(",")

/**
 * DOM observer.
 *
 * Two signals we watch:
 *
 *   1. attributeFilter: ["data-video-id"]
 *      YouTube sets this attribute AFTER full hydration of the renderer's
 *      subtree (anchors, channel name, etc.). This is the most reliable
 *      "element is ready" signal and fixes the main timing bug of previous
 *      versions that tried to extract IDs at addedNodes time.
 *
 *   2. childList + subtree
 *      Catches newly inserted renderer elements that are already hydrated
 *      (e.g. initial page load, SPA navigation completing).
 *
 * On every mutation batch we also call mgr.retryUnresolved() — this is what
 * makes the unresolved registry event-driven rather than time-bounded.
 * Any DOM activity is a signal that YouTube may have finished hydrating
 * a previously unresolved element.
 */
export function startObserver(mgr: VideoManager): MutationObserver {
  const obs = new MutationObserver((mutations) => {
    const candidates = new Set<HTMLElement>()

    for (const m of mutations) {
      // Signal 1: data-video-id attribute set → element is hydrated
      if (
        m.type === "attributes" &&
        m.attributeName === "data-video-id" &&
        m.target instanceof HTMLElement &&
        m.target.matches(SEL)
      ) {
        candidates.add(m.target)
        continue
      }

      // Signal 2: new nodes added to DOM
      if (m.type === "childList") {
        for (const node of m.addedNodes) {
          if (!(node instanceof HTMLElement)) continue
          if (node.matches(SEL)) {
            candidates.add(node)
          } else {
            node
              .querySelectorAll<HTMLElement>(SEL)
              .forEach((el) => candidates.add(el))
          }
        }
      }
    }

    candidates.forEach((el) => mgr.upsert(el))

    // Every mutation is an opportunity to retry previously unresolved elements
    mgr.retryUnresolved()
  })

  obs.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["data-video-id"],
  })

  return obs
}
