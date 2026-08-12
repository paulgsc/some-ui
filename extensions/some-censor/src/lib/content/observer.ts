import { notifyMutation } from "./debug"
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
 *
 * Signal (1) covers the Polymer renderers only: the Lit-era lockups added in
 * #973 never set data-video-id. A lockup is added as a shell and filled in
 * afterwards, so the mutation that makes it a *video* lockup is an insertion
 * deep inside a card the observer has already seen — and re-deriving the
 * enclosing card with `closest()` on every childList batch would mean walking
 * the tree for every mutation YouTube's player makes, which is most of them.
 * Instead the shell is adopted by signal (2) and parked in the manager's
 * unresolved queue, where the retry loop re-checks it under a bounded budget.
 * That reuses machinery that already exists and costs nothing per mutation.
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

    // …and reconsider the ones we already gave up on. A Lit lockup hydrates
    // from the inside out, so the mutation that turns a shell into a real video
    // card is an insertion deep within it — invisible to both signals above.
    // This is the only thing that can revive such a card, and without it the
    // static occluder would leave it blurred forever (see recheckRejected).
    mgr.recheckRejected()

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

  // NOTE: yt-navigate-finish handling moved to Controller (C2).  Chip/SPA
  // navigation reuses renderer elements in place, so prune() (which only evicts
  // disconnected elements) could not clear stale view state from a reused card.
  // The controller now does a full teardown + restart on navigation, which
  // bumps the session and forces every card back to masked.  The observer is
  // disconnected during that teardown, so it must NOT hold a nav listener of
  // its own — that would be a second, conflicting source of truth.
  return obs
}
