/**
 * The story's fixed order of slides, how long each holds when playing on its
 * own, and the voiceover line each one carries. A line is written from the
 * same week data the slide draws, so the narration and the screen state the
 * same facts.
 *
 * Two kinds of episode: the **legend**, played once, teaches the vocabulary
 * (`./words`); a **week** then uses it without teaching it again, one slide
 * per question (`./reading`), opening on the week's ways.
 */

import { ordinal } from "@some-ui/core-utils"
import { assertNever } from "@some-ui/intent-kit"

import {
  ended,
  exitLine,
  hindsight,
  hindsightLine,
  pastExit,
  seasonSpreads,
  verdictOf,
} from "./luck"
import {
  bandTally,
  byMaterial,
  callOf,
  cleanRun,
  costs,
  leagueBand,
  leagueClause,
  ownPart,
  piecesOf,
  sentence,
  stakesClause,
  weekBand,
  worseOf100,
} from "./reading"
import {
  nameOf,
  percent,
  signed,
  size,
  type StorySeason,
  type StoryWeek,
} from "./story"
import {
  BANDS,
  CALLS,
  CLEAN_RUN,
  live,
  MATERIAL,
  medalOf,
  numberWord,
  phraseOf,
  PIECE_ORDER,
  PIECES,
  STAKES,
  VERBS,
  widthOf,
} from "./words"

const WEEK_SLIDES = [
  "best",
  "road",
  "given",
  "rank",
  "podium",
  "stake",
  "verdict",
  "season",
  "outro",
] as const
export type WeekSlide = (typeof WEEK_SLIDES)[number]

export const LEGEND_SLIDES = [
  "legend",
  "pieces",
  "material",
  "bands",
  "calls",
] as const
export type LegendSlide = (typeof LEGEND_SLIDES)[number]

export type SlideId = WeekSlide | LegendSlide

export const isLegendSlide = (id: SlideId): id is LegendSlide =>
  LEGEND_SLIDES.some((s) => s === id)

/** The legend's place among the weeks: before the first. */
export const LEGEND_WEEK = 0

/** Slides with nothing to show this week are skipped, not shown empty. */
export function slidesFor(week: StoryWeek): ReadonlyArray<WeekSlide> {
  return WEEK_SLIDES.filter((id) => id !== "stake" || week.stake !== null)
}

/** Milliseconds a slide holds when playing unattended: its reveal, then a beat. */
export const HOLD_MS: Readonly<Record<SlideId, number>> = {
  best: 7500,
  road: 9000,
  given: 8000,
  rank: 7000,
  podium: 8000,
  stake: 7000,
  verdict: 6000,
  season: 7000,
  outro: 6000,
  legend: 6500,
  pieces: 10_000,
  material: 8000,
  bands: 8000,
  calls: 8000,
}

/** The model every number is read under. */
export const MODEL =
  "Each way the rest of the season can go counts once. Standings only: a tie goes to us."

/** The legend's voiceover, one line per slide. */
export function legendLine(id: LegendSlide): string {
  switch (id) {
    case "legend": {
      return "Every week there was a best way for it to go. Each short shows how close the week came, and who came closest. First, the words we use."
    }
    case "pieces": {
      return PIECE_ORDER.map((k) => {
        const p = PIECES[k]
        return `${capital(p.noun)}: ${p.who.toLowerCase()} ${p.moves}`
      }).join(" ")
    }
    case "material": {
      return `A piece is ${MATERIAL.major.word} when it can move us ${MATERIAL.major.worth}, ${MATERIAL.minor.word} at ${MATERIAL.minor.worth}, and ${MATERIAL.idle.word} ${MATERIAL.idle.worth}. ${(["made", "missed", "woke"] as const).map((v) => `${capital(VERBS[v].word)}: ${VERBS[v].means}.`).join(" ")}`
    }
    case "bands": {
      return `Each week lands in a band: of the ways it could have gone, how many would have left us worse. ${BANDS.map((b) => `${b.phrase}: ${widthOf(b.band)} weeks in 100`).join(". ")}. ${capital(CLEAN_RUN.phrase)}: ${CLEAN_RUN.means}.`
    }
    case "calls": {
      return `Next week is ${Object.values(STAKES)
        .map((s) => `${s.phrase.toLowerCase()} when ${s.means}`)
        .join(", ")}. Then the call: ${Object.values(CALLS)
        .map((c) => `${c.phrase}, ${c.means}`)
        .join("; ")}.`
    }
    default: {
      return assertNever(id)
    }
  }
}

/** "Gold", from "gold". */
const capital = (word: string): string =>
  `${word.charAt(0).toUpperCase()}${word.slice(1)}`

/** "SF over ATL": the side a piece wants, over the other. */
export const over = (home: string, away: string, want: string): string =>
  `${want} over ${want === home ? away : home}`

/** The voiceover line for one slide of a week. */
export function narration(
  season: StorySeason,
  week: StoryWeek,
  id: WeekSlide
): string {
  const { ways } = week
  switch (id) {
    case "best": {
      const needed = piecesOf(week).filter((p) => live(p.game))
      const own = needed.find((p) => p.game.kind === "own")
      const league = needed.filter((p) => p.game.kind !== "own")
      const parts = [
        ...(own ? [`our light (a ${MATERIAL[own.material].word})`] : []),
        ...(league.length > 0 ? [byMaterial(league)] : []),
      ]
      const lead = `Week ${week.week}. The best week we could have had: ${percent(ways.best)} of the ways in.`
      return parts.length > 0
        ? `${lead} It needed ${parts.join(", ")}.`
        : `${lead} No piece could move us a quarter point.`
    }
    case "road": {
      const c = costs(week)
      const ours =
        week.game === null || ownPart(week) === "tie"
          ? ""
          : c.own > 0.00005
            ? ` Our light cost ${size(c.own)} points.`
            : " Our light cost nothing."
      return `Kickoff by kickoff, the best week still possible went from ${percent(ways.best)} to ${percent(ways.actual)}.${ours} The league cost ${size(c.league)}.`
    }
    case "given": {
      const part = ownPart(week)
      const lead =
        part === "bye" || part === "tie"
          ? `With no result of ours, the week was the league's, and it ran ${phraseOf(leagueBand(week)).toLowerCase()}.`
          : `Given our ${part === "made" ? "win" : part === "missed" ? "loss" : "result"}, the league ran ${phraseOf(leagueBand(week)).toLowerCase()}.`
      return `${lead} ${leagueClause(week)}`
    }
    case "rank": {
      const clean = cleanRun(week) ? " A clean run." : ""
      return `${phraseOf(weekBand(week))}. Of every 100 ways the week could have gone, ${worseOf100(ways.rank)} would have left us worse.${clean}`
    }
    case "podium": {
      const { medals, place, eligible } = week.podium
      const said = medals
        .map(
          (m) =>
            `${capital(medalOf(m.place))}, ${m.team}: better than ${worseOf100(m.rank)} of every 100 of its ways`
        )
        .join(". ")
      const ours =
        place === null
          ? `${season.team} wasn't placed: its week couldn't move it a point.`
          : `${season.team} came ${ordinal(place)} of ${eligible}.`
      return `${said ? `${said}. ` : ""}${ours}`
    }
    case "stake": {
      const { stake } = week
      if (!stake) return ""
      const top = stake.pieces
        .filter((p) => live(p))
        .sort((a, b) => b.price - a.price)
        .slice(0, 2)
      const root = top.length
        ? ` Its best week needs ${top.map((p) => over(p.home, p.away, p.want)).join(", and ")}.`
        : ""
      return `${stakesClause(week)}${root}`
    }
    case "verdict": {
      const stopped = pastExit(season, week)
      if (stopped !== null) {
        const h = hindsight(season)
        return `We stopped watching after week ${stopped}.${h ? ` ${hindsightLine(h)}` : ""}`
      }
      const v = verdictOf(week)
      const call = CALLS[callOf(week)].phrase
      return v.kind === "watch"
        ? `${call}. ${percent(week.share.after)} of the ways the season can go get us in.`
        : `${call}. ${exitLine(v.why)}`
    }
    case "season": {
      const { weeks, bands } = bandTally(season, week)
      const greens = bands.find((b) => b.band === "all-greens")?.count ?? 0
      const reds = bands.find((b) => b.band === "all-reds")?.count ?? 0
      const spreads = seasonSpreads(weeks)
      const league =
        spreads === null ? "" : ` The league alone: ${signed(spreads)} spreads.`
      return `Over ${numberWord(weeks.length)} weeks followed: ${numberWord(greens)} all greens and ${numberWord(reds)} all reds, where counting expects one week in ten of each.${league}`
    }
    case "outro": {
      const last = ended(season, week)
        ? `That's the series for the ${nameOf(season, season.team)}.`
        : "Next week, we drive again."
      return `${sentence(season, week)} ${last}`
    }
    default: {
      return assertNever(id)
    }
  }
}
