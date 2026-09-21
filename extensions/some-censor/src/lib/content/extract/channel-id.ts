import { parseChannelHref } from "@censor/lib/content/core/parse"
import type { ChannelId } from "@censor/types/ids"
import { asChannelId } from "@censor/types/ids"

/**
 * Extract YouTube channel identifier from a renderer element.
 * Normalises all formats to either:
 *   - UCxxx...  (channel ID)
 *   - @handle   (handle)
 *
 * Falls back to display name text if no href pattern matches.
 */
export function extractChannelId(el: HTMLElement): ChannelId | null {
  for (const a of el.querySelectorAll<HTMLAnchorElement>("a")) {
    const href = a.href || a.getAttribute("href") || ""
    if (!href) continue

    const parsed = parseChannelHref(href)
    if (parsed !== null) return parsed
  }

  // Fallback: visible channel name text (less stable but better than null).
  // The second selector is the Lit-era lockup's metadata row (#973); a lockup
  // usually does carry an /@handle anchor, but a shorts lockup carries none at
  // all, so without this every shorts card stayed channel-less forever.
  const node = el.querySelector(
    "ytd-channel-name yt-formatted-string, #channel-name yt-formatted-string, " +
      'a[class*="yt-content-metadata-view-model__metadata-text"]'
  )

  if (!node) return null

  const name = node.textContent.trim()
  return name ? asChannelId(name) : null
}
