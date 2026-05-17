import { asChannelId } from "@censor/types/ids"
import type { ChannelId } from "@censor/types/ids"

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

    const channel = href.match(/\/channel\/([^/?#&]+)/)
    if (channel) return asChannelId(channel[1])

    const handle = href.match(/\/@([^/?#&]+)/)
    if (handle) return asChannelId(`@${handle[1]}`)

    const c = href.match(/\/c\/([^/?#&]+)/)
    if (c) return asChannelId(`@${c[1]}`)

    const user = href.match(/\/user\/([^/?#&]+)/)
    if (user) return asChannelId(`@${user[1]}`)
  }

  // Fallback: visible channel name text (less stable but better than null)
  const node = el.querySelector(
    "ytd-channel-name yt-formatted-string, #channel-name yt-formatted-string"
  )
  const name = node?.textContent?.trim()
  return name ? asChannelId(name) : null
}
