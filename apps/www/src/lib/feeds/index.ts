/**
 * The feeds home makes videos of (FEED4, #2647): what Studio's links name
 * (a feed's page, and each of its episodes') and home's routes take
 * (`/feeds/:feed/videos`). Pure and on every build's path, so a route
 * can read a link's feed; what the phone does with a feed's videos is
 * `lib/call-videos`, which is the phone's alone. What each feed is called
 * and fed is its words' (`lib/studio-index/words`).
 */
import type { TemplateId } from "@some-ui/video-render"

export const FEEDS = [
  "call",
  "cards-essay",
  "playoff-delta",
  "rust-essay",
] as const

export type Feed = (typeof FEEDS)[number]

/**
 * The feeds whose episodes take a note (SFEED6): home keeps none on a Rust
 * Rounds essay (`GET /feeds/rust-essay/notes` is its `404`), whose week was
 * already answered by voice, nor on a cards essay (its `404` too).
 */
export const NOTED_FEEDS = [
  "call",
  "playoff-delta",
] as const satisfies ReadonlyArray<Feed>

export type NotedFeed = (typeof NOTED_FEEDS)[number]

/** Whether `feed`'s episodes take a note. */
export const isNoted = (feed: Feed): feed is NotedFeed =>
  NOTED_FEEDS.some((noted) => noted === feed)

/**
 * The feeds whose episodes take a YouTube link (SFEED8): pasted on an
 * episode's page once it is up, and kept on home with the episode.
 */
export const LINKED_FEEDS = [
  "call",
  "cards-essay",
  "playoff-delta",
  "rust-essay",
] as const satisfies ReadonlyArray<Feed>

/** Whether `feed`'s episodes take a YouTube link. */
export const isLinked = (feed: Feed): boolean =>
  LINKED_FEEDS.some((linked) => linked === feed)

/**
 * The feeds whose episodes My data can let go once their link is saved
 * (SFEED8); home answers a cards essay's let-go with `404` until
 * some-ui#2999 builds it.
 */
export const LET_GO_FEEDS = [
  "call",
  "playoff-delta",
  "rust-essay",
] as const satisfies ReadonlyArray<(typeof LINKED_FEEDS)[number]>

/** Whether `value` names a feed (a link's `$feed`, say). */
export const isFeed = (value: unknown): value is Feed =>
  FEEDS.some((feed) => feed === value)

/**
 * The templates each feed's episodes are made with (SFEED1): the call's one,
 * Playoff Delta's week and its legend, the season's opening, and the Rust
 * Rounds essay's (RR15). A cards essay is drawn in a series of cards
 * (`CARDS_SERIES`), which Studio's Templates doesn't list, so it names none
 * (C379).
 */
export const FEED_TEMPLATES: Readonly<Record<Feed, ReadonlyArray<TemplateId>>> =
  {
    call: ["conference-call"],
    "cards-essay": [],
    "playoff-delta": ["playoff-delta-legend", "playoff-delta-week"],
    "rust-essay": ["rust-essay"],
  }
