/**
 * extract/index.ts — the single entry point for the extract layer.
 *
 * Invariants enforced here:
 *
 *   E1 — Determinism: tryExtract(el) depends only on el's current DOM subtree.
 *        No global state, no closures over mutable variables.
 *
 *   E2 — Partiality is resolved once.  The null-check for videoId and channelId
 *        happens exactly here and nowhere else.  Callers receive a typed
 *        discriminant, not scattered `?? null` patterns.
 *
 *   E3 — Individual extractors (video-id, channel-id) are not exported from
 *        this module.  The only public surface is tryExtract.  This prevents
 *        callers from composing partial extraction themselves and bypassing E2.
 *
 *   E4 — Three-way classification:
 *          full       — both ids present; can construct a VideoRecord.
 *          video-only — videoId present, channelId absent; can MASK now,
 *                       channel backfilled later by the retry loop.
 *          raw        — videoId absent; nothing actionable yet.
 *        The video-only rung is what fixes the <60% resolution rate: real
 *        YouTube cards routinely expose a watch href (→ videoId) long before
 *        the channel anchor / channel-name node hydrates.  Previously those
 *        cards sat in `_unresolved` until an unrelated mutation happened to
 *        re-trigger extraction — frequently never.
 */

import { extractChannelId } from "./channel-id"
import type { Extracted } from "./extracted"
import { extractVideoId } from "./video-id"

export { extractTitle } from "./title"
export { extractMeta } from "./meta"
export type { FullyExtracted, VideoOnlyExtracted } from "./extracted"
export { isFullyExtracted, isVideoOnly } from "./extracted"

export function tryExtract(el: HTMLElement): Extracted {
  const videoId = extractVideoId(el)
  const channelId = extractChannelId(el)

  if (videoId === null) {
    return { kind: "raw", videoId: null, channelId }
  }

  if (channelId === null) {
    return { kind: "video-only", videoId, channelId: null }
  }

  return { kind: "full", videoId, channelId }
}
