/**
 * The story's fixed order of slides, how long each holds when playing on its
 * own, and what a take over each one says: its point, and the facts it
 * keeps, written from the same week data the slide draws, so the voice and
 * the screen state the same facts (`./show` makes them an episode).
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

/**
 * What each slide is called, and the point a take over it makes in your own
 * words: the episode's cut for it (`./show`). The point says what to
 * motivate, not words to read.
 */
export const SCENES: Readonly<
  Record<SlideId, { readonly name: string; readonly point: string }>
> = {
  division: {
    name: "Our division",
    point:
      "Where our division's best case and worst case stand after this week, and which rivals' games force the floor.",
  },
  conference: {
    name: "Our conference",
    point:
      "The same across the whole conference: the floor, the ceiling, and what forces the floor.",
  },
  results: {
    name: "The results",
    point:
      "Which way this week's results moved us, and which of them were forced.",
  },
  standings: {
    name: "Where we stand",
    point:
      "Where the division and the #1 seed stand now, and how far each is from changing.",
  },
  ladder: {
    name: "The ladder",
    point:
      "How high we can still finish, how low, and whether to keep watching.",
  },
  season: {
    name: "The season",
    point: "How the envelope has closed over the weeks followed so far.",
  },
  outro: {
    name: "In one line",
    point: "The week in one breath, and what comes next.",
  },
  legend: {
    name: "The legend",
    point:
      "Every week, two numbers about our rivals, the best case and the worst, and which way the week moved us.",
  },
  pieces: {
    name: "The pieces",
    point: "A game is named by who plays it, and that never changes.",
  },
  poles: {
    name: "The poles",
    point:
      "The floor, the bloc that forces it, and the ceiling, on the season's first table.",
  },
  moves: {
    name: "What a result did",
    point: "Each result moved us toward a pole, was forced, or moved nothing.",
  },
  objectives: {
    name: "What we play for",
    point:
      "The division and the #1 seed: where each can stand, and the two countdowns.",
  },
  calls: {
    name: "The ladder and the call",
    point: "The outcomes, best first, and when to keep watching or stop.",
  },
}

/** The facts a take over a legend slide may neither drop nor contradict. */
export function legendFacts(
  season: StorySeason,
  id: LegendSlide
): ReadonlyArray<string> {
  switch (id) {
    case "legend": {
      return []
    }
    case "pieces": {
      return PIECE_ORDER.map((k) => {
        const p = PIECES[k]
        return `${capital(p.noun)}: ${p.who.toLowerCase()} ${p.moves}`
      })
    }
    case "poles": {
      return [
        `${capital(POLES.floor.word)}: ${POLES.floor.means}.`,
        `${capital(POLES.bloc.word)}: ${POLES.bloc.means}.`,
        `${capital(POLES.ceiling.word)}: ${POLES.ceiling.means}.`,
        legendFloor(season),
      ]
    }
    case "moves": {
      return [
        ...COHORT_ORDER.map(
          (c) => `${capital(COHORTS[c].phrase)}: ${COHORTS[c].means}.`
        ),
        `${capital(CLEAN_RUN.phrase)}: ${CLEAN_RUN.means}.`,
      ]
    }
    case "objectives": {
      return [
        `We play for ${OBJECTIVES.division.word} and ${OBJECTIVES.conference.word}.`,
        ...STANDING_ORDER.map(
          (s) => `${STANDINGS[s].phrase}: ${STANDINGS[s].means}.`
        ),
        `${capital(COUNTDOWNS.greens.phrase)}: ${COUNTDOWNS.greens.means}.`,
        `${capital(COUNTDOWNS.reds.phrase)}: ${COUNTDOWNS.reds.means}.`,
      ]
    }
    case "calls": {
      return [
        `The ladder, best first: ${RUNG_ORDER.map((r) => RUNGS[r].phrase).join(", ")}.`,
        ...Object.values(CALLS).map((c) => `${c.phrase}: ${c.means}.`),
      ]
    }
    default: {
      return assertNever(id)
    }
  }
}

/** A group's poles, before to after, as facts. */
function polesFacts(week: StoryWeek, key: GroupKey): ReadonlyArray<string> {
  const { before, after } = week.poles
  const g = after[key]
  return [
    `The floor: ${wins(g.floor)}, ${poleChange(before[key].floor, g.floor)}.`,
    `The ceiling: ${wins(g.ceiling.lose)}, ${poleChange(before[key].ceiling.lose, g.ceiling.lose)}.`,
    blocLine(g),
    ceilingLine(g),
  ]
}

/** The facts a take over one slide of a week may neither drop nor contradict. */
export function weekFacts(
  season: StorySeason,
  week: StoryWeek,
  id: WeekSlide
): ReadonlyArray<string> {
  const after = week.poles.after
  switch (id) {
    case "division": {
      return [...polesFacts(week, "division"), rangeLine(after)]
    }
    case "conference": {
      const held = heldLine(after)
      return [...polesFacts(week, "conference"), ...(held ? [held] : [])]
    }
    case "results": {
      const counts = cohortCounts(week, "conference")
      const worst = movesOf(week, "conference")
        .filter((m) => m.cohort === "worst" && m.result.kind !== "own")
        .map((m) => `${m.result.winner} won`)
      return [
        ...COHORT_ORDER.filter((c) => counts[c] > 0).map(
          (c) => `${capital(numberWord(counts[c]))} ${COHORTS[c].phrase}.`
        ),
        ...(worst.length > 0 && worst.length <= 3
          ? [`Against us: ${worst.join(", ")}.`]
          : []),
        ...(cleanRun(week) ? [`${capital(CLEAN_RUN.phrase)}.`] : []),
      ]
    }
    case "standings": {
      return (["division", "conference"] as const).flatMap((key) => {
        const standing = standingOf(after, key)
        return [
          `${capital(OBJECTIVES[key].word)}: ${STANDINGS[standing].phrase.toLowerCase()}.`,
          ...(settled(standing)
            ? []
            : [
                `${capital(countdownLine(greensOf(after, key), "greens"))}, ${countdownLine(redsOf(after, key), "reds")}.`,
              ]),
        ]
      })
    }
    case "ladder": {
      return [ladderLine(after), `${CALLS[callOf(week)].phrase}.`]
    }
    case "season": {
      const weeks = followed(season, week)
      const first = weeks[0]?.poles.before ?? after
      const last = weeks.at(-1)?.poles.after ?? after
      const closed = (key: GroupKey): string =>
        `${capital(GROUPS[key].word)}: the floor ${wins(first[key].floor)} to ${wins(last[key].floor)}, the ceiling ${wins(first[key].ceiling.lose)} to ${wins(last[key].ceiling.lose)}.`
      const moved = weeks.reduce(
        (sum, w) => {
          const s = stepsOf(w, "conference")
          return { ours: sum.ours + s.ours, against: sum.against + s.against }
        },
        { ours: 0, against: 0 }
      )
      return [
        `${capital(numberWord(weeks.length))} ${weeks.length === 1 ? "week" : "weeks"} followed.`,
        closed("division"),
        closed("conference"),
        `${capital(stepsLine(moved.ours, "ours"))}, ${stepsLine(moved.against, "against")}.`,
      ]
    }
    case "outro": {
      return [
        sentence(week),
        ended(season, week)
          ? `That's the series for the ${nameOf(season, season.team)}.`
          : "Next week, we drive again.",
      ]
    }
    default: {
      return assertNever(id)
    }
  }
}
