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
 */

import { extractChannelId } from "./channel-id"
import type { Extracted } from "./extracted"
import { extractVideoId } from "./video-id"

export { extractTitle } from "./title"
export type { FullyExtracted } from "./extracted"
export { extractMeta } from "./meta"

export function tryExtract(el: HTMLElement): Extracted {
  const videoId = extractVideoId(el)
  const channelId = extractChannelId(el)

  if (videoId && channelId) {
    return { kind: "full", videoId, channelId }
  }

  return { kind: "raw", videoId, channelId }
}
