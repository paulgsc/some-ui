/**
 * Branded primitive types for identity.
 * These are type-level only — compiled away entirely.
 * Safe to import from any bundle (content / background / popup).
 */

export type VideoId = string & { readonly __brand: "VideoId" }
export type ChannelId = string & { readonly __brand: "ChannelId" }

export function asVideoId(x: string): VideoId {
  return x as VideoId
}
export function asChannelId(x: string): ChannelId {
  return x as ChannelId
}
