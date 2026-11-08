/**
 * Studio's feed videos (ST38, #2661; FEED4, #2647), wired: one
 * runtime (`./runtime`) per feed over the link's reads and sends of that
 * feed (`lib/home-link/call-videos`, LA8), the phone's cache (`./files`) and
 * the share sheet (`lib/share-files`). Each feed's is made once per page
 * load, so a video still coming in keeps coming when the screen is left.
 * Phone-only (`build.paths.ts`).
 */
import {
  askEpisodes,
  askVideoPart,
  PART_BYTES,
  sendLink,
} from "@/lib/home-link/call-videos"
import { askWhileBusy } from "@/lib/home-link/while-busy"
import type { Refresher } from "@/lib/pull-refresh/refreshers"
import { shareUris } from "@/lib/share-files"

import { DIR, videoFiles } from "./files"
import type { Feed, ListState } from "./model"
import { readEpisodes, readLinkSaved, readPart } from "./model"
import type { FeedVideos } from "./runtime"
import { createFeedVideos } from "./runtime"
import { FEED_WORDS } from "./words"

export type { Feed } from "./model"
export { FEEDS } from "./model"
export type { FeedVideos } from "./runtime"
export { FEED_WORDS, VIDEOS_WORDS } from "./words"

const runtimes = new Map<Feed, FeedVideos>()

function create(feed: Feed): FeedVideos {
  return createFeedVideos({
    async list(): Promise<ListState> {
      const asked = await askWhileBusy(() => askEpisodes(feed))
      if (asked.kind === "unpaired") return asked
      if (asked.kind === "unreachable") return { kind: "away" }
      return readEpisodes(asked.answer)
    },
    async part(key, start, end) {
      const asked = await askWhileBusy(() =>
        askVideoPart(feed, key, start, end)
      )
      return asked.kind === "answered"
        ? readPart(asked.answer)
        : { kind: "away" }
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
        ? readLinkSaved(asked.answer)
        : { kind: "away" }
    },
    partBytes: PART_BYTES,
  })
}

/** `feed`'s videos, made on first use. */
export function feedVideos(feed: Feed): FeedVideos {
  const made = runtimes.get(feed)
  if (made !== undefined) return made
  const runtime = create(feed)
  runtimes.set(feed, runtime)
  return runtime
}

const refreshers = new Map<Feed, Refresher>()

/**
 * A drag down on a feed's videos reads its list again, and says it couldn't
 * when home didn't answer. One per feed, as its runtime is.
 */
export function videosRefresher(feed: Feed): Refresher {
  const made = refreshers.get(feed)
  if (made !== undefined) return made
  const refresher: Refresher = {
    what: FEED_WORDS[feed].what,
    async checkAgain(): Promise<void> {
      await feedVideos(feed).open()
      const { list } = feedVideos(feed).getSnapshot()
      if (list.kind === "away" || list.kind === "unreadable") {
        throw new Error("home didn't answer")
      }
    },
  }
  refreshers.set(feed, refresher)
  return refresher
}
