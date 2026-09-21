import { parseVideoHref } from "@censor/lib/content/core/parse"
import type { VideoId } from "@censor/types/ids"
import { asVideoId } from "@censor/types/ids"

const ANCHOR_SELECTOR =
  'a#video-title, a#thumbnail, a.yt-simple-endpoint, a[href*="/watch"], a[href*="/shorts/"], a'

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
    const id = parseVideoHref(a.href || a.getAttribute("href") || "")
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
  // `data-video-id` is the renderer's own statement of which artifact it is,
  // and YouTube sets it only after hydrating the subtree — which is why
  // extractVideoId reads it first and why observer.ts watches it as its
  // hydration signal. So when it is present it is decisive in BOTH
  // directions: a descendant anchor may not make the element represent
  // something its own id contradicts.
  //
  // Bot-found (#1427 review, round 1, P1). Returning `true` here on a stale
  // descendant link while the authoritative id had already moved to another
  // video would classify a genuine recycle as churn and keep the old entry —
  // `revealed` included — so the newly displayed video would stay disclosed.
  // That is a QD1 leak, and it is the failure mode this predicate must never
  // have: being wrong in the withholding direction costs a re-mask, being
  // wrong in this direction costs the whole point of the extension.
  const authoritative = el.getAttribute("data-video-id")
  if (authoritative) return authoritative === videoId

  // No authoritative id — the Lit-era lockups never set one (see observer.ts).
  // Anchor membership is the only evidence available for those, and it is
  // exactly the case the churn/recycle split was added for.
  for (const a of el.querySelectorAll<HTMLAnchorElement>(ANCHOR_SELECTOR)) {
    if (parseVideoHref(a.href || a.getAttribute("href") || "") === videoId) {
      return true
    }
  }

  return false
}
