/**
 * The story's fixed order of slides, how long each holds when playing on its
 * own, and the voiceover line each one carries. A line is written from the
 * same week data the slide draws, so the narration and the screen state the
 * same facts.
 *
 * Two kinds of episode: the **legend**, played once, teaches the vocabulary
 * (`./words`); a **week** then uses it without teaching it again, one slide
 * per reading (`./reading`), opening on our division's poles.
 */

import { assertNever } from "@some-ui/intent-kit"

import {
  blocLine,
  callOf,
  capital,
  ceilingLine,
  cleanRun,
  cohortCounts,
  countdownLine,
  ended,
  followed,
  greensOf,
  heldLine,
  ladderLine,
  legendFloor,
  movesOf,
  poleChange,
  rangeLine,
  redsOf,
  sentence,
  settled,
  standingOf,
  stepsLine,
  stepsOf,
} from "./reading"
import { nameOf, wins, type StorySeason, type StoryWeek } from "./story"
import {
  CALLS,
  CLEAN_RUN,
  COHORT_ORDER,
  COHORTS,
  COUNTDOWNS,
  GROUPS,
  numberWord,
  OBJECTIVES,
  PIECE_ORDER,
  PIECES,
  POLES,
  RUNG_ORDER,
  RUNGS,
  STANDING_ORDER,
  STANDINGS,
  type GroupKey,
} from "./words"

/** A week's slides, in order: every week shows each one. */
export const WEEK_SLIDES = [
  "division",
  "conference",
  "results",
  "standings",
  "ladder",
  "season",
  "outro",
] as const
export type WeekSlide = (typeof WEEK_SLIDES)[number]

export const LEGEND_SLIDES = [
  "legend",
  "pieces",
  "poles",
  "moves",
  "objectives",
  "calls",
] as const
export type LegendSlide = (typeof LEGEND_SLIDES)[number]

export type SlideId = WeekSlide | LegendSlide

export const isLegendSlide = (id: SlideId): id is LegendSlide =>
  LEGEND_SLIDES.some((s) => s === id)

/** The legend's place among the weeks: before the first. */
export const LEGEND_WEEK = 0

/** Milliseconds a slide holds when playing unattended: its reveal, then a beat. */
export const HOLD_MS: Readonly<Record<SlideId, number>> = {
  division: 9000,
  conference: 9000,
  results: 9000,
  standings: 8000,
  ladder: 7000,
  season: 7000,
  outro: 6000,
  legend: 6500,
  pieces: 10_000,
  poles: 10_000,
  moves: 8000,
  objectives: 9000,
  calls: 8000,
}

/** The model every number is read under. */
export const MODEL =
  "Over every way the rest of the season can go. Standings only: a tie goes to us."

/** The legend's voiceover, one line per slide. */
export function legendLine(season: StorySeason, id: LegendSlide): string {
  switch (id) {
    case "legend": {
      return "Every week, two numbers about our rivals: the best case and the worst. And which way the week moved us. First, the words we use."
    }
    case "pieces": {
      return PIECE_ORDER.map((k) => {
        const p = PIECES[k]
        return `${capital(p.noun)}: ${p.who.toLowerCase()} ${p.moves}`
      }).join(" ")
    }
    case "poles": {
      return `${capital(POLES.floor.word)}: ${POLES.floor.means}. ${capital(POLES.bloc.word)}: ${POLES.bloc.means}. ${capital(POLES.ceiling.word)}: ${POLES.ceiling.means}. ${legendFloor(season)}`
    }
    case "moves": {
      return `Each result moved us ${COHORT_ORDER.map((c) => (c === "best" || c === "worst" ? `${COHORTS[c].phrase}: ${COHORTS[c].means}` : `or was ${COHORTS[c].phrase}: ${COHORTS[c].means}`)).join("; ")}. ${capital(CLEAN_RUN.phrase)}: ${CLEAN_RUN.means}.`
    }
    case "objectives": {
      return `We play for ${OBJECTIVES.division.word} and ${OBJECTIVES.conference.word}. Each is ${STANDING_ORDER.map((s) => `${STANDINGS[s].phrase.toLowerCase()}, ${STANDINGS[s].means}`).join("; ")}. ${capital(COUNTDOWNS.greens.phrase)}: ${COUNTDOWNS.greens.means}. ${capital(COUNTDOWNS.reds.phrase)}: ${COUNTDOWNS.reds.means}.`
    }
    case "calls": {
      return `The ladder, best first: ${RUNG_ORDER.map((r) => RUNGS[r].phrase).join(", ")}. Each week names the best rung still reachable and the worst already ours. Then the call: ${Object.values(
        CALLS
      )
        .map((c) => `${c.phrase}, ${c.means}`)
        .join("; ")}.`
    }
    default: {
      return assertNever(id)
    }
  }
}

/** A group's poles, before to after, in words. */
function polesLine(week: StoryWeek, key: GroupKey): string {
  const { before, after } = week.poles
  const g = after[key]
  return `The floor: ${wins(g.floor)}, ${poleChange(before[key].floor, g.floor)}. The ceiling: ${wins(g.ceiling.lose)}, ${poleChange(before[key].ceiling.lose, g.ceiling.lose)}. ${blocLine(g)} ${ceilingLine(g)}`
}

/** The voiceover line for one slide of a week. */
export function narration(
  season: StorySeason,
  week: StoryWeek,
  id: WeekSlide
): string {
  const after = week.poles.after
  switch (id) {
    case "division": {
      return `Week ${week.week}. ${capital(GROUPS.division.word)}. ${polesLine(week, "division")} ${rangeLine(after)}`
    }
    case "conference": {
      const held = heldLine(after)
      return `${capital(GROUPS.conference.word)}. ${polesLine(week, "conference")}${held === null ? "" : ` ${held}`}`
    }
    case "results": {
      const counts = cohortCounts(week, "conference")
      const said = COHORT_ORDER.filter((c) => counts[c] > 0)
        .map((c) => `${numberWord(counts[c])} ${COHORTS[c].phrase}`)
        .join(", ")
      const worst = movesOf(week, "conference")
        .filter((m) => m.cohort === "worst" && m.result.kind !== "own")
        .map((m) => `${m.result.winner} won`)
      const named =
        worst.length > 0 && worst.length <= 3
          ? ` Against us: ${worst.join(", ")}.`
          : ""
      const clean = cleanRun(week) ? ` ${capital(CLEAN_RUN.phrase)}.` : ""
      return `${week.results.length} results touched our conference: ${said || "none"}.${named}${clean}`
    }
    case "standings": {
      return (["division", "conference"] as const)
        .map((key) => {
          const standing = standingOf(after, key)
          const counts = settled(standing)
            ? ""
            : `: ${countdownLine(greensOf(after, key), "greens")}, ${countdownLine(redsOf(after, key), "reds")}`
          return `${capital(OBJECTIVES[key].word)}, ${STANDINGS[standing].phrase.toLowerCase()}${counts}.`
        })
        .join(" ")
    }
    case "ladder": {
      return `${ladderLine(after)} ${CALLS[callOf(week)].phrase}.`
    }
    case "season": {
      const weeks = followed(season, week)
      const first = weeks[0]?.poles.before ?? after
      const last = weeks.at(-1)?.poles.after ?? after
      const closed = (key: GroupKey): string =>
        `the floor ${wins(first[key].floor)} to ${wins(last[key].floor)}, the ceiling ${wins(first[key].ceiling.lose)} to ${wins(last[key].ceiling.lose)}`
      const moved = weeks.reduce(
        (sum, w) => {
          const s = stepsOf(w, "conference")
          return { ours: sum.ours + s.ours, against: sum.against + s.against }
        },
        { ours: 0, against: 0 }
      )
      return `Over ${numberWord(weeks.length)} ${weeks.length === 1 ? "week" : "weeks"} followed. ${capital(GROUPS.division.word)}: ${closed("division")}. ${capital(GROUPS.conference.word)}: ${closed("conference")}. ${capital(stepsLine(moved.ours, "ours"))}, ${stepsLine(moved.against, "against")}.`
    }
    case "outro": {
      const last = ended(season, week)
        ? `That's the series for the ${nameOf(season, season.team)}.`
        : "Next week, we drive again."
      return `${sentence(week)} ${last}`
    }
    default: {
      return assertNever(id)
    }
  }
}
