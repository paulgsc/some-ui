/**
 * Studio's feed videos (ST38, #2661; FEED4, #2647): the runtime that
 * owns home's requests and the phone's copies of one feed's videos (`FEEDS`),
 * so the screen only reads a snapshot and says what was pressed (R1). One runtime per feed, over that feed's ports
 * (`./index`); every port resolves; what each answer means is `./model`'s.
 *
 * - **The list** is read once per open, drag down or Try again. An episode
 *   whose whole video the phone already keeps reads as ready at once, and a
 *   ready episode whose file has gone (Android cleared the cache) is
 *   forgotten, so Watch fetches it again.
 * - **Watch** fetches an episode's video into the phone's cache a part at a
 *   time (at most `partBytes` a request, so it is never held whole), then
 *   hands the screen its address. An episode already fetching or ready isn't
 *   fetched again; one that failed is fetched again from the start.
 * - **Share** hands the fetched file to Android's share sheet (the `YouTube`
 *   app takes it from there).
 * - **Save** sends the pasted link only when it reads as a `YouTube` video
 *   (`youtubeLink`, as Studio's Finish reads one), as its one form, and once
 *   home kept it reads the list again, so the episode shows the link as home
 *   holds it.
 */
import { youtubeLink } from "@some-ui/core-utils"

import type {
  Episode,
  FetchFailure,
  LinkSaved,
  ListState,
  PartRead,
  VideosEvent,
  VideosState,
} from "./model"
import { INITIAL, step } from "./model"
import { bringVideo, keptCopy } from "./parts"

/**
 * The phone's copies of one feed's videos, in its cache, by episode key.
 * Every call resolves.
 */
export type VideoFiles = {
  /** How many bytes of an episode's video the phone keeps, or `null`. */
  size: (key: string) => Promise<number | null>
  /** Writes (`first`) or appends a part, as base64; false if it couldn't. */
  put: (key: string, base64: string, first: boolean) => Promise<boolean>
  /** Where a kept video is: `uri` for sharing, `src` for the player. */
  where: (key: string) => Promise<{ uri: string; src: string } | null>
  /**
   * Removes an episode's video from the phone, if it is there; whether no copy
   * is left. Never rejects.
   */
  remove: (key: string) => Promise<boolean>
}

export type VideosPorts = {
  list: () => Promise<ListState>
  part: (
    key: string,
    start: number,
    end: number
  ) => Promise<PartRead | { readonly kind: "away" }>
  files: VideoFiles
  share: (
    uri: string,
    key: string
  ) => Promise<"shared" | "cancelled" | "failed">
  saveLink: (
    key: string,
    link: string
  ) => Promise<LinkSaved | { readonly kind: "away" }>
  /** The most bytes one part asks for. */
  partBytes: number
}

export type FeedVideos = {
  subscribe: (listener: () => void) => () => void
  getSnapshot: () => VideosState
  /** Reads the list (on open, a drag down, Try again). */
  open: () => Promise<void>
  watch: (key: string) => Promise<void>
  share: (key: string) => Promise<void>
  saveLink: (key: string, pasted: string) => Promise<void>
  /**
   * Lets go of the phone's copy of an episode's video, once My data let home's
   * go (`lib/my-data`), and forgets it was ready.
   */
  forget: (key: string) => Promise<void>
  /** The screen said what it had to say. */
  seen: () => void
}

export function createFeedVideos(ports: VideosPorts): FeedVideos {
  let state = INITIAL
  const listeners = new Set<() => void>()
  const dispatch = (event: VideosEvent): void => {
    state = step(state, event)
    for (const listener of listeners) listener()
  }
  const episodeOf = (key: string): Episode | undefined =>
    state.list.kind === "read"
      ? state.list.episodes.find((episode) => episode.key === key)
      : undefined

  /** An episode whose whole video the phone keeps reads as ready. */
  const kept = async (episode: Episode): Promise<boolean> => {
    if (episode.videoBytes === null) return false
    const where = await keptCopy(ports.files, episode.key, episode.videoBytes)
    if (where === null) return false
    dispatch({
      type: "fetchMoved",
      key: episode.key,
      fetch: { kind: "ready", ...where },
    })
    return true
  }

  /** Each episode's fetch while it runs, and the episodes `forget` is stopping. */
  const fetching = new Map<string, Promise<void>>()
  const stopping = new Set<string>()

  const failed = (key: string, why: FetchFailure): void => {
    dispatch({ type: "fetchMoved", key, fetch: { kind: "failed", why } })
  }

  const open = async (): Promise<void> => {
    dispatch({ type: "listAsked" })
    const list = await ports.list()
    dispatch({ type: "listEnded", list })
    if (list.kind !== "read") return
    for (const episode of list.episodes) {
      const now = state.fetches[episode.key]
      if (now === undefined) {
        await kept(episode)
      } else if (now.kind === "ready" && !(await kept(episode))) {
        // Android may clear the cache while the app stays open: Watch
        // fetches it again.
        dispatch({ type: "fetchForgotten", key: episode.key })
      }
    }
  }

  const fetchVideo = (episode: Episode, total: number): Promise<void> =>
    bringVideo(
      {
        files: ports.files,
        part: (start, end) => ports.part(episode.key, start, end),
        partBytes: ports.partBytes,
        stopped: () => stopping.has(episode.key),
        moved: (fetch) => {
          dispatch({ type: "fetchMoved", key: episode.key, fetch })
        },
      },
      episode.key,
      total
    )

  return {
    subscribe(listener): () => void {
      listeners.add(listener)
      return (): void => {
        listeners.delete(listener)
      }
    },
    getSnapshot: () => state,

    open,

    async watch(key): Promise<void> {
      const now = state.fetches[key]
      if (now?.kind === "fetching" || now?.kind === "ready") return
      const episode = episodeOf(key)
      const total = episode?.videoBytes ?? null
      if (episode === undefined || total === null) {
        failed(key, "gone")
        return
      }
      // In flight before the first wait, so a second Watch finds it fetching.
      dispatch({
        type: "fetchMoved",
        key,
        fetch: { kind: "fetching", done: 0, total },
      })
      const run = fetchVideo(episode, total)
      fetching.set(key, run)
      try {
        await run
      } finally {
        fetching.delete(key)
      }
    },

    async share(key): Promise<void> {
      const now = state.fetches[key]
      if (now?.kind !== "ready") return
      const shared = await ports.share(now.uri, key)
      if (shared === "failed") dispatch({ type: "shareFailed", key })
    },

    async saveLink(key, pasted): Promise<void> {
      if (state.links[key]?.kind === "saving") return
      // The one reading of a YouTube link (`youtubeLink`, as Finish's).
      const link = youtubeLink(pasted)
      if (link === null) {
        dispatch({ type: "linkEnded", key, saved: { kind: "notAVideo" } })
        return
      }
      dispatch({ type: "linkSaving", key })
      const saved = await ports.saveLink(key, link)
      dispatch({ type: "linkEnded", key, saved })
      // Read again, so the episode shows the link as home kept it.
      if (saved.kind === "saved") await open()
    },

    async forget(key): Promise<void> {
      // A fetch still running would write its part after the file went:
      // stop it, and wait for the write it is in.
      stopping.add(key)
      try {
        await fetching.get(key)
        if (await ports.files.remove(key)) {
          dispatch({ type: "fetchForgotten", key })
        } else if (state.fetches[key]?.kind === "fetching") {
          // The fetch it stopped left a part that wouldn't go.
          failed(key, "phone")
        }
      } finally {
        stopping.delete(key)
      }
    },

    seen(): void {
      dispatch({ type: "saidSeen" })
    },
  }
}
