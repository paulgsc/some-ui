/**
 * The story's fixed order of slides for one week, how long each holds when
 * playing on its own, and the voiceover line each one carries. The line is
 * written from the same week data the slide draws, so the narration script
 * and the screen state the same facts.
 */

import { counted } from "@some-ui/core-utils"
import { assertNever } from "@some-ui/intent-kit"

import {
  claimOf,
  floorRecord,
  nameOf,
  sinceLabel,
  type StorySeason,
  type StoryWeek,
  type TemplateKey,
} from "./story"

const SLIDE_IDS = [
  "hook",
  "test",
  "alphabet",
  "grammar",
  "before",
  "game",
  "who",
  "how",
  "after",
  "path",
  "rivals",
  "collisions",
  "benchmark",
  "outro",
] as const
export type SlideId = (typeof SLIDE_IDS)[number]

/** Slides with nothing to show this week are skipped, not shown empty. */
export function slidesFor(week: StoryWeek): ReadonlyArray<SlideId> {
  return SLIDE_IDS.filter(
    (id) => id !== "collisions" || week.collisions.length > 0
  )
}

/** Milliseconds a slide holds when playing unattended: its reveal, then a beat. */
export const HOLD_MS: Readonly<Record<SlideId, number>> = {
  hook: 6000,
  test: 5500,
  alphabet: 5000,
  grammar: 7000,
  before: 5000,
  game: 4500,
  who: 6500,
  how: 6500,
  after: 6500,
  path: 6500,
  rivals: 7000,
  collisions: 6000,
  benchmark: 6000,
  outro: 4500,
}

export const WHO: ReadonlyArray<TemplateKey> = ["division", "rivals", "above"]
export const HOW: ReadonlyArray<TemplateKey> = [
  "exported",
  "spoilers",
  "forced",
]

function claimLine(
  season: StorySeason,
  paths: ReadonlyArray<number | null>,
  wins: number
): string {
  const c = claimOf(paths, wins)
  if (!c.in) return "every path is closed"
  if (c.extraWins === 0)
    return `even if they never win again, they're in, as high as the number ${c.seed} seed`
  return `they need ${counted(c.extraWins, "more win")}, then as high as the number ${c.seed} seed. That's a ${floorRecord(c, season.seasonLength)} team`
}

/** The voiceover line for one slide. */
export function narration(
  season: StorySeason,
  week: StoryWeek,
  id: SlideId
): string {
  const name = nameOf(season, season.team)
  const n = (code: string): string => nameOf(season, code)
  const { record } = week
  switch (id) {
    case "hook": {
      return "Most fans ask one question: did we win? We ask a different one. How bad can we be, and still make the playoffs?"
    }
    case "test": {
      return `The ${name} are ${record.w} and ${record.l}. Freeze the season: if they never win again, they finish ${record.w} and ${season.seasonLength - record.w}. Can that team still make the playoffs?`
    }
    case "alphabet": {
      return "Seven shapes tell every story: you, a contender, an eliminated team, a named rival, your division, your conference, and a win moving to the winner."
    }
    case "grammar": {
      return "And every week, we watch the same seven things."
    }
    case "before": {
      return `${sinceLabel(week.week)}, ${claimLine(season, week.paths.before, week.paths.winsBefore)}.`
    }
    case "game": {
      return week.game.won
        ? `Week ${week.week}: the ${name} beat the ${n(week.game.opponent)}. A win moves every path one win closer.`
        : `Week ${week.week}: the ${name} lost to the ${n(week.game.opponent)}. A loss can't open a path, so it's up to the rest of the league.`
    }
    case "who": {
      const fell = WHO.flatMap((k) => week.templates[k]).filter(
        (r) => r.yourWay
      )
      const names = [...new Set(fell.map((r) => n(r.team)))]
      return names.length
        ? `Who fell? ${names.join(", ")}.`
        : "Who fell? None of the usual suspects."
    }
    case "how": {
      const exp = week.templates.exported
      const out = exp.filter((r) => r.yourWay).length
      return `${counted(out, "conference team")} lost to the other conference, ${counted(week.templates.spoilers.filter((r) => r.yourWay).length, "spoiler")}, and ${counted(week.templates.forced.length, "forced game")}.`
    }
    case "after": {
      return `After week ${week.week}, ${claimLine(season, week.paths.after, week.paths.winsAfter)}.`
    }
    case "path": {
      return week.path
        ? `Here's the path: ${week.path.needs
            .slice(0, 3)
            .map((x) => `the ${n(x.team)} go ${x.rest.w} and ${x.rest.l}`)
            .join(", ")}. Everyone else, as bad as they could be.`
        : "There's no path left."
    }
    case "rivals": {
      return `Futility points: ${week.points.week.scored} of ${week.points.week.possible} this week, ${week.points.season.scored} of ${week.points.season.possible} on the season.`
    }
    case "collisions": {
      return "And here's where rooting gets messy."
    }
    case "benchmark": {
      const low = week.benchmark.lowestBar
      return `The lowest bar in the league belongs to the ${n(low.team)}: ${counted(low.wins, "win")} could still get them in.`
    }
    case "outro": {
      return "Next week, we ask again."
    }
    default: {
      return assertNever(id)
    }
  }
}
