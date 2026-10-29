/**
 * The data contract (version 5): one regular-season week, from one team's
 * point of view, already computed. This package only renders it; whatever
 * produces it (paulgsc/server's `crates/playoff_delta`, whose README defines
 * every field) owns the math. `StorySeasonSchema` is the one door data comes
 * in through (`parseStorySeason` for bare data), so a malformed feed fails
 * there rather than mid-render.
 *
 * Vocabulary: a "path" is a way in, win x more games and get in as seed s or
 * better (`paths[x]`, null: none). The "share" is the share of the ways the
 * rest of the season can go in which the team gets in; a week's "spread"
 * how far its results could have moved the share.
 */

import { z } from "zod"

const Code = z.string().min(2).max(3)
const Record = z.object({ w: z.number().int(), l: z.number().int() })
const Share = z.number().min(0).max(1)
const Change = z.number().min(-1).max(1)
/** The team's own game, a conference team against the other conference, or two conference teams. */
const Kind = z.enum(["own", "exported", "inside"])

/** Best seed reachable winning exactly x more games, for x = 0..n. */
const Paths = z.array(z.number().int().min(1).max(7).nullable()).min(1)

/** A game's place in the week's best way. */
const Piece = z.object({
  /** The side the best way needs. */
  want: Code,
  /**
   * How far the best share any way of the week reaches drops if this game
   * goes the other way: the best with it flipped is `best - price`.
   */
  price: Share,
  /**
   * The price's sampling error: half the gap between the price read off two
   * independent halves of the rests. 0 when every way was counted.
   */
  error: Share,
})

/** One of the week's games that could move the team, with its piece. */
const WayGameSchema = Piece.extend({
  home: Code,
  away: Code,
  kind: Kind,
  /** Who won. A tied game is never one of the week's ways: it is banked before the week. */
  winner: Code,
})

/**
 * Every way this week's results could have gone, each counted against the
 * same rests of the season. Every number in it comes from that one table, so
 * each derivation it shows adds up.
 */
const Ways = z.object({
  /** This week's games with a side in the team's conference, in kickoff order. */
  games: z.array(WayGameSchema),
  /** The highest share any way of the week reaches. */
  best: Share,
  /** The lowest. */
  worst: Share,
  /** The share the week's actual results leave. */
  actual: Share,
  /** Of the week's ways, the share that would have left the team worse than `actual`, ties counted half. */
  rank: Share,
  /**
   * The same, with the team's own result held as it happened: `pieces` is
   * aligned with `games` (the own game's piece is its actual winner, price 0,
   * error 0). Null on a bye or a tied own game.
   */
  given: z
    .object({ best: Share, rank: Share, pieces: z.array(Piece) })
    .nullable(),
  /**
   * The best share still reachable before any result, then after each one,
   * in kickoff order: `games.length + 1` entries, the first `best` and the
   * last `actual`. Never rises.
   */
  road: z.array(Share),
  /** The mean share of the ways still possible at the same points as `road`: the first is the week's mean, the last `actual`. */
  mean: z.array(Share),
  /**
   * At each point of `road`, how many of the ways still possible land in each
   * of 20 equal bins over [worst, best] (a way at `best` lands in the last
   * bin). The first row sums to 2^games.length; each next row to half the last.
   */
  strip: z.array(z.array(z.number().int().min(0))),
  /** Every rest was counted, not a sample. */
  exact: z.boolean(),
})

/** The week's league: every team's actual week ranked among its own ways. */
const Podium = z.object({
  /**
   * Every eligible team placed 1 to 3, best first. Equal ranks share a place
   * (1 + eligible teams with a strictly higher rank), so there can be more
   * than three.
   */
  medals: z.array(
    z.object({
      team: Code,
      place: z.number().int().min(1).max(3),
      /** As `Ways.rank`, for this team's own week. */
      rank: Share,
      best: Share,
      worst: Share,
      actual: Share,
      /** The team's own result this week. */
      game: z.enum(["won", "lost", "tie", "bye"]),
      /** Its three dearest pieces (its own game among them when it played), dearest first. */
      pieces: z
        .array(
          z.object({
            home: Code,
            away: Code,
            want: Code,
            price: Share,
            made: z.boolean(),
          })
        )
        .max(3),
    })
  ),
  /** The team's own place among eligible teams; null when not eligible. */
  place: z.number().int().min(1).nullable(),
  /** Teams whose week could move their share by at least 1 point (its standard deviation over the week's ways). */
  eligible: z.number().int().min(0),
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
  /** What next week can do to the share, before it is played; null once no game is left. */
  stake: z
    .object({
      /** The team's opponent next week; null on its bye. */
      opponent: Code.nullable(),
      /** The share if the team wins next week minus if it loses, unsigned; 0 on its bye or a game that cannot move it. */
      own: Share,
      /** The share's standard deviation over the ways next week can go, its own game included. */
      spread: Share,
      exact: z.boolean(),
      /** Next week's best way: its games with a side in the conference, in kickoff order, each with its piece. */
      pieces: z.array(Piece.extend({ home: Code, away: Code, kind: Kind })),
    })
    .nullable(),
  /** Proven: every way the rest of the season can go gets the team in. False is "not proven". */
  clinched: z.boolean(),
  ways: Ways,
  podium: Podium,
})

export const StorySeasonSchema = z.object({
  version: z.literal(5),
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

export type StoryWeek = z.infer<typeof StoryWeekSchema>
export type StoryKind = z.infer<typeof Kind>
export type StoryPiece = z.infer<typeof Piece>
export type WayGame = z.infer<typeof WayGameSchema>
export type StorySeason = z.infer<typeof StorySeasonSchema>

export const parseStorySeason = (data: unknown): StorySeason =>
  StorySeasonSchema.parse(data)

export const nameOf = (season: StorySeason, code: string): string =>
  season.names[code] ?? code

/** Is any way in left after the week: a seed in the paths row. */
export const wayIn = (week: StoryWeek): boolean =>
  week.paths.after.some((seed) => seed !== null)

/** A share as a percentage: "61.5%". */
export const percent = (share: number): string => `${(share * 100).toFixed(1)}%`

/** A share or a change in it as unsigned points: "9.3". */
export const size = (change: number): string =>
  Math.abs(change * 100).toFixed(1)

/** A number to one place, signed after rounding: "+9.3", "−2.9", "0.0". */
export function signed(x: number): string {
  const abs = Math.abs(x).toFixed(1)
  if (abs === "0.0") return abs
  return `${x < 0 ? "−" : "+"}${abs}`
}
