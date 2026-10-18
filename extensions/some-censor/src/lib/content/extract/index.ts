/**
 * extract/index.ts — the single entry point for the extract layer.
 *
 * Design properties, enforced by the types and pinned by `extract.test.ts`
 * (labels for citation, not declared review invariants):
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
 *          full       — both ids present; a complete observation.
 *          video-only — videoId present, channelId absent; decided now,
 *                       channel backfilled later by the retry loop when
 *                       the card can carry one (`extractCarriesChannel`).
 *          raw        — videoId absent; nothing actionable yet.
 *        The video-only rung matters because real YouTube cards routinely
 *        expose a watch href (→ videoId) long before the channel anchor /
 *        channel-name node hydrates.
 */

import { extractChannelId } from "./channel-id"
import type { Extracted } from "./extracted"
import { extractVideoId } from "./video-id"

/**
 * Exported despite E3, which bars the individual extractors.
 *
 * E3 exists so a caller cannot compose partial extraction and bypass E2's
 * three-way classification. `representsVideo` cannot: it is a predicate over
 * an id the caller already holds, and it yields no material an observation
 * could be built from. It answers "is this still the same card", which
 * `tryExtract` structurally cannot — see its own doc comment.
 */
export { representsVideo } from "./video-id"

export { extractTitle } from "./title"
export { readDescription, readWatch } from "./watch"
export {
  extractCarriesChannel,
  extractIsShort,
  extractMeta,
  extractUploadDate,
} from "./meta"

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
