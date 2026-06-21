/**
 * Extracted — output contract of the extract layer.
 *
 * Invariants enforced here:
 *
 *   E1 — Partiality is explicit in the type, not in runtime null-checks scattered
 *        across callers.  The discriminant `kind` is the single authoritative signal.
 *
 *   E2 — FullyExtracted is the ONLY input accepted by resolve().  The compiler
 *        rejects RawExtracted at the resolve boundary, making it impossible to
 *        call resolve() on an unhydrated element.
 *
 *   E3 — Fields inside FullyExtracted are `string`, not `string | null`.
 *        The narrowing from null to non-null happens exactly once, in tryExtract,
 *        and is never re-checked downstream.
 *
 *   E4 — VideoOnlyExtracted is a distinct, intermediate variant: videoId is
 *        guaranteed non-null but channelId is still pending.  It is sufficient
 *        to MASK a card (masking + registry keying need only videoId) but NOT
 *        sufficient to construct a VideoRecord (makeRecord still demands
 *        FullyExtracted — V2 is untouched).  This is what lets a card mount
 *        masked on the fast path while channel-id hydrates late, instead of
 *        being parked indefinitely in the unresolved queue.
 */

import type { ChannelId, VideoId } from "@censor/types/ids"

export type RawExtracted = {
  readonly kind: "raw"
  readonly videoId: string | null
  readonly channelId: string | null
}

export type VideoOnlyExtracted = {
  readonly kind: "video-only"
  readonly videoId: VideoId // guaranteed non-null by construction
  readonly channelId: null // not yet hydrated — backfilled by retry loop
}

export type FullyExtracted = {
  readonly kind: "full"
  readonly videoId: VideoId // guaranteed non-null by construction
  readonly channelId: ChannelId // guaranteed non-null by construction
}

export type Extracted = RawExtracted | VideoOnlyExtracted | FullyExtracted

/** Narrowing predicate — usable as a type guard in filter chains. */
export function isFullyExtracted(x: Extracted): x is FullyExtracted {
  return x.kind === "full"
}

/** Narrowing predicate for the masked-but-channel-pending case. */
export function isVideoOnly(x: Extracted): x is VideoOnlyExtracted {
  return x.kind === "video-only"
}
