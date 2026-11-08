/**
 * The feeds home makes videos of (FEED4, #2647): what Studio's link names
 * (`?videos=<feed>`) and home's routes take (`/feeds/:feed/videos`). Pure and
 * on every build's path, so a route can read a link's feed; what the phone
 * does with a feed's videos is `lib/call-videos`, which is the phone's alone.
 */
export const FEEDS = ["call", "playoff-delta"] as const

export type Feed = (typeof FEEDS)[number]

/** Whether `value` names a feed (a link's `?videos`, say). */
export const isFeed = (value: unknown): value is Feed =>
  FEEDS.some((feed) => feed === value)
