/**
 * Each feed's videos on home (`FEEDS`), for Studio's feed videos (ST38,
 * FEED4; paulgsc/server `routes::feed_videos`), through the link (LA8):
 *
 * - the list of a feed's episodes home holds, one `GET /feeds/:feed/videos`
 *   each time its screen opens, on a drag down, on Try again, and once after
 *   a Save home kept;
 * - an episode's video, one `GET /feeds/:feed/videos/:key/video` per part of
 *   it the phone fetches, each a range of at most `PART_BYTES`, while Watch
 *   fetches it into the phone's cache;
 * - the episode's `YouTube` link, one `PUT /feeds/:feed/videos/:key/link` per
 *   Save, which a tap starts;
 * - the episode's chapters for its `YouTube` description (SFEED4, #2763), one
 *   `GET /feeds/:feed/videos/:key/description` each time its page opens.
 *
 * All four go through the link's `keep`, as Ideas on home's writes do.
 *
 * Nothing of the phone's is sent but the link the owner pasted. What the
 * screen makes of each answer is `lib/call-videos`'s, its one caller.
 */
import type { Feed } from "@/lib/call-videos/model"

import { homeLink } from "./index"
import type { Asked } from "./while-busy"
import { asked } from "./while-busy"

/** The list of a feed's episodes home holds. */
function episodesPath(feed: Feed): string {
  return `/feeds/${feed}/videos`
}

/** An episode's video. */
function videoPath(feed: Feed, key: string): string {
  return `/feeds/${feed}/videos/${encodeURIComponent(key)}/video`
}

/** An episode's `YouTube` link. */
function linkPath(feed: Feed, key: string): string {
  return `/feeds/${feed}/videos/${encodeURIComponent(key)}/link`
}

/** An episode's chapters, as its YouTube description's lines. */
function descriptionPath(feed: Feed, key: string): string {
  return `/feeds/${feed}/videos/${encodeURIComponent(key)}/description`
}

/** The most bytes of a video one request asks for: about 4 MB. */
export const PART_BYTES = 4 * 1024 * 1024

/** Asks home once for the episodes of `feed` it holds; never rejects. */
export function askEpisodes(feed: Feed): Promise<Asked> {
  return asked(() => homeLink().keep((send) => send("GET", episodesPath(feed))))
}

/**
 * Asks home once for bytes `start` to `end` of an episode's video; the
 * answer's body is them as base64. Never rejects.
 */
export function askVideoPart(
  feed: Feed,
  key: string,
  start: number,
  end: number
): Promise<Asked> {
  return asked(() =>
    homeLink().keep((send) =>
      send("GET", videoPath(feed, key), undefined, { start, end })
    )
  )
}

/** Sends home the link the owner pasted for an episode, once; never rejects. */
export function sendLink(
  feed: Feed,
  key: string,
  link: string
): Promise<Asked> {
  return asked(() =>
    homeLink().keep((send) =>
      send("PUT", linkPath(feed, key), JSON.stringify({ link }))
    )
  )
}

/** Asks home once for an episode's chapters; never rejects. */
export function askDescription(feed: Feed, key: string): Promise<Asked> {
  return asked(() =>
    homeLink().keep((send) => send("GET", descriptionPath(feed, key)))
  )
}
