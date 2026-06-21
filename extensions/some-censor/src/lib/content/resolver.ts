import type { Failed, NodeState, Resolved } from "@censor/types/states"

import { extractChannelId } from "./extract/channel-id"
import { extractVideoId } from "./extract/video-id"

/**
 * Pure classification function. No side effects.
 *
 * Maps an HTMLElement to one of:
 *   Resolved  — both videoId and channelId extracted successfully
 *   Failed    — one or both IDs missing (YouTube not yet hydrated, or unsupported layout)
 *
 * The caller is responsible for retry scheduling on Failed results.
 */
export function tryResolve(el: HTMLElement): Resolved | Failed {
  const videoId = extractVideoId(el)
  const channelId = extractChannelId(el)

  if (!videoId) return { kind: "failed", el, reason: "missing-video-id" }
  if (!channelId) return { kind: "failed", el, reason: "missing-channel-id" }

  return { kind: "resolved", el, videoId, channelId }
}

export type { NodeState, Resolved, Failed }
