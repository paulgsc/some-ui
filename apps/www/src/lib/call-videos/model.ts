/**
 * Studio's feed videos (ST38, #2661; FEED4, #2647): the episodes home holds
 * of each feed (`FEEDS`), as the screen reads them, and what the screen is
 * doing with each. Pure, so every answer
 * and every turn of the screen is held by a test; the runtime (`./runtime`)
 * owns the requests and the phone's files, one per feed.
 */
import type { HomeAnswer } from "@some-ui/core-utils"
import { assertNever, readAs } from "@some-ui/core-utils"
import { z } from "zod"

export const FEEDS = ["call", "playoff-delta"] as const

/** A feed, as home's routes name it (`/feeds/:feed/videos`). */
export type Feed = (typeof FEEDS)[number]

/** Whether `value` names a feed (a link's `?videos`, say). */
export const isFeed = (value: unknown): value is Feed =>
  FEEDS.some((feed) => feed === value)

const LinkSchema = z.object({
  url: z.string().min(1),
  recordedAt: z.string().min(1),
})

const ReceiptSchema = z.object({
  key: z.string().min(1),
  step: z.enum(["video", "rest"]),
  url: z.string().min(1),
  size: z.number().int().nonnegative(),
  deletedAt: z.string().min(1),
})

const EpisodeSchema = z.object({
  key: z.string().min(1),
  videoBytes: z.number().int().nonnegative().nullable(),
  restBytes: z.number().int().nonnegative().nullable(),
  link: LinkSchema.nullable(),
  receipts: z.array(ReceiptSchema),
})

const EpisodesSchema = z.object({ episodes: z.array(EpisodeSchema) })

/** An episode of a feed, as home lists it (`GET /feeds/:feed/videos`). */
export type Episode = z.infer<typeof EpisodeSchema>

/** What home's list says. */
export type EpisodesRead =
  | { readonly kind: "read"; readonly episodes: ReadonlyArray<Episode> }
  /** A home from before each feed's videos: it serves no such path. */
  | { readonly kind: "older" }
  | { readonly kind: "unreadable" }

export function readEpisodes(answer: HomeAnswer): EpisodesRead {
  if (answer.status === 404) return { kind: "older" }
  if (answer.status !== 200) return { kind: "unreadable" }
  const read = readAs(EpisodesSchema, answer.body)
  return read === null
    ? { kind: "unreadable" }
    : { kind: "read", episodes: read.episodes }
}

/** What a part of a video asked of home came to. */
export type PartRead =
  | { readonly kind: "bytes"; readonly base64: string }
  /** Home no longer has the video (let go since the list was read). */
  | { readonly kind: "gone" }
  | { readonly kind: "unreadable" }

export function readPart(answer: HomeAnswer): PartRead {
  if (answer.status === 404) return { kind: "gone" }
  if (answer.status !== 206 && answer.status !== 200) {
    return { kind: "unreadable" }
  }
  return answer.body === ""
    ? { kind: "unreadable" }
    : { kind: "bytes", base64: answer.body }
}

/** What saving a pasted link came to. */
export type LinkSaved =
  | { readonly kind: "saved"; readonly url: string }
  /** Home read no `YouTube` video in it. */
  | { readonly kind: "notAVideo" }
  | { readonly kind: "unreadable" }

const KeptSchema = z.object({ url: z.string().min(1) })

export function readLinkSaved(answer: HomeAnswer): LinkSaved {
  if (answer.status === 422) return { kind: "notAVideo" }
  if (answer.status !== 200) return { kind: "unreadable" }
  const kept = readAs(KeptSchema, answer.body)
  return kept === null
    ? { kind: "unreadable" }
    : { kind: "saved", url: kept.url }
}

/** Where an episode stands on home. */
export type Standing =
  /** Home has the episode's words but no video yet. */
  | "waiting"
  /** Home has the video. */
  | "kept"
  /** The video was let go; its link is where it lives now. */
  | "letGo"

export function standing(episode: Episode): Standing {
  if (episode.receipts.some((receipt) => receipt.step === "video")) {
    return "letGo"
  }
  return episode.videoBytes === null ? "waiting" : "kept"
}

/** The list, as the screen shows it. */
export type ListState =
  | { readonly kind: "reading" }
  | { readonly kind: "read"; readonly episodes: ReadonlyArray<Episode> }
  | { readonly kind: "unpaired" }
  | { readonly kind: "away" }
  | { readonly kind: "older" }
  | { readonly kind: "unreadable" }

/** An episode's video on the phone. */
export type Fetch =
  | { readonly kind: "fetching"; readonly done: number; readonly total: number }
  /** In the phone's cache, at `src` for the player and `uri` for sharing. */
  | { readonly kind: "ready"; readonly uri: string; readonly src: string }
  | { readonly kind: "failed"; readonly why: FetchFailure }

export type FetchFailure =
  /** Home didn't answer. */
  | "away"
  /** Home no longer has the video. */
  | "gone"
  /** The phone couldn't keep it (full, or the files refused). */
  | "phone"

/** An episode's link being saved. */
export type LinkSave =
  | { readonly kind: "saving" }
  | { readonly kind: "notAVideo" }
  | { readonly kind: "away" }

/** What the screen says once, over itself (a `Notice`). */
type Said =
  | { readonly kind: "linkSaved"; readonly key: string }
  | { readonly kind: "shareFailed"; readonly key: string }

/** One feed's screen; `fetches` and `links` are by episode key. */
export type VideosState = {
  readonly list: ListState
  readonly fetches: Readonly<Partial<Record<string, Fetch>>>
  readonly links: Readonly<Partial<Record<string, LinkSave>>>
  readonly said: Said | null
}

export const INITIAL: VideosState = {
  list: { kind: "reading" },
  fetches: {},
  links: {},
  said: null,
}

export type VideosEvent =
  | { readonly type: "listAsked" }
  | { readonly type: "listEnded"; readonly list: ListState }
  | {
      readonly type: "fetchMoved"
      readonly key: string
      readonly fetch: Fetch
    }
  | { readonly type: "linkSaving"; readonly key: string }
  | {
      readonly type: "linkEnded"
      readonly key: string
      readonly saved: LinkSaved | { readonly kind: "away" }
    }
  /** The phone no longer holds an episode it had (its cache was cleared). */
  | { readonly type: "fetchForgotten"; readonly key: string }
  | { readonly type: "shareFailed"; readonly key: string }
  | { readonly type: "saidSeen" }

function without<T>(
  record: Readonly<Partial<Record<string, T>>>,
  key: string
): Partial<Record<string, T>> {
  const { [key]: _gone, ...rest } = record
  return rest
}

/** The screen's one way to change. */
export function step(state: VideosState, event: VideosEvent): VideosState {
  switch (event.type) {
    case "listAsked": {
      // A list already read stays on screen while it is read again.
      return state.list.kind === "read"
        ? state
        : { ...state, list: { kind: "reading" } }
    }
    case "listEnded": {
      return { ...state, list: event.list }
    }
    case "fetchMoved": {
      return {
        ...state,
        fetches: { ...state.fetches, [event.key]: event.fetch },
      }
    }
    case "fetchForgotten": {
      return { ...state, fetches: without(state.fetches, event.key) }
    }
    case "linkSaving": {
      return {
        ...state,
        links: { ...state.links, [event.key]: { kind: "saving" } },
      }
    }
    case "linkEnded": {
      const { saved, key } = event
      if (saved.kind === "saved") {
        // The runtime reads the list again, so the episode shows home's link.
        return {
          ...state,
          links: without(state.links, key),
          said: { kind: "linkSaved", key },
        }
      }
      return {
        ...state,
        links: {
          ...state.links,
          [key]:
            saved.kind === "notAVideo"
              ? { kind: "notAVideo" }
              : { kind: "away" },
        },
      }
    }
    case "shareFailed": {
      return { ...state, said: { kind: "shareFailed", key: event.key } }
    }
    case "saidSeen": {
      return { ...state, said: null }
    }
    default: {
      return assertNever(event)
    }
  }
}
