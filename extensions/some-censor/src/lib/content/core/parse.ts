/**
 * Pure parsing of the strings a card's markup carries (BC3, #1436).
 *
 * The extract layer reads a DOM subtree and is therefore the Sensor's
 * (Boundary Contract B3); what it *does* with each href is string logic
 * with no DOM in it, and that logic lives here so Core owns the meaning of
 * an id without ever touching the node it came from. `extract/video-id.ts`
 * and `extract/channel-id.ts` are its only callers.
 */

import { asChannelId, asVideoId } from "@censor/types/ids"
import type { ChannelId, VideoId } from "@censor/types/ids"

/**
 * The videoId one href encodes, if any: `/watch?v=`, `/shorts/<id>`, or the
 * `/watch/<id>` path form. One function for every reader so no two can
 * disagree about what an href means.
 */
export function parseVideoHref(href: string): VideoId | null {
  const [, watch] = href.match(/[?&]v=([^&/#]+)/) ?? []
  if (watch) return asVideoId(watch)

  const [, shorts] = href.match(/\/shorts\/([^/?#&]+)/) ?? []
  if (shorts) return asVideoId(shorts)

  const [, path] = href.match(/\/watch\/([^/?#&]+)/) ?? []
  if (path) return asVideoId(path)

  return null
}

/**
 * The channel identity one href encodes, normalised to either a `UC…` id or
 * an `@handle` (legacy `/c/` and `/user/` paths become handles too).
 */
export function parseChannelHref(href: string): ChannelId | null {
  const [, channelId] = href.match(/\/channel\/([^/?#&]+)/) ?? []
  if (channelId) return asChannelId(channelId)

  const [, handle] = href.match(/\/@([^/?#&]+)/) ?? []
  if (handle) return asChannelId(`@${handle}`)

  const [, c] = href.match(/\/c\/([^/?#&]+)/) ?? []
  if (c) return asChannelId(`@${c}`)

  const [, user] = href.match(/\/user\/([^/?#&]+)/) ?? []
  if (user) return asChannelId(`@${user}`)

  return null
}
