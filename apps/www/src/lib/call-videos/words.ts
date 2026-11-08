/**
 * What Studio's feed videos say (ST38, FEED4): every word in one pure table, in
 * the person's terms, held by its test to no machinery (`MACHINERY`). What
 * every feed's screen says is `VIDEOS_WORDS`; what differs by feed (its name,
 * what an episode is called, how one is labelled) is `FEED_WORDS`.
 */
import { addDays } from "@some-ui/core-utils"

import { FEED_FACTS } from "@/lib/studio-index/words"

import type { Feed, FetchFailure } from "./model"

/** A share of `done` of `total`, below a hundred until it is whole. */
export function share(done: number, total: number): number {
  if (total <= 0) return 0
  return Math.min(99, Math.floor((done / total) * 100))
}

/** A week of the call by its days (its key is its first), or `null`. */
function callWeek(key: string): string | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(key) ? `${key} to ${addDays(key, 6)}` : null
}

/**
 * A week of Playoff Delta by its season and week (its key is
 * `<season>-<team>-<NN>`; week `00` is the legend, the season's opening), or
 * `null`. The team's code is left out: it isn't a word the person reads.
 */
function playoffDeltaWeek(key: string): string | null {
  const parts = /^(\d{4})-[A-Za-z]+-(\d{2})$/.exec(key)
  if (parts === null) return null
  const [, season = "", week = ""] = parts
  const n = Number(week)
  return n === 0 ? `${season}, the legend` : `${season}, week ${String(n)}`
}

type FeedWords = {
  readonly heading: string
  readonly intro: string
  readonly unpaired: string
  readonly older: string
  readonly none: string
  /**
   * An episode by its days or its season and week, or `null` for a key that
   * reads as neither, which is never shown.
   */
  readonly week: (key: string) => string | null
  /** An episode, by its key: its `week`, or a plain word. */
  readonly label: (key: string) => string
  readonly waiting: string
  readonly linkSaved: string
  readonly letGo: string
  readonly shareTitle: (key: string) => string
  /** What a drag down couldn't read again. */
  readonly what: string
}

export const FEED_WORDS = {
  call: {
    heading: FEED_FACTS.call.name,
    intro:
      "Home makes each week's video. Watch it here, share it to YouTube, then save its link, and the week can be let go from My data.",
    unpaired: "Pair this phone with home to see the call's videos.",
    older:
      "Home doesn't keep the call's videos yet. Update home, then try again.",
    none: "Home hasn't made a video of the call yet.",
    week: callWeek,
    label: (key: string): string => callWeek(key) ?? "This week",
    waiting: "Home is still making this week's video.",
    linkSaved: "Saved. Home keeps the link with the week.",
    letGo: "You let home's copy go. The week lives on YouTube.",
    shareTitle: (key: string): string =>
      callWeek(key) === null
        ? "The weekly call"
        : `The weekly call, the week of ${key}`,
    what: "the call's videos",
  },
  "playoff-delta": {
    heading: FEED_FACTS["playoff-delta"].name,
    intro:
      "Home makes each week's episode. Watch it here, share it to YouTube, then save its link, and the episode can be let go from My data.",
    unpaired: "Pair this phone with home to see Playoff Delta's videos.",
    older:
      "Home doesn't keep Playoff Delta's videos yet. Update home, then try again.",
    none: "Home hasn't made an episode of Playoff Delta yet.",
    week: playoffDeltaWeek,
    label: (key: string): string => playoffDeltaWeek(key) ?? "This episode",
    waiting: "Home is still making this episode.",
    linkSaved: "Saved. Home keeps the link with the episode.",
    letGo: "You let home's copy go. The episode lives on YouTube.",
    shareTitle: (key: string): string => {
      const week = playoffDeltaWeek(key)
      return week === null ? "Playoff Delta" : `Playoff Delta, ${week}`
    },
    what: "Playoff Delta's videos",
  },
} as const satisfies Record<Feed, FeedWords>

export const VIDEOS_WORDS = {
  reading: "Reading what home has…",
  away: "Home didn't answer. Try again in a moment.",
  unreadable: "Home's answer couldn't be read. Try again.",
  tryAgain: "Try again",
  watch: "Watch",
  bringing: (done: number, total: number): string =>
    `Bringing it to the phone, ${String(share(done, total))}%`,
  failed: {
    away: "Home stopped answering. Watch again to start over.",
    gone: "Home no longer has this video.",
    phone:
      "The phone couldn't keep the video. Free some space and watch again.",
  } satisfies Record<FetchFailure, string>,
  share: "Share to YouTube",
  shareFailed: "The share sheet didn't open. Try again.",
  linkLabel: "Its YouTube link",
  linkHint: "Paste the link YouTube gives the video once it's up.",
  save: "Save the link",
  saving: "Saving…",
  notAVideo: "That isn't a link to a YouTube video.",
  linkAway: "Home didn't answer, so the link isn't saved. Try again.",
  onYouTube: "Watch on YouTube",
  /** Its chapters, for the upload's YouTube description (SFEED4). */
  chapters: "Its chapters",
  chaptersLine:
    "Paste them into the YouTube description when you upload it, and YouTube shows each as a chapter.",
  chaptersWhat: "the chapters",
} as const
