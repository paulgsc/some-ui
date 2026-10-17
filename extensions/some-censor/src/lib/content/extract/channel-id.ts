import { parseChannelHref } from "@censor/lib/content/core/parse"
import type { ChannelId } from "@censor/types/ids"
import { asChannelId } from "@censor/types/ids"

import { channelName } from "./meta"

/**
 * Extract YouTube channel identifier from a renderer element.
 * Normalises all formats to either:
 *   - UCxxx...  (channel ID)
 *   - @handle   (handle)
 *
 * Falls back to the display name (`meta.ts`) if no href pattern matches.
 */
export function extractChannelId(el: HTMLElement): ChannelId | null {
  for (const a of el.querySelectorAll<HTMLAnchorElement>("a")) {
    const href = a.href || a.getAttribute("href") || ""
    if (!href) continue

    const parsed = parseChannelHref(href)
    if (parsed !== null) return parsed
  }

  // Fallback: the visible channel name (less stable but better than null).
  // A watch-rail lockup and a playlist-panel row carry no channel link at
  // all, only the name.
  const name = channelName(el)
  return name ? asChannelId(name) : null
}
