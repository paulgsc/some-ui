/**
 * What Studio's feed videos say (ST38, FEED4): every word in one pure table, in
 * the person's terms, held by its test to no machinery (`MACHINERY`). What
 * every feed's screen says is `VIDEOS_WORDS`; what differs by feed (its name,
 * what an episode is called, how one is labelled) is `FEED_WORDS`.
 */
import { addDays, isoWeeksIn } from "@some-ui/core-utils"
import { WEEK_ID, weekNumber } from "@some-ui/rust-rounds/entry"

import { essayName, isEssayKey } from "@/lib/cards-essay-key"
import { FEED_FACTS } from "@/lib/studio-index/words"

import type { Produced, ShownAsset } from "./assets"
import type { Episode, Feed, FetchFailure } from "./model"

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
 * An ISO week by its year and number, or `null`, in each feed's own
 * spelling: a week of Rust Rounds or of the interview essay is
 * `<year>-w<NN>`, of the engagement report `<year>-W<NN>`, as home keys it.
 */
function isoWeek(key: string, letter: "w" | "W"): string | null {
  if (key.charAt(5) !== letter) return null
  const week = key.toLowerCase()
  if (!WEEK_ID.test(week)) return null
  const year = week.slice(0, 4)
  const n = weekNumber(week)
  // A week 53 in a year of 52 names no week, as `keyDay` reads it.
  return n <= isoWeeksIn(Number(year)) ? `${year}, week ${String(n)}` : null
}

/**
 * A cards essay by its subject and the day it was checked (its key is
 * `<slug>-<YYYY-MM-DD>`; C356), or `null`.
 */
function cardsEssay(key: string): string | null {
  return isEssayKey(key) ? essayName(key) : null
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
    week: (key: string) => isoWeek(key, "w"),
    label: (key: string): string => isoWeek(key, "w") ?? "This essay",
    waiting: "Home is still making this week's essay.",
    linkSaved: "Saved. Home keeps the link with the week.",
    letGo: "You let home's copy go. The essay lives on YouTube.",
    shareTitle: (key: string): string => {
      const week = isoWeek(key, "w")
      return week === null ? "Rust Rounds" : `Rust Rounds, ${week}`
    },
    what: "the Rust Rounds essays",
  },
  "interview-essay": {
    heading: FEED_FACTS["interview-essay"].name,
    intro:
      "Home makes each week's essay once the interview week's deadline has passed. Watch it here, share it to YouTube, then save its link.",
    voice:
      "Its video holds your voice: every take you sent that week plays in it, whole.",
    unpaired: "Pair this phone with home to see the interview essays.",
    older:
      "Home doesn't keep the interview essays yet. Update home, then try again.",
    none: "Home hasn't made an interview essay yet. Each comes once its week's deadline has passed.",
    gone: "This essay isn't among home's interview essays.",
    week: (key: string) => isoWeek(key, "w"),
    label: (key: string): string => isoWeek(key, "w") ?? "This essay",
    waiting: "Home is still making this week's essay.",
    linkSaved: "Saved. Home keeps the link with the week.",
    letGo: "You let home's copy go. The essay lives on YouTube.",
    shareTitle: (key: string): string => {
      const week = isoWeek(key, "w")
      return week === null
        ? "The interview essay"
        : `The interview essay, ${week}`
    },
    what: "the interview essays",
  },
  report: {
    heading: FEED_FACTS.report.name,
    intro:
      "Home makes each week's report from what you used, once the week has ended. Watch it here, share it to YouTube, then save its link, and home's copy can be let go from My data.",
    voice: null,
    unpaired: "Pair this phone with home to see your engagement reports.",
    older:
      "Home doesn't keep the engagement reports yet. Update home, then try again.",
    none: "Home hasn't made a report yet. Each comes after its week has ended.",
    gone: "This report isn't among home's reports. Home makes each once its week has ended, and only for a week this phone sent home what you used.",
    week: (key: string) => isoWeek(key, "W"),
    label: (key: string): string => isoWeek(key, "W") ?? "This report",
    waiting: "Home is still making this report.",
    linkSaved: "Saved. Home keeps the link with the week.",
    letGo: "You let home's copy go. The report lives on YouTube.",
    shareTitle: (key: string): string => {
      const week = isoWeek(key, "W")
      return week === null
        ? "The engagement report"
        : `The engagement report, ${week}`
    },
    what: "your engagement reports",
  },
  "cards-essay": {
    heading: FEED_FACTS["cards-essay"].name,
    intro:
      "Home makes each cards essay's video once the essay reaches it. Watch it here, share it to YouTube, then save its link. Home keeps every one until a recording it plays is deleted or let go: then its video goes from home, and home won't list or make it again.",
    voice: null,
    unpaired: "Pair this phone with home to see the cards essays.",
    older:
      "Home doesn't list the cards essays here yet. Update home, then try again. Studio › Renders plays them meanwhile.",
    none: "Home hasn't made a cards essay yet.",
    gone: "This essay isn't among home's cards essays. Home stops listing an essay once a recording it plays is deleted or let go.",
    week: cardsEssay,
    label: (key: string): string => cardsEssay(key) ?? "This essay",
    waiting: "Home is still making this essay's video.",
    linkSaved: "Saved. Home keeps the link with the essay.",
    // Never said yet: no cards essay is let go (#2999).
    letGo: "You let home's copy go. The essay lives on YouTube.",
    shareTitle: (key: string): string => {
      const name = cardsEssay(key)
      return name === null ? "A cards essay" : `A cards essay: ${name}`
    },
    what: "the cards essays",
  },
} as const satisfies Record<Feed, FeedWords>

/** A part of a series, after what it is a part of: "part 2 of 3". */
const partOf = (part: number, of: number): string =>
  `part ${String(part)} of ${String(of)}`

/**
 * An episode as its lists and page name it: the title home gives it, where
 * its feed has one (a cards essay's), else its feed's `label` of what it is
 * a part of, with which part once its week is a series (the call's, #2918).
 */
export function episodeName(
  feed: Feed,
  episode: Pick<Episode, "key" | "title" | "week" | "part" | "of">
): string {
  const title = episode.title?.trim() ?? ""
  if (title !== "") return title
  const label = FEED_WORDS[feed].label(episode.week ?? episode.key)
  const { part = 1, of = 1 } = episode
  return of > 1 ? `${label}, ${partOf(part, of)}` : label
}

export const VIDEOS_WORDS = {
  reading: "Reading what home has…",
  away: "Home didn't answer. Try again in a moment.",
  busy: "This phone was busy with home just then. Try again in a moment.",
  unreadable: "Home's answer couldn't be read. Try again.",
  tryAgain: "Try again",
  watch: "Watch",
  bringing: (done: number, total: number): string =>
    `Bringing it to the phone, ${String(share(done, total))}%`,
  failed: {
    away: "Home stopped answering. Watch again to start over.",
    busy: "This phone was busy with home, so the video stopped coming. Watch again in a moment.",
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
  linkOlder: "Home didn't keep the link. Update home, then try again.",
  onYouTube: "Watch on YouTube",
} as const

/**
 * What an episode's page says of each file its render left beside the video
 * (ASSETS-R, C1300; its chapters, SFEED4), by `AssetView`'s kinds: the file
 * and what to do with it; not made, and whether home can make it now; asked
 * for; tried and not made.
 */
export const ASSET_WORDS = {
  thumbnail: {
    heading: "Its thumbnail",
    there: "Save it, then set it as the video's thumbnail in YouTube Studio.",
    alt: "The episode's thumbnail",
    missing:
      "Home made none with this episode. It can make one now from the episode, and the video stays as it is.",
    asked:
      "Home will make it when it's free, after what it's making now, and keep it with the episode.",
    failed:
      "Home tried and couldn't make one from this episode, and trying again would come out the same.",
  },
  description: {
    heading: "Its chapters",
    there:
      "Paste them into the YouTube description when you upload it, and YouTube shows each as a chapter.",
    what: "the chapters",
    missing:
      "This episode has none: they're made with the video, and it has too few scenes or came before chapters did.",
    asked: "Home will make them with the video, and keep them with it.",
    failed: "Home tried and couldn't make chapters for this episode.",
  },
  generate: "Generate",
  asking: "Asking home…",
  save: "Save",
  saveFailed: "The share sheet didn't open. Try again.",
  produced: {
    asked: "Asked. Home will make it when it's free.",
    older:
      "Home can't make this file for this episode. Update home, then try again.",
    unreadable: "Home didn't answer, so nothing was asked. Try again.",
  } satisfies Record<Produced["kind"], string>,
} as const satisfies {
  readonly [A in ShownAsset]: {
    readonly heading: string
    readonly there: string
    readonly missing: string
    readonly asked: string
    readonly failed: string
  } & Readonly<Record<string, string>>
} & Readonly<Record<string, unknown>>
