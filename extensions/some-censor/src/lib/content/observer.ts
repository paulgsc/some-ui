import { notifyMutation } from "./debug"
import { observability } from "./observability"
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
 *      (e.g. initial page load, SPA navigation completing) — and, since
 *      #1504's own review, two things about the *shape* of an insertion:
 *
 *        - every catalogue element *inside* an added node, whether or not
 *          the added node is itself one. An infinite-scroll cell arrives
 *          atomically with its lockup already in it (#1426's nesting), and
 *          the cell is a container the manager will not adopt — so the card
 *          inside is the card, and it has to be handed over too;
 *        - the catalogue element whose *subtree* changed, found with one
 *          `closest()` from the mutation record's own target. A cell the
 *          virtualizer hands from a video to an ad slot, or wraps around a
 *          lockup, never re-enters `upsert()` on its own: its children were
 *          replaced, not it. Re-upserting it is what lets the manager see it
 *          is not a card any more and retire the entry it still owns.
 *
 *      The second is deliberately one `closest()` per *childList record*,
 *      not per mutation of any kind. This observer subscribes to no
 *      characterData and to exactly one attribute, so the player's own
 *      churn (style, aria, progress) never reaches it; what does is a node
 *      being added or removed, and for those the walk is bounded by the
 *      depth of one card.
 *
 * On every mutation batch we also call mgr.retryUnresolved() — this is what
 * makes the unresolved registry event-driven rather than time-bounded.
 * Any DOM activity is a signal that YouTube may have finished hydrating
 * a previously unresolved element.
 *
 * Signal (1) covers the Polymer renderers only: the Lit-era lockups added in
 * #973 never set data-video-id. A lockup is added as a shell and filled in
 * afterwards, so the mutation that makes it a *video* lockup is an insertion
 * deep inside a card the observer has already seen; that insertion's record
 * targets a node inside the lockup, and `closest()` from it re-upserts the
 * lockup — the same bounded walk as above. The manager's unresolved queue and
 * `recheckRejected()` still cover the cases a batch happens to miss.
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
          if (node.matches(SEL)) candidates.add(node)
          // Always look inside as well: the added node may be a container
          // whose card is the element nested in it (see the header).
          node
            .querySelectorAll<HTMLElement>(SEL)
            .forEach((el) => candidates.add(el))
        }

        // The card whose subtree this record changed, if it is inside one.
        const enclosing =
          m.target instanceof Element ? m.target.closest(SEL) : null
        if (enclosing instanceof HTMLElement) candidates.add(enclosing)

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
    observability()?.mutationBatch(candidates.size)
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
