/**
 * A game's moment log, as the phone reads it (GWB14 D15, #3039): every
 * scenario entry home's engine read off the game's plays, the same entry
 * "just happened" sends the last few of, with where each sits in the game.
 * Pure. "Just happened" and the moments with no bite are two readings of
 * this one log.
 *
 * Home serves it as `GET /games/:id/moments` to a paired phone (paulgsc/server
 * `handlers/games.rs`): `{gameId, engineVersion, catalogVersion, final,
 * moments: [{id, playId, line, at, bigPlay?, unit, unitSide, period,
 * clock}]}`, in game order, one entry per play and scenario, each entry the
 * shape "just happened" sends.
 */
import { isRecord } from "@some-ui/core-utils"
import type { Moment, ScenarioId } from "@some-ui/game-scenarios"
import { isScenarioId, scenarioOf } from "@some-ui/game-scenarios"

import type { JustHappened } from "./feed"
import { momentEntryOf } from "./live-wire"

/** One moment of a game: a scenario home read off one of its plays. */
export type GameMoment = JustHappened & {
  /** ESPN's id for the play it was read off. */
  readonly playId: string
  /** The quarter of its snap: 1 to 4, 5 and on for overtime; null when home had none. */
  readonly period: number | null
  /** The game clock at its snap, as ESPN words it ("8:42"); null when home had none. */
  readonly clock: string | null
}

/** A game's moments, in game order, and whether the game is over. */
export type GameMoments = {
  readonly gameId: string
  readonly final: boolean
  readonly moments: ReadonlyArray<GameMoment>
}

/**
 * Whether a moment of each kind is a big one, worth seeing when no bite was
 * said about it (#3039: "scoring plays, turnovers, big plays"): a score
 * (a try follows every touchdown, a lead change), a turnover, a big play
 * and an onside kick. A kick isn't, since it is every punt too (C971).
 * Total over the catalog's moments, so a new one is decided here.
 */
export const BIG_MOMENTS: Readonly<Record<Moment, boolean>> = {
  pregame: false,
  kickoff: false,
  "opening-drive": false,
  "lead-change": true,
  "third-and-long": false,
  "fourth-down": false,
  try: true,
  snap: false,
  "red-zone": false,
  "two-minute": false,
  turnover: true,
  penalty: false,
  sack: false,
  "big-play": true,
  kick: false,
  injury: false,
  final: false,
  watching: false,
  halftime: false,
  "onside-kick": true,
}

/** Whether a game's moment is a big one (`BIG_MOMENTS`). */
export const isBigMoment = (scenario: ScenarioId): boolean =>
  BIG_MOMENTS[scenarioOf(scenario).moment]

const isString = (value: unknown): value is string => typeof value === "string"

/**
 * One moment, or null for one this build doesn't read; a scenario this
 * build lacks reads as none, never guessed at.
 */
function momentOf(value: unknown): GameMoment | "unknown" | null {
  const entry = momentEntryOf(value)
  if (entry === null || !isRecord(value)) return null
  const { playId, period, clock } = value
  if (
    !isString(playId) ||
    !(clock === null || isString(clock)) ||
    !(
      period === null ||
      (typeof period === "number" && Number.isSafeInteger(period) && period > 0)
    )
  )
    return null
  if (!isScenarioId(entry.id)) return "unknown"
  return {
    scenario: entry.id,
    context: entry.line,
    at: entry.at,
    ...(entry.unit === undefined ? {} : { unit: entry.unit }),
    playId,
    period,
    clock,
  }
}

/** Home's answer for a game's moments, read; null when it doesn't read. */
export function readMoments(value: unknown): GameMoments | null {
  if (
    !isRecord(value) ||
    !isString(value.gameId) ||
    typeof value.final !== "boolean" ||
    !Array.isArray(value.moments)
  )
    return null
  const moments: Array<GameMoment> = []
  for (const each of value.moments) {
    const read = momentOf(each)
    if (read === null) return null
    if (read !== "unknown") moments.push(read)
  }
  return { gameId: value.gameId, final: value.final, moments }
}

/**
 * The game's big moments no bite was said about, in game order: a bite
 * covers every moment of the play home matched it to (`saidOn`, the matched
 * plays' ids). A bite home hasn't matched covers none, so its moment shows
 * until home has.
 */
export function momentsWithNoBite(
  moments: ReadonlyArray<GameMoment>,
  saidOn: ReadonlySet<string>
): ReadonlyArray<GameMoment> {
  return moments.filter(
    (moment) => isBigMoment(moment.scenario) && !saidOn.has(moment.playId)
  )
}
