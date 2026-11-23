/**
 * Each feed's videos on home (`FEEDS`), for Studio's feed videos (ST38,
 * FEED4; paulgsc/server `routes::feed_videos`), through the link (LA8):
 *
 * - the list of a feed's episodes home holds, one `GET /feeds/:feed/videos`
 *   each time its screen opens, on a drag down, on Try again, and once after
 *   a Save home kept;
 * - an episode's video, one `GET /feeds/:feed/videos/:key/video` per part of
 *   it the phone fetches, each a range of at most `PART_BYTES`
 *   (`lib/call-videos/parts`), while Watch fetches it into the phone's cache;
 * - the episode's `YouTube` link, one `PUT /feeds/:feed/videos/:key/link` per
 *   Save, which a tap starts;
 * - each file its render left beside the video for `YouTube` (ASSETS-R,
 *   C1300): its chapters (SFEED4, #2763) and its thumbnail, one
 *   `GET /feeds/:feed/videos/:key/<file>` each time its page opens;
 * - one `POST /feeds/:feed/videos/:key/produce` of `{ asset }` per Generate,
 *   which asks home to make a file the episode lacks, a tap each.
 *
 * All go through the link's `keep`, as Ideas on home's writes do.
 *
 * Nothing of the phone's is sent but the link the owner pasted and the name
 * of the file asked for. What the
 * screen makes of each answer is `lib/call-videos`'s, its one caller.
 */
import type { HomeAnswer, HomeCall } from "@some-ui/core-utils"
import type { AloneAsset, EpisodeAsset } from "@some-ui/video-render/assets"

import type { ShownAsset } from "@/lib/call-videos/assets"
import type { Feed } from "@/lib/call-videos/model"

import { homeLink } from "./index"
import type { Asked } from "./while-busy"
import { asked } from "./while-busy"

/** The list of a feed's episodes home holds. */
function episodesPath(feed: Feed): string {
  return `/feeds/${feed}/videos`
}

/** An episode's file: its video, or one beside it. */
function assetPath(feed: Feed, key: string, asset: EpisodeAsset): string {
  return `/feeds/${feed}/videos/${encodeURIComponent(key)}/${asset}`
}

/** An episode's ask that home make one of its files. */
function producePath(feed: Feed, key: string): string {
  return `/feeds/${feed}/videos/${encodeURIComponent(key)}/produce`
}

/** An episode's `YouTube` link. */
function linkPath(feed: Feed, key: string): string {
  return `/feeds/${feed}/videos/${encodeURIComponent(key)}/link`
}

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
      send("GET", assetPath(feed, key, "video"), undefined, { start, end })
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

/** How each file beside the video is asked for: bytes whole, or text. */
const ASKED_AS: {
  readonly [A in ShownAsset]: (
    send: HomeCall,
    path: string
  ) => Promise<HomeAnswer>
} = {
  thumbnail: (send, path) => send("GET", path, undefined, "whole"),
  description: (send, path) => send("GET", path),
}

/**
 * Asks home once for one of an episode's files beside its video, whole: its
 * chapters as text, its thumbnail's bytes as base64. Never rejects.
 */
export function askAsset(
  feed: Feed,
  key: string,
  asset: ShownAsset
): Promise<Asked> {
  return asked(() =>
    homeLink().keep((send) =>
      ASKED_AS[asset](send, assetPath(feed, key, asset))
    )
  )
}

/** Asks home once to make one of an episode's files; never rejects. */
export function sendProduce(
  feed: Feed,
  key: string,
  asset: AloneAsset
): Promise<Asked> {
  return asked(() =>
    homeLink().keep((send) =>
      send("POST", producePath(feed, key), JSON.stringify({ asset }))
    )
  )
}
