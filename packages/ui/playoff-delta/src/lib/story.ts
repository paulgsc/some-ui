/**
 * The data contract (version 2): one regular-season week, from one team's
 * point of view, already computed. This package only renders it; whatever
 * produces it (paulgsc/server's `crates/playoff_delta`, whose README defines
 * every field) owns the math. `StorySeasonSchema` is the one door data comes
 * in through (`parseStorySeason` for bare data), so a malformed feed fails
 * there rather than mid-render.
 *
 * Vocabulary: a "path" is a way in, win x more games and get in as seed s or
 * better (`paths[x]`, null: none); the "claim" is the first row with one, and
 * the "floor" the final record it implies. The "share" is the share of the
 * ways the rest of the season can go in which the team gets in, and a
 * result's "leverage" the share as it went minus the share had it gone the
 * other way.
 */

import { z } from "zod"

const Code = z.string().min(2).max(3)
const Record = z.object({ w: z.number().int(), l: z.number().int() })
const Share = z.number().min(0).max(1)
const Change = z.number().min(-1).max(1)

/** Best seed reachable winning exactly x more games, for x = 0..n. */
const Paths = z.array(z.number().int().min(1).max(7).nullable()).min(1)

const Claim = z.discriminatedUnion("in", [
  z.object({
    in: z.literal(true),
    wins: z.number().int(),
    extraWins: z.number().int().min(0),
    seed: z.number().int().min(1).max(7),
  }),
  z.object({ in: z.literal(false), wins: z.number().int() }),
])

const Result = z.object({
  winner: Code,
  loser: Code,
  /** The team's own game, a conference team against the other conference, or two conference teams. */
  kind: z.enum(["own", "exported", "inside"]),
  leverage: Change,
  /** Did the other result change the paths, and which way. */
  moved: z.enum(["helped", "hurt"]).nullable(),
  /** The loser's best moment in the game, when the feed has it. */
  collapse: z
    .object({ peakWinProbability: z.number().min(0).max(1), led: z.boolean() })
    .optional(),
})

const Bucket = z.object({
  team: Code,
  wins: z.number().int(),
  /** More wins it can take without passing the team's line. */
  room: z.number().int(),
})
const Pigeonhole = z.object({
  teams: z.array(Bucket),
  /** Games still to play among them. */
  games: z.number().int(),
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
      relation: z.enum(["division", "rival", "conference", "other"]),
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
  /** One way in that is left, and these teams' records the rest of the way. */
  path: z
    .object({
      extraWins: z.number().int(),
      seed: z.number().int(),
      needs: z.array(
        z.object({
          team: Code,
          rest: Record,
          rival: z.boolean(),
          /** This way lets the team finish above: its record is one choice. */
          free: z.boolean(),
        })
      ),
    })
    .nullable(),
  /** Why one fewer final win can't get in, while the claim needs a win. */
  boundary: z
    .object({
      wins: z.number().int(),
      division: z.discriminatedUnion("kind", [
        z.object({ kind: z.literal("above"), team: Code }),
        Pigeonhole.extend({ kind: z.literal("pigeonhole") }),
      ]),
      wildCard: z.object({
        above: z.array(Code),
        pigeonhole: Pigeonhole.nullable(),
        mustPass: z.number().int(),
        /** The best wild card left; past 7, none. */
        seedAtBest: z.number().int(),
        cases: z.number().int(),
      }),
    })
    .nullable(),
  rivals: z.array(
    z.object({
      team: Code,
      game: z.object({ opponent: Code, won: z.boolean() }).nullable(),
      before: Claim,
      after: Claim,
      share: z.object({ before: Share, after: Share }),
    })
  ),
  collisions: z.array(
    z.discriminatedUnion("kind", [
      z.object({
        kind: z.literal("rival-vs-you"),
        home: Code,
        away: Code,
        winner: Code,
        rival: Code,
        worstForRival: Code,
        bestForYou: Code,
      }),
      z.object({
        kind: z.literal("rival-vs-rival"),
        home: Code,
        away: Code,
        winner: Code,
      }),
    ])
  ),
  /** Futility: division mates' and rivals' losses to anyone outside that group. */
  points: z.object({
    week: z.object({ scored: z.number().int(), possible: z.number().int() }),
    season: z.object({ scored: z.number().int(), possible: z.number().int() }),
  }),
  benchmark: z.object({
    lastSeason: Claim,
    lowestBar: z.object({
      team: Code,
      wins: z.number().int(),
      seed: z.number().int(),
    }),
  }),
})

export const StorySeasonSchema = z.object({
  version: z.literal(2),
  /** Shown on screen: "2025". */
  label: z.string(),
  seasonLength: z.number().int().min(1),
  team: Code,
  rivals: z.array(Code),
  names: z.record(z.string(), z.string()),
  conference: z.string(),
  /** The most ways a sampled share counts. */
  ways: z.number().int().min(1),
  weeks: z.array(StoryWeekSchema).min(1),
})

export type StoryClaim = z.infer<typeof Claim>
export type StoryResult = z.infer<typeof Result>
export type StoryWeek = z.infer<typeof StoryWeekSchema>
export type StorySeason = z.infer<typeof StorySeasonSchema>
export type StoryPaths = z.infer<typeof Paths>
export type StoryBucket = z.infer<typeof Bucket>

export const parseStorySeason = (data: unknown): StorySeason =>
  StorySeasonSchema.parse(data)

/** The seeds a path can end at, best first. */
export const SEEDS: ReadonlyArray<number> = [1, 2, 3, 4, 5, 6, 7]

export const nameOf = (season: StorySeason, code: string): string =>
  season.names[code] ?? code

/** Where last week's paths stand: "After week 8", or "Before week 1". */
export const sinceLabel = (week: number): string =>
  week === 1 ? "Before week 1" : `After week ${week - 1}`

/** The claim a paths row implies: the first x with a way in. */
export function claimOf(
  paths: ReadonlyArray<number | null>,
  wins: number
): StoryClaim {
  const x = paths.findIndex((s) => s !== null)
  const seed = paths[x] ?? null
  return seed === null
    ? { in: false, wins }
    : { in: true, wins, extraWins: x, seed }
}

/** The final record a claim implies, e.g. "6–11"; "—" when out. */
export function floorRecord(c: StoryClaim, seasonLength: number): string {
  if (!c.in) return "—"
  const w = c.wins + c.extraWins
  return `${w}–${seasonLength - w}`
}

/** A loss from ahead: the loser led, or was the likelier winner at some point. */
export const blewIt = (r: StoryResult): boolean =>
  r.collapse !== undefined &&
  (r.collapse.led || r.collapse.peakWinProbability >= 0.5)

/** Is the cell (x more wins, seed s) an open path? */
export const isOpen = (
  paths: ReadonlyArray<number | null>,
  x: number,
  seed: number
): boolean => {
  const best = paths[x]
  return best !== null && best !== undefined && seed >= best
}

export type CellChange = "open" | "closed" | "opened" | "pruned"

/**
 * Each cell's change over the week. A win moves every path one win closer, so
 * after a win last week's row x + 1 is this week's row x.
 */
export function cellChanges(
  week: StoryWeek
): ReadonlyArray<ReadonlyArray<CellChange>> {
  const { before, after } = week.paths
  const shift = week.game?.won ? 1 : 0
  return after.map((_, x) =>
    SEEDS.map((s): CellChange => {
      const now = isOpen(after, x, s)
      const px = x + shift
      const was = px < before.length ? isOpen(before, px, s) : now
      if (was && !now) return "pruned"
      if (!was && now) return "opened"
      return now ? "open" : "closed"
    })
  )
}

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

/** Wins a pigeonhole's teams can still take under the line, together. */
export const roomOf = (teams: ReadonlyArray<StoryBucket>): number =>
  teams.reduce((sum, t) => sum + t.room, 0)

/** The side of a next-week game the call roots against. */
export const against = (g: StoryWeek["next"][number]): string =>
  g.rootFor === g.home ? g.away : g.home

/** A week's share moving less than this (half a point) "held". */
const HELD = 0.005

export type Verdict =
  | "Better."
  | "Worse."
  | "Held."
  | "Absorbed."
  | "Still out."

/** How the week went: the share's change, unless no way in is left. */
export function shareVerdict(week: StoryWeek): Verdict {
  if (!claimOf(week.paths.after, week.paths.winsAfter).in)
    return claimOf(week.paths.before, week.paths.winsBefore).in
      ? "Absorbed."
      : "Still out."
  const change = week.share.after - week.share.before
  if (Math.abs(change) < HELD) return "Held."
  return change > 0 ? "Better." : "Worse."
}

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
