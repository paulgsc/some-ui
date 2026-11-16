/**
 * What Studio's Episodes, by week, says (EPISODES2, #3067): every word in one
 * pure table, in the person's terms, held by its test to no machinery. A
 * feed's own words (its name, how an episode is called, what it says while
 * home can't give it) stay `FEED_WORDS` (`lib/call-videos/words`); these are
 * the page's chips, weeks, rows and dots.
 */
import {
  addDays,
  counted,
  formatDay,
  formatTimecode,
} from "@some-ui/core-utils"
import type { DotMeaning } from "@some-ui/shared"

import { FEED_WORDS, VIDEOS_WORDS } from "@/lib/call-videos/words"
import type { Feed } from "@/lib/feeds"

import type { Trouble } from "./index"

export const EPISODES_FEED_WORDS = {
  /** What the chip bar is, for a screen reader. */
  chips: "Genres",
  all: "All",
  /** Each genre's chip: short, so the bar holds them. */
  genre: {
    call: "Weekly call",
    "cards-essay": "Cards essays",
    "interview-essay": "Interview essays",
    "playoff-delta": "Playoff Delta",
    "rust-essay": "Rust Rounds",
  } satisfies Record<Feed, string>,
  /** A chip as a screen reader says it, with its count. */
  chipLabel: (name: string, n: number): string =>
    `${name}, ${counted(n, "episode")}`,
  /** A week's heading: this week's, or the Monday it starts on. */
  week: (monday: string, thisMonday: string): string =>
    monday === thisMonday ? "This week" : `Week of ${formatDay(monday)}`,
  /** Under a week's heading: its days and how many episodes it holds. */
  weekLine: (monday: string, n: number): string =>
    `${formatDay(monday)} to ${formatDay(addDays(monday, 6))} · ${counted(n, "episode")}`,
  undated: "Not dated yet",
  undatedLine:
    "Home doesn't say which week these belong to, so they're listed here, newest first.",
  /** A row's dot, in words beside it. */
  status: {
    home: "On home",
    out: "On YouTube",
    making: "Being made",
  } satisfies Record<DotMeaning, string>,
  /** A row of a week in parts: how many, and how many are up. */
  parts: (of: number, out: number): string =>
    out === of
      ? `${String(of)} parts, all on YouTube`
      : `${String(of)} parts, ${String(out)} on YouTube`,
  /** Over a thumbnail, for a week in parts. */
  partsBadge: (of: number): string => `${String(of)} parts`,
  /** One part's marker on its row. */
  part: (n: number): string => `Part ${String(n)}`,
  /** One part's marker, as a screen reader says it. */
  partLabel: (n: number, status: string): string =>
    `Part ${String(n)}: ${status}`,
  /** How long it runs, where home says. */
  length: (ms: number): string => formatTimecode(ms),
  voice: "Your voice",
  /**
   * Where a feed couldn't be read: beside the episodes shown, or `alone`,
   * with none shown.
   */
  trouble: ({ feed, kind }: Trouble, alone: boolean): string =>
    kind === "older"
      ? FEED_WORDS[feed].older
      : alone
        ? `Home couldn't give ${FEED_WORDS[feed].what}. Try again in a moment.`
        : `Home couldn't give ${FEED_WORDS[feed].what}. The rest are here.`,
  tryAgain: VIDEOS_WORDS.tryAgain,
  reading: VIDEOS_WORDS.reading,
  unpaired: "Pair this phone with home to see your episodes.",
  noneAtAll: "Home hasn't made a video of any feed yet.",
  /** One genre, with none yet. */
  none: (feed: Feed): string => FEED_WORDS[feed].none,
} as const
