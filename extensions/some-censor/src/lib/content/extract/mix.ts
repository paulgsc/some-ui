/**
 * Which YouTube Mix a link or the page plays in. A Mix is the playlist
 * YouTube generates from a video ("radio"), and its id starts `RD`; a
 * playlist someone made does not. Music mix shows a music Mix's rows that
 * carry no date (`fsm.ts`'s `decide`), so only a Mix is named here.
 */

const PANEL_ROW = "ytd-playlist-panel-video-renderer"

/** The Mix `href` plays in, from its `list=`, or null. */
export function mixOf(href: string): string | null {
  const start = href.indexOf("?")
  if (start < 0) return null
  const end = href.indexOf("#", start)
  const query = href.slice(start + 1, end < 0 ? undefined : end)
  const list = new URLSearchParams(query).get("list")
  return list?.startsWith("RD") === true ? list : null
}

/**
 * The Mix a playlist row belongs to, as its own link names it. Null for
 * every other card: a Mix's card on a feed or in the sidebar proves no
 * date and stays held (QD3).
 */
export function extractMix(el: HTMLElement): string | null {
  if (el.tagName.toLowerCase() !== PANEL_ROW) return null
  for (const a of el.querySelectorAll<HTMLAnchorElement>('a[href*="list="]')) {
    const mix = mixOf(a.getAttribute("href") ?? "")
    if (mix !== null) return mix
  }
  return null
}
