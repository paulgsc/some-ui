import { asVideoId } from "@censor/types/ids"
import type { VideoId } from "@censor/types/ids"

const ANCHOR_SELECTOR =
  'a#video-title, a#thumbnail, a.yt-simple-endpoint, a[href*="/watch"], a[href*="/shorts/"], a'

/**
 * The videoId one href encodes, if any.
 *
 * Shared by {@link extractVideoId} and {@link representsVideo} so the two
 * cannot disagree about what an href means — a disagreement there would make
 * `representsVideo` answer about a different id space than the one that was
 * mounted, which is precisely the confusion it exists to resolve.
 */
function videoIdFromHref(href: string): VideoId | null {
  // Destructuring with nullish coalescing for safe extraction
  const [, watch] = href.match(/[?&]v=([^&/#]+)/) ?? []
  if (watch) return asVideoId(watch)

  const [, shorts] = href.match(/\/shorts\/([^/?#&]+)/) ?? []
  if (shorts) return asVideoId(shorts)

  const [, path] = href.match(/\/watch\/([^/?#&]+)/) ?? []
  if (path) return asVideoId(path)

  return null
}

/**
 * Extract YouTube video ID from a renderer element.
 * Pure function — no side effects, no globals.
 *
 * Strategy (priority order):
 *  1. data-video-id attribute  (set after hydration — fast path)
 *  2. anchor href scan         (/watch?v=, /shorts/, /watch/)
 *
 * Note that step 2 returns the first match in **document order**, not in the
 * order the selector list is written: `querySelectorAll` does not rank by
 * selector. So which anchor answers is a property of the vendor's current
 * subtree, and it can change without the card changing — see
 * {@link representsVideo}.
 */
export function extractVideoId(el: HTMLElement): VideoId | null {
  const attr = el.getAttribute("data-video-id")
  if (attr) return asVideoId(attr)

  for (const a of el.querySelectorAll<HTMLAnchorElement>(ANCHOR_SELECTOR)) {
    const id = videoIdFromHref(a.href || a.getAttribute("href") || "")
    if (id) return id
  }

  return null
}

/**
 * Does `el` still advertise `videoId` anywhere in its subtree?
 *
 * The question {@link extractVideoId} cannot answer. Extraction reports *an*
 * identity — the first one in document order — which is enough to mount a card
 * and useless for deciding whether a card the manager already mounted is still
 * the same card.
 *
 * `VideoManager` needs that second question because its only recycle signal is
 * "the extracted id differs from the one stamped on the element", and two very
 * different things produce it:
 *
 *   - the scroll virtualizer handed this DOM node to a **different** feed item,
 *     where re-masking is mandatory (the node now shows another video); and
 *   - the **same** feed item's subtree churned under us — a hover preview
 *     injecting its own anchors, lazy hydration, a metadata row swapped by an
 *     experiment — where re-masking silently revokes the user's own disclosure
 *     and, worse, drops the card back under the static occluder's
 *     `pointer-events: none` (#1423).
 *
 * Membership separates them with evidence rather than a guess: if the artifact
 * that was mounted is still reachable from this element, the element has not
 * been handed to a different one. Conservative in the direction that matters —
 * it only ever *withholds* a teardown when the old artifact is demonstrably
 * still present, so a genuine recycle (old id gone) is unaffected.
 */
export function representsVideo(el: HTMLElement, videoId: VideoId): boolean {
  if (el.getAttribute("data-video-id") === videoId) return true

  for (const a of el.querySelectorAll<HTMLAnchorElement>(ANCHOR_SELECTOR)) {
    if (videoIdFromHref(a.href || a.getAttribute("href") || "") === videoId) {
      return true
    }
  }

  return false
}
