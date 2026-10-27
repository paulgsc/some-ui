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
  ended,
  exitLine,
  exitWeek,
  followed,
  hindsight,
  hindsightLine,
  inSpreads,
  lightsOf,
  LUCK_WORDS,
  luckBand,
  seasonSpreads,
  spreadsOf,
  verdictOf,
} from "./luck"
import {
  against,
  nameOf,
  percent,
  points,
  size,
  type StorySeason,
  type StoryWeek,
} from "./story"

const SLIDE_IDS = [
  "hook",
  "lights",
  "law",
  "luck",
  "stake",
  "verdict",
  "season",
  "outro",
] as const
export type SlideId = (typeof SLIDE_IDS)[number]

/** Slides with nothing to show this week are skipped, not shown empty. */
export function slidesFor(week: StoryWeek): ReadonlyArray<SlideId> {
  return SLIDE_IDS.filter((id) => id !== "stake" || week.stake !== null)
}

/** Milliseconds a slide holds when playing unattended: its reveal, then a beat. */
export const HOLD_MS: Readonly<Record<SlideId, number>> = {
  hook: 6500,
  lights: 8000,
  law: 7000,
  luck: 7500,
  stake: 7000,
  verdict: 6500,
  season: 7000,
  outro: 4500,
}

/** The model every number is read under, said once a week. */
export const MODEL =
  "Each way the rest of the season can go counts once. Standings only: a tie goes to us."

/** "the Niners beat the Lions", as the voiceover says a result. */
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
  const { share } = week
  switch (id) {
    case "hook": {
      return "Most fans ask one question: did we win? We ask two. Did following them pay this week? And is next week worth following?"
    }
    case "lights": {
      const lights = lightsOf(week)
      const own = lights.find((l) => l.result.kind === "own")
      const league = lights.filter((l) => l.result.kind !== "own")
      const made = league.filter((l) => l.made).length
      const game = week.game
      const lead = own
        ? `Week ${week.week}: ${said(season, own.result.winner, own.result.loser)}. Their own light, ${points(own.result.leverage)} points.`
        : game
          ? `Week ${week.week}: the ${name} ${game.won ? "beat" : "lost to"} the ${n(game.opponent)}, which couldn't move them.`
          : `Week ${week.week} is a bye: only the league's lights.`
      return league.length
        ? `${lead} Of the league's ${counted(league.length, "result")} that could move us, ${made} went our way and ${league.length - made} didn't.`
        : `${lead} Nothing else in the league could move us.`
    }
    case "law": {
      const law = LAWS[lawOf(week)]
      return `${law.name}. ${law.rule} ${law.then}`
    }
    case "luck": {
      const spreads = spreadsOf(week)
      const words = LUCK_WORDS[luckBand(spreads)]
      if (spreads === null) return `${words.big} ${words.line}`
      return `${words.big} The league moved us ${points(share.league)} points. This week's results could move us about ${size(share.spread)}: that's ${inSpreads(spreads)} spreads.`
    }
    case "stake": {
      const stake = week.stake
      if (!stake) return ""
      const top = week.next[0]
      const ours =
        stake.opponent === null
          ? "We have a bye"
          : stake.own > 0
            ? `Our game against the ${n(stake.opponent)} is ${size(stake.own)} points between a win and a loss`
            : `Our game against the ${n(stake.opponent)} can't move us`
      const root = top
        ? ` Root for the ${n(top.rootFor)} over the ${n(against(top))}.`
        : ""
      return `Next week: ${ours}, and the whole week can move us about ${size(stake.spread)}.${root}`
    }
    case "verdict": {
      const stopped = exitWeek(season)
      if (stopped !== null && week.week > stopped) {
        const h = hindsight(season)
        return `We stopped following after week ${stopped}.${h ? ` ${hindsightLine(h)}` : ""}`
      }
      const v = verdictOf(week)
      return v.kind === "watch"
        ? `Verdict: watch week ${week.week + 1}. ${percent(share.after)} of the ways the season can go get them in.`
        : `Verdict: we stop here. ${exitLine(v.why)}`
    }
    case "season": {
      const weeks = followed(season, week)
      const spreads = seasonSpreads(weeks)
      const lit = weeks.flatMap(lightsOf)
      const made = lit.filter((l) => l.made).length
      const luck =
        spreads === null
          ? "nothing elsewhere could move us"
          : `the league's luck adds up to ${inSpreads(spreads)} spreads`
      return `Over ${counted(weeks.length, "week")} followed, ${luck}. ${made} of ${counted(lit.length, "light")} made.`
    }
    case "outro": {
      return ended(season, week)
        ? `That's the series for the ${name}.`
        : "Next week, we ask again."
    }
    default: {
      return assertNever(id)
    }
  }
}
