/**
 * Studio's feed videos (ST38, #2661; FEED4, #2647), wired: one
 * runtime (`./runtime`) per feed over the link's reads and sends of that
 * feed (`lib/home-link/call-videos`, LA8), the phone's cache (`./files`) and
 * the share sheet (`lib/share-files`). Each feed's is made once per page
 * load, so a video still coming in keeps coming when the screen is left.
 * Phone-only (`build.paths.ts`).
 */
import type { AloneAsset } from "@some-ui/video-render/assets"

import {
  askAsset,
  askEpisodes,
  askVideoPart,
  sendLink,
  sendProduce,
} from "@/lib/home-link/call-videos"
import { askWhileBusy } from "@/lib/home-link/while-busy"
import type { Refresher } from "@/lib/pull-refresh/refreshers"
import { shareFiles, shareUris } from "@/lib/share-files"

import type { AssetRead, Produced, ShownAsset } from "./assets"
import { readAsset, readProduced } from "./assets"
import { DIR, videoFiles } from "./files"
import type { Feed, ListState } from "./model"
import { FEEDS, partOf, readEpisodes, readLinkSaved } from "./model"
import { PART_BYTES } from "./parts"
import type { FeedVideos } from "./runtime"
import { createFeedVideos } from "./runtime"
import { FEED_WORDS } from "./words"

export type { Feed } from "./model"
export type { FeedVideos } from "./runtime"
export { ASSET_WORDS, episodeName, FEED_WORDS, VIDEOS_WORDS } from "./words"

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
 * One of an episode's files beside its video (ASSETS-R; its chapters,
 * SFEED4), read once; home not answering reads as nothing to show, since the
 * page says where home is already. `wanted` stops the asking once the page
 * has gone. Never rejects.
 */
export async function episodeAsset<A extends ShownAsset>(
  feed: Feed,
  key: string,
  asset: A,
  wanted: () => boolean
): Promise<AssetRead<A>> {
  const asked = await askWhileBusy(() => askAsset(feed, key, asset), wanted)
  return asked.kind === "answered"
    ? readAsset(asset, asked.answer)
    : { kind: "unreadable" }
}

/**
 * Asks home, once, to make one of an episode's files it lacks, then reads
 * `feed`'s list again once home took the ask, so the page says the file is
 * coming; home not answering reads as `unreadable`, which the page says as
 * not asked. Never rejects.
 */
export async function produceAsset(
  feed: Feed,
  key: string,
  asset: AloneAsset
): Promise<Produced> {
  const asked = await sendProduce(feed, key, asset)
  const produced: Produced =
    asked.kind === "answered"
      ? readProduced(asset, asked.answer)
      : { kind: "unreadable" }
  if (produced.kind === "step") void feedVideos(feed).open()
  return produced
}

/**
 * `feed`'s list read again, as a drag down reads it, for the episode page's
 * read while a file is under way (`components/episode-files.tsx`); it keeps
 * no answer of its own (`null`), since the list is the runtime's, which keeps
 * the read asked last.
 */
export async function readListAgain(feed: Feed): Promise<null> {
  await feedVideos(feed).open()
  return null
}

/** The cache folder a thumbnail is shared from, apart from the videos'. */
const THUMBNAIL_DIR = "episode-thumbnails"

/** What handing a thumbnail to the share sheet came to. */
export type ThumbnailSaved = "opened" | "failed" | "unavailable"

/**
 * Hands an episode's thumbnail (its PNG as base64) to the share sheet, so the
 * owner keeps it where they choose before setting it in YouTube Studio
 * (C1025): whether the sheet opened, didn't, or can't in this build, in
 * which case the page withdraws Save. Never rejects.
 */
export async function saveThumbnail(
  feed: Feed,
  key: string,
  base64: string
): Promise<ThumbnailSaved> {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
  const shared = await shareFiles(THUMBNAIL_DIR, FEED_WORDS[feed].label(key), [
    {
      name: `${feed}-${key}-thumbnail.png`,
      data: new Blob([bytes], { type: "image/png" }),
    },
  ])
  if (shared.status === "succeeded") return "opened"
  return shared.status === "failed" && shared.error.kind === "unavailable"
    ? "unavailable"
    : "failed"
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
