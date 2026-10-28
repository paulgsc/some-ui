/**
 * One week read in the short's vocabulary (`./words`): the seven questions
 * every short answers, as pure functions of the week, and the sentence that
 * says them all at once. The slides and the voiceover read the same answers.
 *
 * 1. What was the best week we could have had, and what did it need?
 *    (`ways.best`, its pieces)
 * 2. When did the best week break, and what did each break cost? (`road`)
 * 3. After our result, what did we need from everyone else, and did they get
 *    it? (`given`: what woke, what was made and missed)
 * 4. How good was the week we got, among all the weeks we could have got?
 *    (`rank`, as a band)
 * 5. Whose week came closest to their own best? (`podium`)
 * 6. What can next week do, and what is its best week? (`stake`)
 * 7. Keep watching, or exit? (`verdictOf`, as a call)
 */

import { assertNever } from "@some-ui/intent-kit"

import { followed, pastExit, verdictOf } from "./luck"
import type {
  StoryKind,
  StoryPiece,
  StorySeason,
  StoryWeek,
  WayGame,
} from "./story"
import {
  bandOf,
  BANDS,
  CALLS,
  CLEAN_RUN,
  live,
  MATERIAL,
  materialOf,
  numberWord,
  phraseOf,
  STAKES,
  stakesOf,
  widthOf,
  type Band,
  type Call,
  type Material,
} from "./words"

/** One of the week's games, read against one best way. */
export type PieceRead = {
  readonly game: WayGame
  /** The piece it is read against: the week's best way, or given our result. */
  readonly piece: StoryPiece
  readonly material: Material
  /** The result went the way that best way wanted. */
  readonly made: boolean
}

const read = (game: WayGame, piece: StoryPiece): PieceRead => ({
  game,
  piece,
  material: materialOf(piece),
  made: game.winner === piece.want,
})

/** The week's games against its best way (question 1), in kickoff order. */
export const piecesOf = (week: StoryWeek): ReadonlyArray<PieceRead> =>
  week.ways.games.map((g) => read(g, g))

/**
 * The teams in our race: every side of a crossroads any week has shown, and
 * us. Next week's pieces carry no kind of their own, so this is how one is
 * named; a team not yet seen at a crossroads reads as outside it.
 */
function raceOf(season: StorySeason): ReadonlySet<string> {
  const race = new Set([season.team])
  for (const w of season.weeks)
    for (const g of w.ways.games)
      if (g.kind === "inside") {
        race.add(g.home)
        race.add(g.away)
      }
  return race
}

/** What kind of piece a game between `home` and `away` is, for us. */
export function kindOf(
  season: StorySeason,
  home: string,
  away: string
): StoryKind {
  if (home === season.team || away === season.team) return "own"
  const race = raceOf(season)
  return race.has(home) && race.has(away) ? "inside" : "exported"
}

/** Our part this week. */
export type OwnPart = "made" | "missed" | "idle" | "bye" | "tie"

export function ownPart(week: StoryWeek): OwnPart {
  if (week.game === null) return "bye"
  const own = piecesOf(week).find((p) => p.game.kind === "own")
  // A tied game is banked before the week, so it is none of the week's ways.
  if (!own) return "tie"
  if (own.material === "idle") return "idle"
  return own.made ? "made" : "missed"
}

/**
 * The league's games read against the best way left after our result
 * (question 3), or against the week's best way on a bye or a tie.
 */
export function leaguePieces(week: StoryWeek): ReadonlyArray<PieceRead> {
  const { games, given } = week.ways
  return games.flatMap((g, i) => {
    if (g.kind === "own") return []
    return [read(g, given?.pieces[i] ?? g)]
  })
}

/** Pieces our result woke: idle in the week's best way, live given our result. */
export function woke(week: StoryWeek): ReadonlyArray<PieceRead> {
  const part = ownPart(week)
  if (part !== "made" && part !== "missed") return []
  return leaguePieces(week).filter(
    (p) => p.material !== "idle" && !live(p.game)
  )
}

/** The week's band (question 4). */
export const weekBand = (week: StoryWeek): Band => bandOf(week.ways.rank)

/** The league's band: its part alone, given our result; the whole week on a bye. */
export const leagueBand = (week: StoryWeek): Band =>
  bandOf(week.ways.given?.rank ?? week.ways.rank)

/** The week's best way had a major or minor piece, and none was missed. */
export const cleanRun = (week: StoryWeek): boolean => {
  const liveOnes = piecesOf(week).filter((p) => p.material !== "idle")
  return liveOnes.length > 0 && liveOnes.every((p) => p.made)
}

/**
 * The road's drops (question 2): what each result cost the best week still
 * possible, in kickoff order, with ours apart from the league's.
 */
export function costs(week: StoryWeek): {
  readonly drops: ReadonlyArray<number>
  readonly own: number
  readonly league: number
} {
  const { road, games } = week.ways
  const drops = games.map((_, i) => (road[i] ?? 0) - (road[i + 1] ?? 0))
  const own = drops.reduce(
    (sum, d, i) => sum + (games[i]?.kind === "own" ? d : 0),
    0
  )
  const total = week.ways.best - week.ways.actual
  return { drops, own, league: total - own }
}

/** The verdict as one of the vocabulary's calls (question 7). */
export function callOf(week: StoryWeek): Call {
  const v = verdictOf(week)
  if (v.kind === "watch") return "keep-driving"
  switch (v.why) {
    case "clinched": {
      return "arrived"
    }
    case "out": {
      return "dead-end"
    }
    case "settled-in":
    case "settled-out": {
      return "park-it"
    }
    default: {
      return assertNever(v.why)
    }
  }
}

/** "four minors", "a major", "two pieces": a count of pieces by their material. */
function pieceCount(pieces: ReadonlyArray<PieceRead>): string {
  const n = pieces.length
  const kinds = new Set(pieces.map((p) => p.material))
  const only = kinds.size === 1 ? [...kinds][0] : undefined
  if (n === 1) return only ? `a ${MATERIAL[only].word}` : "a piece"
  const noun = only ? MATERIAL[only].plural : "pieces"
  return `${numberWord(n)} ${noun}`
}

/** "two majors and a minor": live pieces, majors first. */
export function byMaterial(pieces: ReadonlyArray<PieceRead>): string {
  const parts = (["major", "minor"] as const)
    .map((m) => pieces.filter((p) => p.material === m))
    .filter((group) => group.length > 0)
    .map(pieceCount)
  return parts.join(" and ")
}

const OWN_WORDS: Readonly<Record<OwnPart, string>> = {
  made: "We made our light",
  missed: "We missed our light",
  idle: "Our light was idle",
  bye: "We were parked: a bye",
  tie: "Our game was a tie",
}

/** What the league's pieces did, after our result: what woke, what was missed. */
export function leagueClause(week: StoryWeek): string {
  const awake = woke(week)
  if (awake.length > 0) {
    const made = awake.filter((p) => p.made).length
    const ours = ownPart(week) === "made" ? "win" : "loss"
    return `Our ${ours} woke ${pieceCount(awake)}; we made ${made === 0 ? "none" : numberWord(made)}.`
  }
  const liveOnes = leaguePieces(week).filter((p) => p.material !== "idle")
  const missed = liveOnes.filter((p) => !p.made)
  if (missed.length > 0) return `We missed ${byMaterial(missed)}.`
  if (liveOnes.length > 0) return "We made every major and minor."
  return "Every other piece was idle."
}

/** Next week, in words: its stakes, and whether we play. */
export function stakesClause(week: StoryWeek): string {
  const { stake } = week
  if (!stake) return "No games are left."
  const phrase = STAKES[stakesOf(stake.spread)].phrase
  return `${phrase} next week${stake.opponent === null ? ", and we have a bye" : ""}.`
}

/** The verdict, in words: the call, or when we stopped. */
function callClause(season: StorySeason, week: StoryWeek): string {
  const stopped = pastExit(season, week)
  if (stopped !== null) return `We stopped watching after week ${stopped}.`
  return `${CALLS[callOf(week)].phrase}.`
}

/**
 * The week in one sentence: "[Week]. We [made / missed] our light; the
 * league ran [phrase]. [What woke, what was missed.] [Stakes] next week.
 * [Verdict]."
 */
export function sentence(season: StorySeason, week: StoryWeek): string {
  const band = phraseOf(weekBand(week))
  const clean = cleanRun(week) ? `, ${CLEAN_RUN.phrase}` : ""
  return [
    `${band}${clean}.`,
    `${OWN_WORDS[ownPart(week)]}; the league ran ${phraseOf(leagueBand(week)).toLowerCase()}.`,
    leagueClause(week),
    stakesClause(week),
    callClause(season, week),
  ].join(" ")
}

/** Of every 100 ways the week could have gone, how many would have left us worse. */
export const worseOf100 = (rank: number): number => Math.round(rank * 100)

/** The season so far, through `week` or the exit: each band's weeks, and how many counting expects. */
export function bandTally(
  season: StorySeason,
  week: StoryWeek
): {
  readonly weeks: ReadonlyArray<StoryWeek>
  readonly bands: ReadonlyArray<{
    readonly band: Band
    readonly count: number
    readonly expected: number
  }>
} {
  const weeks = followed(season, week)
  return {
    weeks,
    bands: BANDS.map(({ band }) => ({
      band,
      count: weeks.filter((w) => weekBand(w) === band).length,
      expected: (weeks.length * widthOf(band)) / 100,
    })),
  }
}
