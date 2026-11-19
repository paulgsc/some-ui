/**
 * Studio's Episodes, by week (EPISODES2, #3067; design A of #3030): every
 * feed's episodes in one feed, the newest week first, filtered to one genre
 * by a chip. Pure: it reads each feed's list as `lib/call-videos` holds it
 * and says what the page shows, so every grouping and every count is held by
 * its test; the page (`components/studio/episodes-by-week`) only draws it.
 *
 * An episode is placed by the day home knows for it (`Episode.date`, C416),
 * else by the day its key names (`keyDay`); a Playoff Delta key names none,
 * so such a one is listed after the dated weeks, never at a guessed one. Nothing here makes
 * up a length: a row shows one only where home sends it.
 */
import { assertNever, isoWeekMonday, weekOf } from "@some-ui/core-utils"
import { WEEK_ID } from "@some-ui/rust-rounds/entry"
import type { DotMeaning } from "@some-ui/shared"

import type { Episode, ListState } from "@/lib/call-videos/model"
import { standing } from "@/lib/call-videos/model"
import { isDay, isEssayKey } from "@/lib/cards-essay-key"
import type { Feed } from "@/lib/feeds"
import { FEEDS_A_TO_Z } from "@/lib/studio-index"

/** What the chip bar filters to: every genre, or one feed. */
export type Chip = "all" | Feed

/** One row of the page: an episode, with its parts where it is a series. */
export type Row = {
  readonly feed: Feed
  /** What its parts are a part of: the call's week, else its own key. */
  readonly week: string
  /** Its parts, the first first; one for an episode of one, never none. */
  readonly parts: ReadonlyArray<Episode>
  /** The day it is placed by, or `null` where nothing honestly gives one. */
  readonly day: string | null
}

/** A week of rows, the Monday it starts on, newest row first. */
type WeekGroup = {
  readonly monday: string
  readonly rows: ReadonlyArray<Row>
}

/** A feed whose list couldn't be shown, and why. */
export type Trouble = {
  readonly feed: Feed
  readonly kind: "away" | "busy" | "older" | "unreadable"
}

/** What the page shows. */
export type FeedView =
  /** The phone isn't paired, so no feed can be read. */
  | { readonly kind: "unpaired" }
  | {
      readonly kind: "shown"
      /** Each chip's count of rows, over every feed read, whatever the chip. */
      readonly counts: Readonly<Record<Chip, number>>
      readonly weeks: ReadonlyArray<WeekGroup>
      /** Rows nothing dates (Playoff Delta's, until home says), A to Z. */
      readonly undated: ReadonlyArray<Row>
      readonly trouble: ReadonlyArray<Trouble>
      /** Whether a feed the chip shows is still being read. */
      readonly reading: boolean
    }

/** Every feed's list, as each feed's runtime holds it. */
export type FeedLists = Readonly<Record<Feed, ListState>>

/** The day an episode's key names, as `Episode.date` would, or `null`. */
export function keyDay(feed: Feed, week: string): string | null {
  switch (feed) {
    case "call": {
      return isDay(week) ? week : null
    }
    case "interview-essay":
    case "report":
    case "rust-essay": {
      // `2026-w46`, or the report's `2026-W46`: dated by its Monday.
      if (!WEEK_ID.test(week.toLowerCase())) return null
      try {
        return isoWeekMonday(week.toUpperCase())
      } catch {
        // A week 53 in a year of 52: no day it names.
        return null
      }
    }
    case "cards-essay": {
      return isEssayKey(week) ? week.slice(-10) : null
    }
    case "playoff-delta": {
      return null
    }
    default: {
      return assertNever(feed)
    }
  }
}

/** A feed's episodes as rows: a week's parts together, home's order kept. */
export function rowsOf(
  feed: Feed,
  episodes: ReadonlyArray<Episode>
): Array<Row> {
  const weeks = new Map<string, Array<Episode>>()
  for (const episode of episodes) {
    const week = episode.week ?? episode.key
    const parts = weeks.get(week)
    if (parts === undefined) weeks.set(week, [episode])
    else parts.push(episode)
  }
  return [...weeks].map(([week, parts]) => {
    const ordered = [...parts].sort((a, b) => (a.part ?? 1) - (b.part ?? 1))
    const sent = ordered.find(
      (part) => typeof part.date === "string" && isDay(part.date)
    )?.date
    return { feed, week, parts: ordered, day: sent ?? keyDay(feed, week) }
  })
}

/** What an episode's dot can say: the shared table's meanings Episodes uses. */
export type EpisodeStatus = Extract<DotMeaning, "home" | "out" | "making">

/** A part's dot: being made, on home, or out on YouTube. */
export function partStatus(episode: Episode): EpisodeStatus {
  const stands = standing(episode)
  switch (stands) {
    case "waiting": {
      return "making"
    }
    case "letGo": {
      return "out"
    }
    case "kept": {
      return episode.link === null ? "home" : "out"
    }
    default: {
      return assertNever(stands)
    }
  }
}

/**
 * A row's dot: being made while any part is, else on home while any part
 * isn't out yet, else out.
 */
export function rowStatus(row: Row): EpisodeStatus {
  const each = row.parts.map(partStatus)
  if (each.includes("making")) return "making"
  if (each.includes("home")) return "home"
  return "out"
}

/**
 * How long a row runs, where home says: a week's whole length while home
 * holds every part (`weekDurationMs`), else the sum of its parts' where home
 * says each; else `null`.
 */
export function rowLength(row: Row): number | null {
  const week = row.parts[0].weekDurationMs
  if (typeof week === "number") return week
  let total = 0
  for (const part of row.parts) {
    if (typeof part.durationMs !== "number") return null
    total += part.durationMs
  }
  return total
}

const order = (feed: Feed): number => FEEDS_A_TO_Z.indexOf(feed)

/** The newest day first; on the same day, the feeds A to Z. */
function newestFirst(a: Row, b: Row): number {
  const byDay = (b.day ?? "").localeCompare(a.day ?? "")
  return byDay === 0 ? order(a.feed) - order(b.feed) : byDay
}

/** What the page shows of every feed's list, filtered to `chip`. */
export function feedView(lists: FeedLists, chip: Chip): FeedView {
  if (FEEDS_A_TO_Z.some((feed) => lists[feed].kind === "unpaired")) {
    return { kind: "unpaired" }
  }
  const shows = (feed: Feed): boolean => chip === "all" || chip === feed
  const counts: Record<Chip, number> = {
    all: 0,
    call: 0,
    "cards-essay": 0,
    "interview-essay": 0,
    "playoff-delta": 0,
    report: 0,
    "rust-essay": 0,
  }
  const rows: Array<Row> = []
  const trouble: Array<Trouble> = []
  let reading = false
  for (const feed of FEEDS_A_TO_Z) {
    const list = lists[feed]
    switch (list.kind) {
      case "read": {
        const own = rowsOf(feed, list.episodes)
        counts[feed] = own.length
        counts.all += own.length
        if (shows(feed)) rows.push(...own)
        break
      }
      case "reading": {
        reading ||= shows(feed)
        break
      }
      case "away":
      case "busy":
      case "older":
      case "unreadable": {
        if (shows(feed)) trouble.push({ feed, kind: list.kind })
        break
      }
      case "unpaired": {
        break
      }
      default: {
        assertNever(list)
      }
    }
  }
  const dated = rows.filter((row) => row.day !== null).sort(newestFirst)
  const weeks: Array<WeekGroup> = []
  for (const row of dated) {
    const monday = weekOf(row.day ?? "")
    const last = weeks.at(-1)
    if (last?.monday === monday) {
      weeks[weeks.length - 1] = { monday, rows: [...last.rows, row] }
    } else {
      weeks.push({ monday, rows: [row] })
    }
  }
  const undated = rows.filter((row) => row.day === null)
  return { kind: "shown", counts, weeks, undated, trouble, reading }
}
