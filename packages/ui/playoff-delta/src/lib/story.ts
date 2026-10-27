/**
 * The data contract (version 3): one regular-season week, from one team's
 * point of view, already computed. This package only renders it; whatever
 * produces it (paulgsc/server's `crates/playoff_delta`, whose README defines
 * every field) owns the math. `StorySeasonSchema` is the one door data comes
 * in through (`parseStorySeason` for bare data), so a malformed feed fails
 * there rather than mid-render.
 *
 * Vocabulary: a "path" is a way in, win x more games and get in as seed s or
 * better (`paths[x]`, null: none). The "share" is the share of the ways the
 * rest of the season can go in which the team gets in; a result's
 * "leverage" the share as it went minus the share had it gone the other way;
 * a week's "spread" how far its results could have moved the share (their
 * standard deviation over the ways they could have gone).
 */

import { z } from "zod"

const Code = z.string().min(2).max(3)
const Record = z.object({ w: z.number().int(), l: z.number().int() })
const Share = z.number().min(0).max(1)
const Change = z.number().min(-1).max(1)

/** Best seed reachable winning exactly x more games, for x = 0..n. */
const Paths = z.array(z.number().int().min(1).max(7).nullable()).min(1)

const Result = z.object({
  winner: Code,
  loser: Code,
  /** The team's own game, a conference team against the other conference, or two conference teams. */
  kind: z.enum(["own", "exported", "inside"]),
  leverage: Change,
  /** The loser's best moment in the game, when the feed has it. */
  collapse: z
    .object({ peakWinProbability: z.number().min(0).max(1), led: z.boolean() })
    .optional(),
})

const StoryWeekSchema = z.object({
  week: z.number().int().min(1),
  /** Wins and record going into the week. */
  record: Record,
  /** Null on the team's bye. */
  game: z
    .object({
      opponent: Code,
      won: z.boolean(),
      relation: z.enum(["division", "conference", "other"]),
    })
    .nullable(),
  paths: z.object({
    before: Paths,
    after: Paths,
    winsBefore: z.number().int(),
    winsAfter: z.number().int(),
  }),
  share: z.object({
    before: Share,
    after: Share,
    own: Change,
    league: Change,
    /**
     * How far everyone else's results could have moved the share: its
     * standard deviation over the ways they could have gone, the team's own
     * result held.
     */
    spread: Share,
    /** Every way was counted, not a sample. */
    exact: z.boolean(),
  }),
  /** Games left in the league. */
  pending: z.object({ before: z.number().int(), after: z.number().int() }),
  /** Every result this week that can matter, most leverage first. */
  results: z.array(Result),
  /** Next week's games that matter most. */
  next: z.array(
    z.object({ home: Code, away: Code, rootFor: Code, swing: Share })
  ),
  /** What next week can do to the share, before it is played; null once no game is left. */
  stake: z
    .object({
      /** The share if the team wins next week minus if it loses, unsigned; 0 on its bye. */
      own: Share,
      /** The share's standard deviation over the ways next week can go, its own game included. */
      spread: Share,
      exact: z.boolean(),
    })
    .nullable(),
  /** Proven: every way the rest of the season can go gets the team in. False is "not proven". */
  clinched: z.boolean(),
})

export const StorySeasonSchema = z.object({
  version: z.literal(3),
  /** Shown on screen: "2025". */
  label: z.string(),
  seasonLength: z.number().int().min(1),
  team: Code,
  names: z.record(z.string(), z.string()),
  conference: z.string(),
  /** The most ways a sampled share counts. */
  ways: z.number().int().min(1),
  weeks: z.array(StoryWeekSchema).min(1),
})

export type StoryResult = z.infer<typeof Result>
export type StoryWeek = z.infer<typeof StoryWeekSchema>
export type StorySeason = z.infer<typeof StorySeasonSchema>

export const parseStorySeason = (data: unknown): StorySeason =>
  StorySeasonSchema.parse(data)

export const nameOf = (season: StorySeason, code: string): string =>
  season.names[code] ?? code

/** Is any way in left after the week: a seed in the paths row. */
export const wayIn = (week: StoryWeek): boolean =>
  week.paths.after.some((seed) => seed !== null)

/** A loss from ahead: the loser led, or was the likelier winner at some point. */
export const blewIt = (r: StoryResult): boolean =>
  r.collapse !== undefined &&
  (r.collapse.led || r.collapse.peakWinProbability >= 0.5)

/** A share as a percentage: "61.5%". */
export const percent = (share: number): string => `${(share * 100).toFixed(1)}%`

/** A share or a change in it as unsigned points: "9.3". */
export const size = (change: number): string =>
  Math.abs(change * 100).toFixed(1)

/** The sign a change shows as, after rounding to points: 0 when "0.0". */
export function signOf(change: number): -1 | 0 | 1 {
  if (size(change) === "0.0") return 0
  return change > 0 ? 1 : -1
}

/** A change in share as signed points: "+9.3", "−2.9", "0.0". */
export function points(change: number): string {
  const sign = signOf(change)
  return sign === 0 ? "0.0" : `${sign > 0 ? "+" : "−"}${size(change)}`
}

/** The side of a next-week game the call roots against. */
export const against = (g: StoryWeek["next"][number]): string =>
  g.rootFor === g.home ? g.away : g.home

/**
 * The league's results this week that mattered: every one but the team's
 * own, but for those worth "0.0" points (a team that is in or out whatever
 * happens).
 */
export const leagueResults = (week: StoryWeek): ReadonlyArray<StoryResult> =>
  week.results.filter((r) => r.kind !== "own" && signOf(r.leverage) !== 0)

type Call = StoryWeek["next"][number] & { readonly result: StoryResult }

/** Last week's "root for" calls that this week's results settled. */
export function calls(
  season: StorySeason,
  week: StoryWeek
): ReadonlyArray<Call> {
  const last = season.weeks.find((w) => w.week === week.week - 1)
  return (last?.next ?? []).flatMap((n) => {
    const result = week.results.find(
      (r) =>
        (r.winner === n.home && r.loser === n.away) ||
        (r.winner === n.away && r.loser === n.home)
    )
    return result ? [{ ...n, result }] : []
  })
}
