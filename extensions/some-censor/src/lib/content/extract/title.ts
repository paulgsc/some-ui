import { FIELD_SELECTORS } from "@censor/lib/content/layout/fields"

/**
 * Extract video title text from a renderer element.
 * Returns null if no title node is found or text is empty.
 *
 * The selector list lives in `layout/fields.ts` (ordered most-specific first)
 * so the layout crawler fingerprints the same selectors this reads. The
 * `yt-*-view-model` entries there are the Lit-era lockups adopted in #973:
 * their title is an anchor carrying a BEM-ish class rather than the
 * `#video-title` id the Polymer renderers use, so the id-based selectors never
 * matched them and every such card advanced to the title state showing nothing.
 */
export function extractTitle(el: HTMLElement): string | null {
  for (const s of FIELD_SELECTORS.title) {
    const node = el.querySelector(s)
    if (!node) continue

    const t = node.textContent.trim() || node.getAttribute("aria-label")
    if (t) return t
  }

  return null
}
