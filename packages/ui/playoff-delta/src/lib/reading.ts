/**
 * One week read in the short's vocabulary (`./words`), as pure functions of
 * the week, so the slides and the facts each take keeps say the same. Every
 * reading is a fact about every way the rest of the season can go:
 *
 * 1. Where do our division's poles stand, and what forces the floor?
 * 2. The same for our conference.
 * 3. Which way did each result move us? (cohorts)
 * 4. Where does each objective stand, and how far is it from changing?
 *    (standings, countdowns)
 * 5. What is the best rung still reachable, and the worst already ours?
 *    (the ladder, and the call)
 */

import { counted, listed } from "@some-ui/core-utils"

import type {
  PoleGroup,
  Poles,
  StoryCohort,
  StoryResult,
  StorySeason,
  StoryWeek,
} from "./story"
import { nameOf, winCount, wins } from "./story"
import {
  CALLS,
  CLEAN_RUN,
  COUNTDOWNS,
  numberWord,
  OBJECTIVES,
  POLES,
  RUNG_ORDER,
  RUNGS,
  STANDINGS,
  STEPS,
  type Call,
  type GroupKey,
  type Rung,
  type Standing,
} from "./words"

/** Where an objective stands against a group, under ties to us. */
export function standingOf(poles: Poles, key: GroupKey): Standing {
  const g = poles[key]
  if (poles.us.low >= g.ceiling.lose) return "clinched"
  if (poles.us.high >= g.ceiling.win) return "hands"
  if (poles.us.high >= g.floor) return "help"
  return "out"
}

/** Wins and rival losses still needed to clinch; 0 once clinched. */
export const greensOf = (poles: Poles, key: GroupKey): number =>
  Math.max(0, poles[key].ceiling.lose - poles.us.low)

/** Losses we can still afford before an objective is gone; below 0 once out. */
export const redsOf = (poles: Poles, key: GroupKey): number =>
  poles.us.high - poles[key].floor

/** The rung a seed stands on. */
export function rungOf(seed: number | null): Rung {
  if (seed === null) return "out"
  if (seed === 1) return "top"
  return seed <= 4 ? "division" : "wildcard"
}

/** The best rung still reachable and the worst already ours. */
export const ladderOf = (
  poles: Poles
): { readonly best: Rung; readonly worst: Rung } => ({
  best: rungOf(poles.seeds.best),
  worst: rungOf(poles.seeds.worst),
})

/** How far up the ladder a rung is: 0 is the top. */
export const rungIndex = (rung: Rung): number => RUNG_ORDER.indexOf(rung)

/** The call after the week, read off its ladder. */
export function callOf(week: StoryWeek): Call {
  const { best, worst } = ladderOf(week.poles.after)
  if (best === "out") return "dead-end"
  return best === worst ? "arrived" : "keep-driving"
}

/** The series' first call other than keep driving, which ends it; null while it runs. */
function exitWeek(season: StorySeason): number | null {
  return season.weeks.find((w) => callOf(w) !== "keep-driving")?.week ?? null
}

/** The series has ended by `week`. */
export function ended(season: StorySeason, week: StoryWeek): boolean {
  const stopped = exitWeek(season)
  return stopped !== null && stopped <= week.week
}

/** The weeks followed up to `week`: through the exit, never past it. */
export function followed(
  season: StorySeason,
  week: StoryWeek
): ReadonlyArray<StoryWeek> {
  const last = Math.min(week.week, exitWeek(season) ?? week.week)
  return season.weeks.filter((w) => w.week <= last)
}

/** The week's results that touched a group, with their move for it. */
export function movesOf(
  week: StoryWeek,
  key: GroupKey
): ReadonlyArray<{
  readonly result: StoryResult
  readonly cohort: StoryCohort
  readonly floor: number
  readonly ceiling: number
}> {
  return week.results.flatMap((result) => {
    const m = result[key]
    return m === null ? [] : [{ result, ...m }]
  })
}

/** How many of the week's results fell in each cohort, for a group. */
export function cohortCounts(
  week: StoryWeek,
  key: GroupKey
): Readonly<Record<StoryCohort, number>> {
  const counts = { best: 0, worst: 0, forced: 0, idle: 0 }
  for (const m of movesOf(week, key)) counts[m.cohort] += 1
  return counts
}

/**
 * How the week moved a group's poles, before to after, in wins: the ceiling
 * falling and our wins rising our way, the floor rising and our best finish
 * dropping against us.
 */
export function stepsOf(
  week: StoryWeek,
  key: GroupKey
): { readonly ours: number; readonly against: number } {
  const { before, after } = week.poles
  return {
    ours:
      before[key].ceiling.lose -
      after[key].ceiling.lose +
      (after.us.low - before.us.low),
    against:
      after[key].floor - before[key].floor + (before.us.high - after.us.high),
  }
}

/** "2 steps our way", "½ step against us". */
export const stepsLine = (x: number, side: keyof typeof STEPS): string =>
  `${winCount(x, STEPS[side].one, STEPS[side].many)} ${STEPS[side].phrase}`

/** Neither floor rose and our best finish held. */
export const cleanRun = (week: StoryWeek): boolean =>
  stepsOf(week, "division").against === 0 &&
  stepsOf(week, "conference").against === 0

/** The floor's proof in one sentence. */
export function blocLine(group: PoleGroup): string {
  const { teams, banked, games } = group.bloc
  // A bloc with no games left between its teams is one team: no other is needed.
  if (teams.length === 1)
    return `${teams.join("")} has ${winCount(banked)} already: the floor is ${wins(group.floor)}.`
  const who =
    teams.length <= 4
      ? listed(teams)
      : `${capital(numberWord(teams.length))} rivals`
  return `${who}: ${winCount(banked)} banked and ${counted(games, "game")} left against each other. However those go, one of them reaches ${wins(group.floor)}.`
}

/** The ceiling in one sentence. */
export const ceilingLine = (group: PoleGroup): string =>
  `${group.ceiling.team} can still reach ${wins(group.ceiling.lose)}.`

/** The conference's floor with our division held at its own, when that lifts it. */
export function heldLine(poles: Poles): string | null {
  return poles.held > poles.conference.floor
    ? `Holding our division to its floor lifts the conference floor to ${wins(poles.held)}.`
    : null
}

/** How a pole moved over the week: "held", or "from 7". */
export function poleChange(before: number, after: number): string {
  return before === after ? "held" : `from ${wins(before)}`
}

/** Our range in one sentence. */
export const rangeLine = (poles: Poles): string =>
  poles.us.low === poles.us.high
    ? `We finish with ${winCount(poles.us.low)}.`
    : `We can finish with ${wins(poles.us.low)} to ${winCount(poles.us.high)}.`

/** A standing that nothing left can change. */
export const settled = (standing: Standing): boolean =>
  standing === "clinched" || standing === "out"

/** A countdown with its words: "1 green to go", "3½ reds to spare". */
export const countdownLine = (
  x: number,
  key: keyof typeof COUNTDOWNS
): string =>
  `${wins(x)} ${x === 1 ? COUNTDOWNS[key].one : COUNTDOWNS[key].phrase}`

/** A standing as a sentence: "The division: in our hands." */
const standingLine = (poles: Poles, key: GroupKey): string =>
  `${capital(OBJECTIVES[key].word)}: ${STANDINGS[standingOf(poles, key)].phrase.toLowerCase()}.`

/** The ladder in one sentence. */
export function ladderLine(poles: Poles): string {
  const { best, worst } = ladderOf(poles)
  if (best === worst)
    return best === "out"
      ? "No seat is left."
      : `${capital(RUNGS[best].phrase)}, whatever happens.`
  return `As good as ${RUNGS[best].phrase}, as bad as ${worst === "out" ? "out" : RUNGS[worst].phrase}.`
}

/** "Gold", from "gold". */
export const capital = (word: string): string =>
  `${word.charAt(0).toUpperCase()}${word.slice(1)}`

/**
 * The week in one sentence: "[A clean run.] [Steps our way and against us,
 * across the conference.] The division: [standing]. The #1 seed:
 * [standing]. [Ladder.] [Call]."
 */
export function sentence(week: StoryWeek): string {
  const after = week.poles.after
  const clean = cleanRun(week) ? `${capital(CLEAN_RUN.phrase)}. ` : ""
  const { ours, against } = stepsOf(week, "conference")
  const moved =
    ours === 0 && against === 0
      ? "Nothing moved."
      : `The week: ${stepsLine(ours, "ours")}, ${stepsLine(against, "against")}.`
  const call = CALLS[callOf(week)].phrase
  return `${clean}${moved} ${standingLine(after, "division")} ${standingLine(after, "conference")} ${ladderLine(after)} ${call}.`
}

/** The legend's floor sentence, from the season's first table. */
export function legendFloor(season: StorySeason): string {
  const first = season.weeks[0]?.poles.before
  if (!first) return ""
  return `Before a snap, ${POLES.floor.word} is ${wins(first.division.floor)} for our division and ${wins(first.conference.floor)} for our conference, with the ${nameOf(season, season.team)} going ${wins(first.us.high)}-0.`
}
