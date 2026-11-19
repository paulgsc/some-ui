/**
 * Studio's feed videos (ST38, #2661; FEED4, #2647), wired: one
 * runtime (`./runtime`) per feed over the link's reads and sends of that
 * feed (`lib/home-link/call-videos`, LA8), the phone's cache (`./files`) and
 * the share sheet (`lib/share-files`). Each feed's is made once per page
 * load, so a video still coming in keeps coming when the screen is left.
 * Phone-only (`build.paths.ts`).
 */
import {
  askDescription,
  askEpisodes,
  askVideoPart,
  sendLink,
} from "@/lib/home-link/call-videos"
import { askWhileBusy } from "@/lib/home-link/while-busy"
import type { Refresher } from "@/lib/pull-refresh/refreshers"
import { shareUris } from "@/lib/share-files"

import { DIR, videoFiles } from "./files"
import type { ChaptersRead, Feed, ListState } from "./model"
import {
  FEEDS,
  partOf,
  readChapters,
  readEpisodes,
  readLinkSaved,
} from "./model"
import { PART_BYTES } from "./parts"
import type { FeedVideos } from "./runtime"
import { createFeedVideos } from "./runtime"
import { FEED_WORDS } from "./words"

export type { Feed } from "./model"
export type { FeedVideos } from "./runtime"
export { episodeName, FEED_WORDS, VIDEOS_WORDS } from "./words"

/** A feed's runtime and its drag down, made together. */
type Made = { readonly videos: FeedVideos; readonly refresher: Refresher }

const made = new Map<Feed, Made>()

function create(feed: Feed): Made {
  const videos = createFeedVideos({
    async list(): Promise<ListState> {
      const asked = await askWhileBusy(() => askEpisodes(feed))
      if (asked.kind === "unpaired" || asked.kind === "busy") return asked
      if (asked.kind === "unreachable") return { kind: "away" }
      return readEpisodes(asked.answer)
    },
    async part(key, start, end) {
      const asked = await askWhileBusy(() =>
        askVideoPart(feed, key, start, end)
      )
      return partOf(asked)
    },
    files: videoFiles(feed),
    async share(uri, key) {
      const title = FEED_WORDS[feed].shareTitle(key)
      const shared = await shareUris(DIR, title, [uri])
      return shared.status === "succeeded" ? shared.value : "failed"
    },
    async saveLink(key, link) {
      const asked = await sendLink(feed, key, link)
      return asked.kind === "answered"
        ? readLinkSaved(feed, asked.answer)
        : { kind: "away" }
    },
    partBytes: PART_BYTES,
  })
  // A drag down reads the list again, and says it couldn't when home didn't
  // answer.
  const refresher: Refresher = {
    what: FEED_WORDS[feed].what,
    async checkAgain(): Promise<void> {
      await videos.open()
      const { list } = videos.getSnapshot()
      if (
        list.kind === "away" ||
        list.kind === "busy" ||
        list.kind === "unreadable"
      ) {
        throw new Error("home didn't answer")
      }
    },
  }
  return { videos, refresher }
}

function madeFor(feed: Feed): Made {
  const known = made.get(feed)
  if (known !== undefined) return known
  const fresh = create(feed)
  made.set(feed, fresh)
  return fresh
}

/** `feed`'s videos, made on first use. */
export function feedVideos(feed: Feed): FeedVideos {
  return madeFor(feed).videos
}

/** A drag down on `feed`'s videos, made with its runtime. */
export function videosRefresher(feed: Feed): Refresher {
  return madeFor(feed).refresher
}

/**
 * An episode's chapters (SFEED4, #2763), read once; home not answering reads
 * as none to show, since the page says where home is already. `wanted` stops
 * the asking once the page has gone. Never rejects.
 */
export async function episodeChapters(
  feed: Feed,
  key: string,
  wanted: () => boolean
): Promise<ChaptersRead> {
  const asked = await askWhileBusy(() => askDescription(feed, key), wanted)
  return asked.kind === "answered"
    ? readChapters(asked.answer)
    : { kind: "none" }
}

/** Every feed's list, as one snapshot (`lib/episodes-feed`'s `FeedLists`). */
export type EveryFeedList = Readonly<Record<Feed, ListState>>

let lastLists: EveryFeedList | null = null

/**
 * Every feed's list at once, for Studio's Episodes (EPISODES2): the same
 * snapshot while no feed's list has moved, so a screen re-renders only when
 * one does.
 */
function everyList(): EveryFeedList {
  const list = (feed: Feed): ListState => feedVideos(feed).getSnapshot().list
  const now: EveryFeedList = {
    call: list("call"),
    "cards-essay": list("cards-essay"),
    "interview-essay": list("interview-essay"),
    "playoff-delta": list("playoff-delta"),
    report: list("report"),
    "rust-essay": list("rust-essay"),
  }
  if (
    lastLists !== null &&
    FEEDS.every((feed) => lastLists?.[feed] === now[feed])
  ) {
    return lastLists
  }
  lastLists = now
  return now
}

/** Every feed's videos, read and watched together. */
export const everyFeed = {
  subscribe(listener: () => void): () => void {
    const stops = FEEDS.map((feed) => feedVideos(feed).subscribe(listener))
    return () => {
      for (const stop of stops) stop()
    }
  },
  getSnapshot: everyList,
} as const
