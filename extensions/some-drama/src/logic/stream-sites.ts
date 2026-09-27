// ── Streaming sites ───────────────────────────────────────────────────────────
// Which sites the drama plays on is the user's call, not a built-in list: by
// default every tab is a display tab (it shows the card), and a site the user
// marks as a streaming site in the popup makes its tabs source tabs (no card;
// beats carry that tab's video time). Pure — no DOM or browser globals.

/** The site a URL belongs to: its hostname without "www."; "" for non-web pages. */
export function siteOf(url: string): string {
  try {
    const { protocol, hostname } = new URL(url)
    if (protocol !== "http:" && protocol !== "https:") return ""
    return hostname.toLowerCase().replace(/^www\./, "")
  } catch {
    return ""
  }
}

/** Whether `url` is on a marked site. Subdomains count: "viki.com" covers "m.viki.com". */
export function isStreamSite(
  url: string,
  sites: ReadonlyArray<string>
): boolean {
  const site = siteOf(url)
  if (!site) return false
  return sites.some((s) => site === s || site.endsWith(`.${s}`))
}

/** The list with `site` marked or unmarked — deduplicated and sorted. */
export function withStreamSite(
  sites: ReadonlyArray<string>,
  site: string,
  streaming: boolean
): Array<string> {
  const rest = sites.filter((s) => s !== site)
  return (streaming && site ? [...rest, site] : rest).sort()
}
