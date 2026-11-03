/**
 * The data contract (version 6): one regular-season week, from one team's
 * point of view, already computed. This package only renders it; whatever
 * produces it (paulgsc/server's `crates/playoff_delta`, whose README defines
 * every field) owns the math. `StorySeasonSchema` is the one door data comes
 * in through (`parseStorySeason` for bare data), so a malformed feed fails
 * there rather than mid-render.
 *
 * Every number is exact: an extreme over every way the rest of the season can
 * go, with its proof, never a weight or a sample. Wins are standings points
 * over two, so a banked tie is half a win.
 *
 * - **Floor** of a group of rivals (our division's, our conference's): if
 *   everything goes our way, the fewest wins its best rival can be held to.
 *   Its **bloc** is the rivals whose games among themselves force it.
 * - **Ceiling**: if everything goes against us, the most wins a rival can
 *   still reach.
 * - **Seeds**: the best seed winning out, the worst losing out.
 */

import { z } from "zod"

const Code = z.string().min(2).max(3)
const Record = z.object({ w: z.number().int(), l: z.number().int() })
/** Wins, in halves: a banked tie is half a win. */
const Wins = z.number().min(0).multipleOf(0.5)
/** A change in wins. */
const Steps = z.number().multipleOf(0.5)
const Seed = z.number().int().min(1).max(7).nullable()
/** The team's own game, a conference team against the other conference, or two conference teams. */
const Kind = z.enum(["own", "exported", "inside"])
/** Which pole a result moved us toward, or why it moved neither. */
const Cohort = z.enum(["best", "worst", "forced", "idle"])

const Group = z.object({
  /** With us winning out, the fewest wins the group's best rival can be held to. */
  floor: Wins,
  /** Rivals whose games among themselves force the floor on their own; none spare. */
  bloc: z.object({
    teams: z.array(Code).min(1),
    banked: Wins,
    /** Games they have left against each other. */
    games: z.number().int().min(0),
  }),
  ceiling: z.object({
    /** The most wins a rival can reach, winning every game it has left, ours included. */
    lose: Wins,
    /** The same, with us winning out: its games against us are losses. */
    win: Wins,
    /** The first rival in division order that reaches `lose`. */
    team: Code,
  }),
})

const PolesSchema = z.object({
  /** Our wins losing every game left, and winning every one. */
  us: z.object({ low: Wins, high: Wins }),
  division: Group,
  /** The conference's other fifteen. */
  conference: Group,
  /** The conference's floor with each division rival held at the division's floor. */
  held: Wins,
  /** The best seed winning out, the worst losing out; null is out. */
  seeds: z.object({ best: Seed, worst: Seed }),
})

/** What one result did to one group, against the same week with it the other way. */
const MoveSchema = z.object({
  cohort: Cohort,
  /** The floor as it is minus the floor had the result gone the other way. */
  floor: Steps,
  /** The same, for the ceiling (`lose`). */
  ceiling: Steps,
})

const ResultSchema = z.object({
  home: Code,
  away: Code,
  winner: Code,
  kind: Kind,
  /** Null when neither side is us or a division rival. */
  division: MoveSchema.nullable(),
  conference: MoveSchema,
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
  /** Games left in the league. */
  pending: z.object({ before: z.number().int(), after: z.number().int() }),
  poles: z.object({ before: PolesSchema, after: PolesSchema }),
  /** The week's results with a side in the conference, in kickoff order; a tied game is none of them. */
  results: z.array(ResultSchema),
})

export const StorySeasonSchema = z.object({
  version: z.literal(6),
  /** Shown on screen: "2025". */
  label: z.string(),
  seasonLength: z.number().int().min(1),
  team: Code,
  names: z.record(z.string(), z.string()),
  conference: z.string(),
  /** Our division rivals. */
  rivals: z.array(Code).min(1),
  weeks: z.array(StoryWeekSchema).min(1),
})

export type StoryWeek = z.infer<typeof StoryWeekSchema>
export type StorySeason = z.infer<typeof StorySeasonSchema>
export type Poles = z.infer<typeof PolesSchema>
export type PoleGroup = z.infer<typeof Group>
export type StoryResult = z.infer<typeof ResultSchema>
export type StoryKind = z.infer<typeof Kind>
export type StoryCohort = z.infer<typeof Cohort>

export const parseStorySeason = (data: unknown): StorySeason =>
  StorySeasonSchema.parse(data)

export const nameOf = (season: StorySeason, code: string): string =>
  season.names[code] ?? code

/** Wins as said: "6", "6½". */
export function wins(x: number): string {
  const whole = Math.floor(x)
  if (x - whole < 0.5) return String(whole)
  return whole === 0 ? "½" : `${whole}½`
}

/** A change in wins, signed: "+1", "−½", "0". */
export function steps(x: number): string {
  if (x === 0) return "0"
  return `${x < 0 ? "−" : "+"}${wins(Math.abs(x))}`
}
