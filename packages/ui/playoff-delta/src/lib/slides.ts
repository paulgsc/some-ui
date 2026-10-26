/**
 * The story's fixed order of slides for one week, how long each holds when
 * playing on its own, and the voiceover line each one carries. The line is
 * written from the same week data the slide draws, so the narration script
 * and the screen state the same facts.
 */

import { counted } from "@some-ui/core-utils"
import { assertNever } from "@some-ui/intent-kit"

import { lawOf, LAWS } from "./laws"
import {
  calls,
  claimOf,
  floorRecord,
  leagueResults,
  nameOf,
  percent,
  points,
  shareVerdict,
  sinceLabel,
  type StorySeason,
  type StoryWeek,
} from "./story"

const SLIDE_IDS = [
  "hook",
  "test",
  "before",
  "game",
  "law",
  "league",
  "after",
  "path",
  "boundary",
  "rivals",
  "collisions",
  "next",
  "benchmark",
  "outro",
] as const
export type SlideId = (typeof SLIDE_IDS)[number]

/** Slides with nothing to show this week are skipped, not shown empty. */
export function slidesFor(week: StoryWeek): ReadonlyArray<SlideId> {
  return SLIDE_IDS.filter((id) => {
    if (id === "league") return leagueResults(week).length > 0
    if (id === "boundary") return week.boundary !== null
    if (id === "collisions") return week.collisions.length > 0
    if (id === "next") return week.next.length > 0
    return true
  })
}

/** Milliseconds a slide holds when playing unattended: its reveal, then a beat. */
export const HOLD_MS: Readonly<Record<SlideId, number>> = {
  hook: 6500,
  test: 5500,
  before: 5500,
  game: 5000,
  law: 7000,
  league: 7500,
  after: 7500,
  path: 6500,
  boundary: 8000,
  rivals: 7000,
  collisions: 6000,
  next: 6000,
  benchmark: 6000,
  outro: 4500,
}

/** What the path's records leave out: it is one way in. */
export const REST_OF_LEAGUE =
  "and the rest of the league as this way has it. There may be others."

/** The model every number is read under, said once a week. */
export const MODEL =
  "Each way the rest of the season can go counts once. Standings only: a tie goes to us."

function claimLine(
  season: StorySeason,
  paths: ReadonlyArray<number | null>,
  wins: number
): string {
  const c = claimOf(paths, wins)
  if (!c.in) return "every path is closed"
  if (c.extraWins === 0)
    return `even if they never win again, a way in remains, as high as the number ${c.seed} seed`
  return `they need ${counted(c.extraWins, "more win")}, then as high as the number ${c.seed} seed. That's a ${floorRecord(c, season.seasonLength)} team`
}

/** "SF beat DET" or "DET lost to the Niners", as the voiceover says it. */
const said = (season: StorySeason, winner: string, loser: string): string =>
  `the ${nameOf(season, winner)} beat the ${nameOf(season, loser)}`

/** The voiceover line for one slide. */
export function narration(
  season: StorySeason,
  week: StoryWeek,
  id: SlideId
): string {
  const name = nameOf(season, season.team)
  const n = (code: string): string => nameOf(season, code)
  const { record, share } = week
  switch (id) {
    case "hook": {
      return "Most fans ask one question: did we win? We ask two. How bad can we be, and still make the playoffs? And of all the ways the season can still go, how many get us in?"
    }
    case "test": {
      return `The ${name} are ${record.w} and ${record.l}. Freeze the season: if they never win again, they finish ${record.w} and ${season.seasonLength - record.w}. Can that team still make the playoffs?`
    }
    case "before": {
      return `${sinceLabel(week.week)}, ${claimLine(season, week.paths.before, week.paths.winsBefore)}. And ${percent(share.before)} of the ways the season can go get them in.`
    }
    case "game": {
      if (week.game === null)
        return `Week ${week.week} is a bye. The ${name} don't play, so only the league moves.`
      return week.game.won
        ? `Week ${week.week}: the ${name} beat the ${n(week.game.opponent)}. That alone moved them ${points(share.own)} points.`
        : `Week ${week.week}: the ${name} lost to the ${n(week.game.opponent)}. That alone moved them ${points(share.own)} points.`
    }
    case "law": {
      const law = LAWS[lawOf(week)]
      return `${law.name}. ${law.rule} ${law.then}`
    }
    case "league": {
      const top = leagueResults(week)[0]
      const settled = calls(season, week).filter((c) => c.result)
      const kept = settled.filter((c) => c.result?.winner === c.rootFor).length
      const callLine = settled.length
        ? ` Of last week's ${counted(settled.length, "call")}, ${kept} went our way.`
        : ""
      return top
        ? `The rest of the league moved them ${points(share.league)} points. The result that mattered most: ${said(season, top.winner, top.loser)}, ${points(top.leverage)} points against the other result.${callLine}`
        : "Nothing else in the league could matter this week."
    }
    case "after": {
      return `${shareVerdict(week)} After week ${week.week}, ${claimLine(season, week.paths.after, week.paths.winsAfter)}. The share of ways in went from ${percent(share.before)} to ${percent(share.after)}.`
    }
    case "path": {
      return week.path
        ? `Here's one way in: ${week.path.needs
            .filter((x) => !x.free)
            .slice(0, 3)
            .map((x) => `the ${n(x.team)} go ${x.rest.w} and ${x.rest.l}`)
            .join(", ")}, ${REST_OF_LEAGUE}`
        : "There's no path left."
    }
    case "boundary": {
      const b = week.boundary
      if (!b) return ""
      const lead = `Why can't ${b.wins} wins work? ${LAWS.pigeonhole.rule}`
      if (b.division.kind === "above")
        return `${lead} The ${n(b.division.team)} are already past ${b.wins} wins, so the division is gone.`
      const room = b.division.teams.reduce((sum, t) => sum + t.room, 0)
      const teams = b.division.teams.map((t) => `the ${n(t.team)}`).join(", ")
      return `${lead} ${teams} still play ${counted(b.division.games, "game")} among themselves, with room for only ${counted(room, "win")} under our line. Someone passes us.`
    }
    case "rivals": {
      return `Futility points: ${week.points.week.scored} of ${week.points.week.possible} this week, ${week.points.season.scored} of ${week.points.season.possible} on the season.`
    }
    case "collisions": {
      return "And here's where rooting gets messy."
    }
    case "next": {
      const top = week.next[0]
      return top
        ? `Next week, root for the ${n(top.rootFor)} against the ${n(top.rootFor === top.home ? top.away : top.home)}. The two results are ${(top.swing * 100).toFixed(1)} points of the ways in apart.`
        : ""
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
