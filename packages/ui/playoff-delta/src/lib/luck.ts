/**
 * Whether following the team still pays, over the season: pure functions, so
 * the slides and the voiceover read the same answers.
 *
 * - **Luck in spreads** is what everyone else's results did to the share,
 *   against how far they could have moved it (the week's spread). The share
 *   is a fair game, so a week's luck averages zero, and over several weeks
 *   the variances add.
 * - The **verdict** is to watch next week, or to exit: in whatever happens,
 *   no way in left, or the share within `SETTLED` of either end. The first
 *   exit ends the series. Its words are `./words`' calls.
 */

import { assertNever } from "@some-ui/intent-kit"

import { percent, wayIn, type StorySeason, type StoryWeek } from "./story"

/** The share's distance from either end at which following stops (owner, 2026-10-27). */
export const SETTLED = 0.02

/** The league's change in spreads; null when nothing could move it. */
export const spreadsOf = (week: StoryWeek): number | null =>
  week.share.spread > 0 ? week.share.league / week.share.spread : null

/** What luck in spreads means, said once wherever it is shown. */
export const SPREADS_DEFINED =
  "In spreads: how far everyone else's results moved our share of the ways in, against how far that week's results could have."

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
