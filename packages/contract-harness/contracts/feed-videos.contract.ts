/**
 * Each feed's videos on home, for Studio's Episodes on the phone (paulgsc/server
 * `routes/feed_videos.rs`, `handlers/feed_videos.rs`, `feeds/videos.rs`;
 * ST38, FEED4). The phone lists a feed's episodes with
 * `GET /feeds/:feed/videos` and brings one's video with
 * `GET /feeds/:feed/videos/:key/video`, saves its YouTube link with
 * `PUT /feeds/:feed/videos/:key/link`, reads its thumbnail with
 * `GET /feeds/:feed/videos/:key/thumbnail` and asks home to make one of its
 * files with `POST /feeds/:feed/videos/:key/produce` (ASSETS-R,
 * paulgsc/server#1140; `apps/www/src/lib/home-link/call-videos.ts`), through
 * the app's home link.
 *
 * Hand-written, for the cards essays' feed (`cards-essay`, server#878, at
 * contract epoch 10): each episode is `{ key, week, part, of, videoBytes,
 * restBytes, link, receipts, title }`, its key `<slug>-<YYYY-MM-DD>`, newest
 * day first. An essay takes a link as every feed's episode does (`link` is
 * the saved one, else `null`), but `receipts` is always empty, since no
 * essay is let go yet (some-ui#2999). Every feed's episode
 * carries `title` from that epoch, `null` but for a cards essay's, which the
 * phone reads as optional (`lib/call-videos/model`) so an older home still
 * reads.
 *
 * Since server#906 every entry also carries `date` (`YYYY-MM-DD`, the day
 * home knows for it: the call's week's first day, an essay's ISO-week
 * Monday, a cards essay's own day, a Playoff Delta fill's day; C416),
 * `durationMs` (its video's length, read from the file) and `weekDurationMs`
 * (its whole week's, while home holds every part), each `null` when home
 * doesn't know it. The phone reads all three as optional and nullable, so
 * one unknown never fails the list, and Studio's Episodes groups by `date`
 * (EPISODES2, some-ui#3067). The interview essays' feed (`interview-essay`,
 * server#900) is listed like the others and is a paired phone's too.
 *
 * The routes are a paired phone's only (`Paired`): without a session each is
 * a `401`, and a browser's cookie session, which is what a `session`
 * contract carries, is a `403`. So the contracts here pin the refusals; the
 * list's shape and the video, which only a paired phone's bearer reaches,
 * are held by the server's handler tests and the phone's readers
 * (`readEpisodes`).
 */

import { defineContract, pairedPhoneOnly } from "../src/contract"

const LIST = "/feeds/:feed/videos"

const VIDEO = "/feeds/:feed/videos/:key/video"

const LINK = "/feeds/:feed/videos/:key/link"

const THUMBNAIL = "/feeds/:feed/videos/:key/thumbnail"

const PRODUCE = "/feeds/:feed/videos/:key/produce"

const CARDS = { path: { feed: "cards-essay" } }

const INTERVIEW = { path: { feed: "interview-essay" } }

const ESSAY = { path: { feed: "cards-essay", key: "zfs-2026-11-02" } }

export const contracts = [
  defineContract({
    id: "feed_videos.cards_list_signed_out",
    module: "feed_videos",
    method: "GET",
    path: LIST,
    request: CARDS,
    summary:
      "the cards essays' episodes are a paired phone's: without a session it is a 401",
    expect: { status: 401 },
  }),

  defineContract({
    id: "feed_videos.cards_list_browser",
    module: "feed_videos",
    session: true,
    method: "GET",
    path: LIST,
    request: CARDS,
    summary: "a browser's session is not a paired phone's: it is a 403",
    expect: { status: 403 },
  }),

  defineContract({
    id: "feed_videos.interview_list_signed_out",
    module: "feed_videos",
    method: "GET",
    path: LIST,
    request: INTERVIEW,
    summary:
      "the interview essays' episodes are a paired phone's: without a session it is a 401",
    expect: { status: 401 },
  }),

  defineContract({
    id: "feed_videos.cards_video_signed_out",
    module: "feed_videos",
    method: "GET",
    path: VIDEO,
    request: ESSAY,
    summary:
      "a cards essay's video, as its feed serves it, is a paired phone's: without a session it is a 401",
    expect: { status: 401 },
  }),

  ...pairedPhoneOnly(
    "feed_videos",
    "feed_videos.cards_link",
    "PUT",
    LINK,
    "a cards essay's YouTube link",
    { ...ESSAY, body: { link: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" } }
  ),

  ...pairedPhoneOnly(
    "feed_videos",
    "feed_videos.cards_thumbnail",
    "GET",
    THUMBNAIL,
    "a cards essay's thumbnail",
    ESSAY
  ),

  ...pairedPhoneOnly(
    "feed_videos",
    "feed_videos.cards_produce",
    "POST",
    PRODUCE,
    "asking home to make a cards essay's thumbnail",
    { ...ESSAY, body: { asset: "thumbnail" } }
  ),
]
