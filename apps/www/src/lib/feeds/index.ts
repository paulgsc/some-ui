/**
 * The feeds home makes videos of (FEED4, #2647): what Studio's links name
 * (a feed's page, and each of its episodes') and home's routes take
 * (`/feeds/:feed/videos`). Pure and on every build's path, so a route
 * can read a link's feed; what the phone does with a feed's videos is
 * `lib/call-videos`, which is the phone's alone. What each feed is called
 * and fed is its words' (`lib/studio-index/words`).
 */
import type { TemplateId } from "@some-ui/video-render"

export const FEEDS = ["call", "playoff-delta", "rust-essay"] as const

export type Feed = (typeof FEEDS)[number]

/**
 * The feeds whose episodes take a note (SFEED6): home keeps none on a Rust
 * Rounds essay (`GET /feeds/rust-essay/notes` is its `404`), whose week was
 * already answered by voice.
 */
export const NOTED_FEEDS = [
  "call",
  "playoff-delta",
] as const satisfies ReadonlyArray<Feed>

export type NotedFeed = (typeof NOTED_FEEDS)[number]

/** Whether `feed`'s episodes take a note. */
export const isNoted = (feed: Feed): feed is NotedFeed =>
  NOTED_FEEDS.some((noted) => noted === feed)

/** Whether `value` names a feed (a link's `$feed`, say). */
export const isFeed = (value: unknown): value is Feed =>
  FEEDS.some((feed) => feed === value)

/**
 * The templates each feed's episodes are made with (SFEED1): the call's one,
 * Playoff Delta's week and its legend, the season's opening, and the Rust
 * Rounds essay's (RR15).
 */
export const FEED_TEMPLATES: Readonly<Record<Feed, ReadonlyArray<TemplateId>>> =
  {
    call: ["conference-call"],
    "playoff-delta": ["playoff-delta-legend", "playoff-delta-week"],
    "rust-essay": ["rust-essay"],
  }
