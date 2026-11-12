/**
 * What Studio's feed videos say (ST38, FEED4): every word in one pure table, in
 * the person's terms, held by its test to no machinery (`MACHINERY`). What
 * every feed's screen says is `VIDEOS_WORDS`; what differs by feed (its name,
 * what an episode is called, how one is labelled) is `FEED_WORDS`.
 */
import { addDays } from "@some-ui/core-utils"
import { WEEK_ID, weekNumber } from "@some-ui/rust-rounds/entry"

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

/**
 * A week of Rust Rounds by its year and number (its key is `<year>-w<NN>`),
 * or `null`.
 */
function rustWeek(key: string): string | null {
  return WEEK_ID.test(key)
    ? `${key.slice(0, 4)}, week ${String(weekNumber(key))}`
    : null
}

type FeedWords = {
  readonly heading: string
  readonly intro: string
  /** Said wherever its episodes are listed when they hold the owner's own voice, else `null`. */
  readonly voice: string | null
  readonly unpaired: string
  readonly older: string
  readonly none: string
  /** On an episode's page, when home's list has no such episode. */
  readonly gone: string
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
    voice: null,
    unpaired: "Pair this phone with home to see the call's videos.",
    older:
      "Home doesn't keep the call's videos yet. Update home, then try again.",
    none: "Home hasn't made a video of the call yet.",
    gone: "Home doesn't have this episode any more.",
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
    voice: null,
    unpaired: "Pair this phone with home to see Playoff Delta's videos.",
    older:
      "Home doesn't keep Playoff Delta's videos yet. Update home, then try again.",
    none: "Home hasn't made an episode of Playoff Delta yet.",
    gone: "Home doesn't have this episode any more.",
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
  "rust-essay": {
    heading: FEED_FACTS["rust-essay"].name,
    intro:
      "Home makes each week's essay once the week has closed. Watch it here, share it to YouTube, then save its link, and the essay can be let go from My data.",
    voice:
      "Its video holds your voice: every take you sent that week plays in it, whole.",
    unpaired: "Pair this phone with home to see the Rust Rounds essays.",
    older:
      "Home doesn't keep the Rust Rounds essays yet. Update home, then try again.",
    none: "Home hasn't made an essay yet. Each comes after its week has closed.",
    gone: "This essay isn't among home's essays. Home lists each once its week has closed and Claude has written it.",
    week: rustWeek,
    label: (key: string): string => rustWeek(key) ?? "This essay",
    waiting: "Home is still making this week's essay.",
    linkSaved: "Saved. Home keeps the link with the week.",
    letGo: "You let home's copy go. The essay lives on YouTube.",
    shareTitle: (key: string): string => {
      const week = rustWeek(key)
      return week === null ? "Rust Rounds" : `Rust Rounds, ${week}`
    },
    what: "the Rust Rounds essays",
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
