/**
 * The feeds home makes videos of (FEED4, #2647): what Studio's links name
 * (a feed's page, and each of its episodes') and home's routes take
 * (`/feeds/:feed/videos`). Pure and on every build's path, so a route
 * can read a link's feed; what the phone does with a feed's videos is
 * `lib/call-videos`, which is the phone's alone. What each feed is called
 * and fed is its words' (`lib/studio-index/words`).
 */
import type { TemplateId } from "@some-ui/video-render"

export const FEEDS = ["call", "playoff-delta"] as const

export type Feed = (typeof FEEDS)[number]

/** Whether `value` names a feed (a link's `$feed`, say). */
export const isFeed = (value: unknown): value is Feed =>
  FEEDS.some((feed) => feed === value)

/**
 * The templates each feed's episodes are made with (SFEED1): the call's one,
 * and Playoff Delta's week and its legend, the season's opening.
 */
export const FEED_TEMPLATES: Readonly<Record<Feed, ReadonlyArray<TemplateId>>> =
  {
    call: ["conference-call"],
    "playoff-delta": ["playoff-delta-legend", "playoff-delta-week"],
  }
