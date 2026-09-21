/**
 * Core's identity type (BC3, #1436) — Boundary Contract B2: content-derived,
 * never node-derived.
 *
 * A card is keyed by the artifact it shows, not by the element showing it.
 * Two elements rendering the same video — the home feed's grid cell and the
 * lockup nested inside it (#1426), or the same video in a sidebar and a
 * description — are one card here: disclosure is a property of the
 * artifact, custody of the elements is the Sensor's and Actuator's to keep
 * (#1426's own modelling statement). A `Map<HTMLElement, …>` cannot be
 * written against this type, because nothing here can name an element.
 */

import type { VideoId } from "@censor/types/ids"

export type CardKey = string & { readonly __brand: "CardKey" }

export function cardKey(videoId: VideoId): CardKey {
  // The branded string is the id itself; the brand is what keeps a bare
  // string, or anything derived from a node, out of Core's maps.
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  return videoId as unknown as CardKey
}

/** The artifact a key names — the inverse of {@link cardKey}. */
export function keyVideoId(key: CardKey): VideoId {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  return key as unknown as VideoId
}
