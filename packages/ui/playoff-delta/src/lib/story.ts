/**
 * The data contract: one regular-season week, from one team's point of view,
 * already computed. This package only renders it. Whatever produces it (a
 * server engine, a weekly job) owns the math: the paths, the flips that moved
 * them, what the rivals' breaks were worth. `StorySeasonSchema` is the one door data comes
 * in through (`parseStorySeason` for bare data), so a malformed feed fails
 * there rather than mid-render.
 *
 * Vocabulary:
 * - a "path" is a way into the playoffs: win x more games and get in as seed
 *   s or better. `paths[x]` is the best seed reachable winning exactly x more
 *   (null: no way in with x). x = 0 reads "even if they never win again".
 * - a "claim" is the headline of a paths row: the fewest more wins that still
 *   get in, and the best seed with exactly that many.
 * - the "floor" is the final record that claim implies.
 */

import { z } from "zod"

const Code = z.string().min(2).max(3)
const Record = z.object({ w: z.number().int(), l: z.number().int() })

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

/** Did a result move the paths, and which way. */
const Moved = z.enum(["helped", "hurt"]).nullable()

const Result = z.object({
  team: Code,
  opponent: Code,
  won: z.boolean(),
  /** Did this result go the favorite's way (null: either way was the same). */
  yourWay: z.boolean().nullable(),
  moved: Moved,
  /**
   * The loser's best moment in the game, when the feed has it: its peak win
   * probability (0-1) and whether it ever led. A loss from a winning position
   * is the sweeter kind; absent, nothing is shown.
   */
  collapse: z
    .object({ peakWinProbability: z.number().min(0).max(1), led: z.boolean() })
    .optional(),
})

/** The six result templates (the seventh symbol is your own game). */
export type TemplateKey =
  | "division"
  | "rivals"
  | "above"
  | "exported"
  | "spoilers"
  | "forced"

const StoryWeekSchema = z.object({
  week: z.number().int().min(1),
  /** Wins and record going into the week. */
  record: Record,
  game: z.object({
    opponent: Code,
    won: z.boolean(),
    relation: z.enum(["division", "rival", "conference", "other"]),
  }),
  paths: z.object({
    before: Paths,
    after: Paths,
    winsBefore: z.number().int(),
    winsAfter: z.number().int(),
  }),
  /** Every result this week, sorted into the fixed templates. */
  templates: z.object({
    division: z.array(Result),
    rivals: z.array(Result),
    above: z.array(Result),
    exported: z.array(Result),
    spoilers: z.array(Result),
    forced: z.array(Result),
  }),
  /** One way in that is left: these teams' records the rest of the way. */
  path: z
    .object({
      extraWins: z.number().int(),
      seed: z.number().int(),
      needs: z.array(
        z.object({ team: Code, rest: Record, rival: z.boolean() })
      ),
    })
    .nullable(),
  rivals: z.array(
    z.object({
      team: Code,
      game: z.object({ opponent: Code, won: z.boolean() }),
      before: Claim,
      after: Claim,
      worst: Claim,
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
  version: z.literal(1),
  /** Shown on screen: "Invented season", "2025". */
  label: z.string(),
  seasonLength: z.number().int().min(1),
  team: Code,
  rivals: z.array(Code),
  names: z.record(z.string(), z.string()),
  conference: z.string(),
  weeks: z.array(StoryWeekSchema).min(1),
})

export type StoryClaim = z.infer<typeof Claim>
export type StoryResult = z.infer<typeof Result>
export type StoryWeek = z.infer<typeof StoryWeekSchema>
export type StorySeason = z.infer<typeof StorySeasonSchema>
export type StoryPaths = z.infer<typeof Paths>

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

/**
 * A loss from ahead: the loser led, or was the likelier winner at some point.
 * Reads the loser's side only, so it marks a result for whoever lost it.
 */
export const blewIt = (r: StoryResult): boolean =>
  !r.won &&
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
  const shift = week.game.won ? 1 : 0
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

export type Verdict =
  | "Better."
  | "Worse."
  | "Held."
  | "Absorbed."
  | "Still out."

/** What the week did to the paths, from the grid's cell changes (PDS1). */
export function weekVerdict(week: StoryWeek): Verdict {
  const was = claimOf(week.paths.before, week.paths.winsBefore).in
  if (!claimOf(week.paths.after, week.paths.winsAfter).in)
    return was ? "Absorbed." : "Still out."
  const changes = cellChanges(week).flat()
  if (changes.includes("pruned")) return "Worse."
  if (changes.includes("opened")) return "Better."
  return "Held."
}

/**
 * What the data proves about a result for the team (PDS2): `true` it helped,
 * `false` it hurt, `null` nothing proven. Against the other conference, a
 * conference team's loss takes a win out of the race; a tie (no reading) has
 * no sign.
 */
export function provenSign(week: StoryWeek, r: StoryResult): boolean | null {
  if (r.moved) return r.moved === "helped"
  const exported = week.templates.exported.some(
    (x) => x.team === r.team && x.opponent === r.opponent
  )
  return exported && r.yourWay !== null ? !r.won : null
}

/** Each of a template's results, signed by {@link provenSign}. */
export const templateSigns = (
  week: StoryWeek,
  k: TemplateKey
): ReadonlyArray<boolean | null> =>
  week.templates[k].map((r) => provenSign(week, r))
