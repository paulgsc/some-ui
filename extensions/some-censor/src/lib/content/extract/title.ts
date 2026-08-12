/**
 * Extract video title text from a renderer element.
 * Returns null if no title node is found or text is empty.
 *
 * Ordered most-specific first. The `yt-*-view-model` entries are the Lit-era
 * lockups adopted in #973: their title is an anchor carrying a BEM-ish class
 * rather than the `#video-title` id the Polymer renderers use, so the id-based
 * selectors below never matched them and every such card advanced to the title
 * state showing nothing.
 */
export function extractTitle(el: HTMLElement): string | null {
  const SELS = [
    "#video-title",
    "a#video-title",
    "#video-title-link",
    "yt-formatted-string#video-title",
    // Lit lockups. Matched on a class *prefix* because YouTube appends
    // modifiers (`…__title--small`) and versions the host class.
    '[class*="lockup-metadata-view-model__title"]',
    '[class*="shortsLockupViewModelHostMetadataTitle"]',
    "h3 a",
  ] as const

  for (const s of SELS) {
    const node = el.querySelector(s)
    if (!node) continue

    const t = node.textContent.trim() || node.getAttribute("aria-label")
    if (t) return t
  }

  return null
}
