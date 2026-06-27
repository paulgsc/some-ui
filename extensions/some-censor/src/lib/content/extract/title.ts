/**
 * Extract video title text from a renderer element.
 * Returns null if no title node is found or text is empty.
 */
export function extractTitle(el: HTMLElement): string | null {
  const SELS = [
    "#video-title",
    "a#video-title",
    "#video-title-link",
    "yt-formatted-string#video-title",
    "h3 a",
  ] as const

  for (const s of SELS) {
    const node = el.querySelector(s)
    if (!node) continue
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    const t = node.textContent?.trim() || node.getAttribute("aria-label")
    if (t) return t
  }

  return null
}
