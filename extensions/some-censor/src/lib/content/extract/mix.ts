import { parseMixHref } from "@censor/lib/content/core/parse"

const PANEL_ROW = "ytd-playlist-panel-video-renderer"

/**
 * The Mix a playlist row belongs to, as its own link names it. Null for
 * every other card: a Mix's card on a feed or in the sidebar proves no
 * date and stays held (QD3).
 */
export function extractMix(el: HTMLElement): string | null {
  if (el.tagName.toLowerCase() !== PANEL_ROW) return null
  for (const a of el.querySelectorAll<HTMLAnchorElement>('a[href*="list="]')) {
    const mix = parseMixHref(a.getAttribute("href") ?? "")
    if (mix !== null) return mix
  }
  return null
}
