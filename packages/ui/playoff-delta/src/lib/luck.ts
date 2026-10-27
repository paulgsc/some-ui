/**
 * The short's one question, asked every week: did following the team pay,
 * and is it still worth following? Pure functions of the season, so the
 * slides and the voiceover read the same answers, and the words for them live
 * here, in one table each.
 *
 * - A **light** is one result this week that could move the team's share of
 *   the ways in: made when it went the team's way, missed when it didn't.
 *   Each is measured alone (the rest of the week held), so the lights don't
 *   add up to the week's change.
 * - **Luck** is what everyone else's results did to the share, against how
 *   far they could have moved it (the week's spread): the change in spreads.
 *   The share is a fair game, so a week's luck averages zero; the team's own
 *   result is its own light, never luck.
 * - The **verdict** is to watch next week, or to exit: in whatever happens,
 *   no way in left, or the share within `SETTLED` of either end. The first
 *   exit ends the series.
 */

import { assertNever } from "@some-ui/intent-kit"

import {
  leagueResults,
  percent,
  signOf,
  wayIn,
  type StoryResult,
  type StorySeason,
  type StoryWeek,
} from "./story"

/** The share's distance from either end at which following stops (owner, 2026-10-27). */
export const SETTLED = 0.02

export type Light = {
  readonly result: StoryResult
  readonly made: boolean
}

/**
 * The week's lights: the team's own result first, then the league's, biggest
 * first; a result worth "0.0" points is not a light, the team's own included.
 */
export function lightsOf(week: StoryWeek): ReadonlyArray<Light> {
  const own = week.results.filter(
    (r) => r.kind === "own" && signOf(r.leverage) !== 0
  )
  return [...own, ...leagueResults(week)].map((result) => ({
    result,
    made: result.leverage > 0,
  }))
}

/** The league's change in spreads; null when nothing could move it. */
export const spreadsOf = (week: StoryWeek): number | null =>
  week.share.spread > 0 ? week.share.league / week.share.spread : null

export type LuckBand =
  | "very lucky"
  | "lucky"
  | "usual"
  | "unlucky"
  | "very unlucky"
  | "still"

/** Spreads either side of zero that still read as a usual week, and past which a week is "very". */
const USUAL = 0.5
const VERY = 1.5

export function luckBand(spreads: number | null): LuckBand {
  if (spreads === null) return "still"
  if (spreads >= VERY) return "very lucky"
  if (spreads >= USUAL) return "lucky"
  if (spreads <= -VERY) return "very unlucky"
  if (spreads <= -USUAL) return "unlucky"
  return "usual"
}

export const LUCK_WORDS: Readonly<
  Record<LuckBand, { readonly big: string; readonly line: string }>
> = {
  "very lucky": {
    big: "Very lucky.",
    line: "The league moved us much further our way than a usual week does.",
  },
  lucky: {
    big: "Lucky.",
    line: "The league moved us further our way than a usual week does.",
  },
  usual: {
    big: "A usual week.",
    line: "The league moved us about as far as a week usually does.",
  },
  unlucky: {
    big: "Unlucky.",
    line: "The league moved us further against us than a usual week does.",
  },
  "very unlucky": {
    big: "Very unlucky.",
    line: "The league moved us much further against us than a usual week does.",
  },
  still: {
    big: "Nothing moved.",
    line: "No result elsewhere could change our share of the ways in.",
  },
}

/** What luck means, said once wherever it is shown. */
export const LUCK_DEFINED =
  "Luck: how far everyone else's results moved our share of the ways in, against how far that week's results could have (one spread)."

export type ExitReason = "clinched" | "out" | "settled-in" | "settled-out"

export type Verdict =
  | { readonly kind: "watch" }
  | { readonly kind: "exit"; readonly why: ExitReason }

/** After the week: keep following, or stop, and why. */
export function verdictOf(week: StoryWeek): Verdict {
  if (week.clinched) return { kind: "exit", why: "clinched" }
  if (!wayIn(week)) return { kind: "exit", why: "out" }
  if (week.share.after >= 1 - SETTLED)
    return { kind: "exit", why: "settled-in" }
  if (week.share.after <= SETTLED) return { kind: "exit", why: "settled-out" }
  return { kind: "watch" }
}

/** Why the series stops, in one line. */
export function exitLine(why: ExitReason): string {
  switch (why) {
    case "clinched": {
      return "They're in, whatever happens."
    }
    case "out": {
      return "No way in is left."
    }
    case "settled-in": {
      return `At least ${percent(1 - SETTLED)} of the ways the season can go get them in. Past that, we stop following.`
    }
    case "settled-out": {
      return `At most ${percent(SETTLED)} of the ways the season can go get them in. Below that, we stop following.`
    }
    default: {
      return assertNever(why)
    }
  }
}

/** The series' first exit, which ends it; null while it runs. */
function firstExit(
  season: StorySeason
): { readonly week: StoryWeek; readonly why: ExitReason } | null {
  for (const week of season.weeks) {
    const v = verdictOf(week)
    if (v.kind === "exit") return { week, why: v.why }
  }
  return null
}

/** The week the series ended; null while it runs. */
export const exitWeek = (season: StorySeason): number | null =>
  firstExit(season)?.week.week ?? null

export function ended(season: StorySeason, week: StoryWeek): boolean {
  const stopped = exitWeek(season)
  return stopped !== null && stopped <= week.week
}

/** The week the series ended on, when `week` comes after it; null otherwise. */
export function pastExit(season: StorySeason, week: StoryWeek): number | null {
  const stopped = exitWeek(season)
  return stopped !== null && week.week > stopped ? stopped : null
}

/** The weeks followed up to `week`: through the exit, never past it. */
export function followed(
  season: StorySeason,
  week: StoryWeek
): ReadonlyArray<StoryWeek> {
  const last = Math.min(week.week, exitWeek(season) ?? week.week)
  return season.weeks.filter((w) => w.week <= last)
}

/** The league's lights this week, made and missed. */
export function lightTally(week: StoryWeek): {
  readonly made: number
  readonly missed: number
} {
  const league = lightsOf(week).filter((l) => l.result.kind !== "own")
  const made = league.filter((l) => l.made).length
  return { made, missed: league.length - made }
}

/**
 * The luck of several weeks together, in spreads: the share is a fair game,
 * so its weekly moves are uncorrelated and their variances add. Null when
 * nothing could move it.
 */
export function seasonSpreads(weeks: ReadonlyArray<StoryWeek>): number | null {
  const change = weeks.reduce((sum, w) => sum + w.share.league, 0)
  const variance = weeks.reduce((sum, w) => sum + w.share.spread ** 2, 0)
  return variance > 0 ? change / Math.sqrt(variance) : null
}

/** The season so far, through `week` or the exit: its luck and its lights. */
export function seasonSoFar(
  season: StorySeason,
  week: StoryWeek
): {
  readonly weeks: ReadonlyArray<StoryWeek>
  readonly spreads: number | null
  readonly lights: number
  readonly made: number
} {
  const weeks = followed(season, week)
  const lit = weeks.flatMap(lightsOf)
  return {
    weeks,
    spreads: seasonSpreads(weeks),
    lights: lit.length,
    made: lit.filter((l) => l.made).length,
  }
}

/** Spreads either side of zero a slide draws before it stops at the edge. */
export const SPREADS_SHOWN = 3

export type Hindsight = {
  readonly stopped: number
  readonly share: number
  readonly reason: ExitReason
  readonly gotIn: boolean
}

/**
 * Once the season is over, whether stopping early missed anything: the exit
 * week, and whether the team got in. Null while games are left, or with no
 * exit before the last week.
 */
export function hindsight(season: StorySeason): Hindsight | null {
  const last = season.weeks.at(-1)
  const exit = firstExit(season)
  if (last?.stake !== null || exit === null || exit.week.week === last.week)
    return null
  return {
    stopped: exit.week.week,
    share: exit.week.share.after,
    reason: exit.why,
    gotIn: last.share.after === 1,
  }
}

/** The hindsight line: what stopping at the exit week missed. */
export function hindsightLine(h: Hindsight): string {
  const expected = h.reason === "clinched" || h.reason === "settled-in"
  if (expected === h.gotIn)
    return `${h.gotIn ? "They got in" : "They missed"}. Nothing after week ${h.stopped} changed it.`
  return h.gotIn
    ? `They got in. The ${percent(h.share)} of ways in left after week ${h.stopped} is what happened.`
    : `They missed. The ${percent(1 - h.share)} of ways out left after week ${h.stopped} is what happened.`
}
