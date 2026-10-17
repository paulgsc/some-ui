/**
 * What the Sensor tells Core about a card (BC3) — the observation
 * record, as opposed to anything presentable.
 *
 * Raw vendor text lives here and only here: `uploadDate` in particular is
 * the string exactly as YouTube rendered it. It is evidence for the maturity
 * estimate (`maturity/maturity.ts`) and the observability corpus, and it
 * cannot reach a veil: the presentable `MetaData` has no date field (QD4,
 * #1384).
 */

import type { BoyoSurface } from "@censor/lib/content/layout/surface"
import type { ChannelId, VideoId } from "@censor/types/ids"

/** How the Sensor classified the element(s) carrying this card. */
export type ShapeConfidence =
  /** The layout table named the shape. */
  | "known"
  /**
   * The table did not (B4). Core still treats the card as a card — the
   * stylesheet is occluding it regardless, and a veil is strictly better
   * than an occluder nothing lifts — and counts the miss as the table's
   * staleness signal (#1434's recrawl cadence).
   */
  | "unknown"

export type Observation = {
  readonly videoId: VideoId
  readonly channelId: ChannelId | null
  readonly channelName: string | null
  readonly title: string | null
  readonly duration: string | null
  /** Raw vendor text. Observation only — see the module header. */
  readonly uploadDate: string | null
  /** The card is a Short, held whatever its date (QD11). */
  readonly short: boolean
  readonly surface: BoyoSurface
  /** The anchor element's tag, lower-case. Diagnostics only. */
  readonly renderer: string
  readonly shape: ShapeConfidence
}

/**
 * Fold a fresh observation over an older one: every field keeps the newest
 * non-null value, so evidence only ever accumulates (the monotonic tier order
 * of canon Theorem 5.1, at field granularity). A later observation that lost
 * a field to vendor churn does not erase what an earlier one saw.
 */
export function mergeObservation(
  previous: Observation,
  next: Observation
): Observation {
  return {
    videoId: next.videoId,
    channelId: next.channelId ?? previous.channelId,
    channelName: next.channelName ?? previous.channelName,
    title: next.title ?? previous.title,
    duration: next.duration ?? previous.duration,
    uploadDate: next.uploadDate ?? previous.uploadDate,
    // Once seen as a Short, always held: the evidence only accumulates.
    short: previous.short || next.short,
    surface: next.surface,
    renderer: next.renderer,
    // Once the table has named a shape it stays named; a later unknown reading
    // is a weaker one, not a contradiction.
    shape: previous.shape === "known" ? "known" : next.shape,
  }
}
