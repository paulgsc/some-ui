import { notifyMutation, notifyNavigation } from "./debug"
import { SEL } from "./selectors"
import type { VideoManager } from "./video-manager"

export { SEL } from "./selectors"

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
    let needsPrune = false

    for (const m of mutations) {
      // 1. Hydration Signal
      if (
        m.type === "attributes" &&
        m.attributeName === "data-video-id" &&
        m.target instanceof HTMLElement &&
        m.target.matches(SEL)
      ) {
        candidates.add(m.target)
        continue
      }

      // 2. DOM Addition/Removal Signal
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

        // Just flag that a removal happened; don't prune in the loop!
        if (m.removedNodes.length > 0) {
          needsPrune = true
        }
      }
    }

    // Process new/updated elements
    candidates.forEach((el) => mgr.upsert(el))

    // Retry previously unresolved elements
    mgr.retryUnresolved()

    // Evict disconnected entries on any removal
    if (needsPrune) {
      mgr.prune()
    }

    // Notify debug layer of mutation activity
    notifyMutation()
  })

  obs.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["data-video-id"],
  })

  // yt-navigate-finish fires after every SPA navigation YouTube completes —
  // banner clicks, category chips, sidebar links, back/forward.
  //
  // We do NOT use it as a teardown/restart trigger. The observer stays alive.
  // Instead we use it for two things:
  //
  //   1. prune() immediately — evict any entries whose elements were removed
  //      during the navigation DOM teardown that the childList observer may
  //      have batched away (YouTube sometimes does bulk innerHTML replacement
  //      which produces a single removedNodes entry, not per-element removals).
  //
  //   2. scan() after a short delay — catch already-hydrated cards that didn't
  //      fire a data-video-id attribute mutation because their attribute was
  //      already set before our observer saw them (e.g. YouTube recycled cards
  //      across navigations with the new data-video-id pre-set).
  //
  // Per-card identity changes (data-video-id mutation on a tracked element) are
  // handled by the attribute watch + upsert() rawPreviousId check — no session
  // bump needed. This listener is purely a deferred cleanup + rescan.
  window.addEventListener("yt-navigate-finish", () => {
    mgr.prune()
    notifyNavigation()
    setTimeout(() => mgr.scan(), 400)
  })

  return obs
}
