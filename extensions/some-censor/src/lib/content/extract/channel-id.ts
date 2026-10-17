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
 * Falls back to the display name (`meta.ts`), less stable than an href, if no
 * href pattern matches.
 */
export function extractChannelId(el: HTMLElement): ChannelId | null {
  for (const a of el.querySelectorAll<HTMLAnchorElement>("a")) {
    const href = a.href || a.getAttribute("href") || ""
    if (!href) continue

    const parsed = parseChannelHref(href)
    if (parsed !== null) return parsed
  }

  const name = channelName(el, false)
  return name ? asChannelId(name) : null
}
