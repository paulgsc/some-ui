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
  formatWeekday,
} from "@some-ui/core-utils"

import { FEED_WORDS, VIDEOS_WORDS } from "@/lib/call-videos/words"
import type { DotMeaning } from "@/lib/dot-colours"
import type { Feed } from "@/lib/feeds"

import type { Trouble } from "./index"

const capital = (line: string): string =>
  line.charAt(0).toUpperCase() + line.slice(1)

export const EPISODES_FEED_WORDS = {
  /** What the chip bar is, for a screen reader. */
  chips: "Genres",
  all: "All",
  /** Each genre's chip: short, so the bar holds them. */
  genre: {
    call: "Weekly call",
    "cards-essay": "Cards essays",
    "playoff-delta": "Playoff Delta",
    "rust-essay": "Rust Rounds",
  } satisfies Record<Feed, string>,
  /** A chip as a screen reader says it, with its count. */
  chipLabel: (name: string, n: number): string =>
    `${name}, ${counted(n, "video")}`,
  /** A week's heading: this week's, or the Monday it starts on. */
  week: (monday: string, thisMonday: string): string =>
    monday === thisMonday ? "This week" : `Week of ${formatDay(monday)}`,
  /** Under a week's heading: its days and how many videos it holds. */
  weekLine: (monday: string, n: number): string =>
    `${formatDay(monday)} to ${formatDay(addDays(monday, 6))} · ${counted(n, "video")}`,
  /** Under a row's name: its genre, and the weekday home made it. */
  madeOn: (genre: string, day: string): string =>
    `${genre} · ${formatWeekday(day)}`,
  undated: "Not dated yet",
  undatedLine:
    "Home doesn't say which day these were made, so they're listed here, newest first.",
  /** A row's dot, in words beside it. */
  status: {
    onHome: "On home",
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
  /** Where a feed couldn't be read, beside the feeds that could. */
  trouble: ({ feed, kind }: Trouble): string =>
    kind === "older"
      ? FEED_WORDS[feed].older
      : `${capital(FEED_WORDS[feed].what)} couldn't be read. The rest are here.`,
  tryAgain: VIDEOS_WORDS.tryAgain,
  reading: VIDEOS_WORDS.reading,
  unpaired: "Pair this phone with home to see your episodes.",
  noneAtAll: "Home hasn't made a video of any feed yet.",
  /** One genre, with none yet. */
  none: (feed: Feed): string => FEED_WORDS[feed].none,
} as const
