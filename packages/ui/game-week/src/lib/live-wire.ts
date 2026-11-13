/**
 * The game day's live socket, as the recorder reads it (GWB4, #2078): what
 * home sends and what the phone says, in version 1 of paulgsc/server
 * `websocket/game_live/wire.rs`. Pure; the app's `lib/home-link/live` owns
 * the socket and hands its frames here.
 *
 * `__tests__/game-live-messages.snapshot.json` is a copy of what the
 * server's `dump-game-live-messages` writes (its `check_client_fixtures.py`
 * compares the two), and `__tests__/live-wire.test.ts` reads every message
 * in it with `readHome` and writes every phone message with `helloText` and
 * `pingText`, so a change on either side the other cannot read fails a test.
 */
import { isRecord, jsonOf } from "@some-ui/core-utils"
import { isScenarioId } from "@some-ui/game-scenarios"

import type { FeedChoice, Game, JustHappened, Offer, OfferCard } from "./feed"
import { gameLabel, wantLine } from "./words"

/** The one version of the messages this build speaks. */
const LIVE_VERSION = 1

/** A game of the week, as home sends it. */
type HomeGame = {
  readonly id: string
  readonly home: string
  readonly away: string
  readonly kickoff: string
  readonly want: string | null
}

/** What home sent, as read. */
export type HomeMessage =
  | {
      readonly kind: "offer"
      readonly seq: number
      readonly following: boolean
      readonly games: ReadonlyArray<Game>
      readonly offer: Offer | null
    }
  | { readonly kind: "pong"; readonly phoneAt: number; readonly homeAt: number }
  /** Another version of the messages: this build cannot read it. */
  | { readonly kind: "version" }
  | { readonly kind: "unreadable" }

const isString = (value: unknown): value is string => typeof value === "string"
const isWhole = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value)
const orNull = (value: unknown): value is string | null =>
  value === null || value === undefined || isString(value)

function homeGame(value: unknown): HomeGame | null {
  if (
    !isRecord(value) ||
    !isString(value.id) ||
    !isString(value.home) ||
    !isString(value.away) ||
    !isString(value.kickoff) ||
    Number.isNaN(Date.parse(value.kickoff)) ||
    !orNull(value.want)
  ) {
    return null
  }
  return {
    id: value.id,
    home: value.home,
    away: value.away,
    kickoff: value.kickoff,
    want: value.want ?? null,
  }
}

/** A game home sent, as the recorder lists it, in its words. */
function asGame(game: HomeGame): Game {
  return {
    id: game.id,
    label: gameLabel(game.home, game.away),
    want: wantLine(game.want),
    kickoff: game.kickoff,
  }
}

type Line = { readonly id: string; readonly line: string }

function lineOf(value: unknown): Line | null {
  return isRecord(value) && isString(value.id) && isString(value.line)
    ? { id: value.id, line: value.line }
    : null
}

/**
 * Home's offer as the recorder shows it: the strip as one line, the cards
 * ranked as home ordered them, and only scenarios this build knows (a
 * newer catalog's are left out, never guessed at). `null` when it does not
 * read.
 */
function asOffer(seq: number, value: unknown): Offer | null {
  if (!isRecord(value) || !isString(value.gameId) || !isRecord(value.strip))
    return null
  const { strip } = value
  const parts = [strip.clock, strip.possession, strip.down, strip.score]
  if (!isString(strip.clock) || !parts.every(orNull)) return null
  if (!Array.isArray(value.scenarios) || !Array.isArray(value.justHappened))
    return null
  const scenarios = value.scenarios.map(lineOf)
  const happened = value.justHappened.map((each) => {
    const read = lineOf(each)
    return read !== null && isRecord(each) && isString(each.at)
      ? { ...read, at: each.at }
      : null
  })
  if (scenarios.includes(null) || happened.includes(null)) return null
  const cards: Array<OfferCard> = []
  for (const each of scenarios) {
    if (each !== null && isScenarioId(each.id)) {
      cards.push({
        scenario: each.id,
        context: each.line,
        rank: cards.length + 1,
      })
    }
  }
  const justHappened: Array<JustHappened> = []
  for (const each of happened) {
    if (each !== null && isScenarioId(each.id)) {
      justHappened.push({ scenario: each.id, context: each.line, at: each.at })
    }
  }
  return {
    seq,
    gameId: value.gameId,
    strip: parts.filter((part) => isString(part) && part !== "").join(" · "),
    cards,
    justHappened,
  }
}

/** One text frame from home, read. Nothing it does not read is guessed. */
export function readHome(text: string): HomeMessage {
  const value = jsonOf(text)
  if (!isRecord(value) || !isString(value.type)) return { kind: "unreadable" }
  if (value.v !== LIVE_VERSION) return { kind: "version" }
  if (value.type === "pong") {
    return isWhole(value.phoneAt) && isWhole(value.homeAt)
      ? { kind: "pong", phoneAt: value.phoneAt, homeAt: value.homeAt }
      : { kind: "unreadable" }
  }
  if (
    value.type !== "offer" ||
    !isWhole(value.seq) ||
    typeof value.following !== "boolean" ||
    !Array.isArray(value.games)
  ) {
    return { kind: "unreadable" }
  }
  const games = value.games.map(homeGame)
  const offer =
    value.offer === null || value.offer === undefined
      ? null
      : asOffer(value.seq, value.offer)
  if (games.includes(null) || (offer === null && value.offer != null)) {
    return { kind: "unreadable" }
  }
  return {
    kind: "offer",
    seq: value.seq,
    following: value.following,
    games: games.flatMap((game) => (game === null ? [] : [asGame(game)])),
    offer,
  }
}

/** What the phone tells home it is on (`hello`), as one text frame. */
export function helloText(
  choice: FeedChoice,
  lastSeq: number | null,
  utcOffsetMinutes: number
): string {
  return JSON.stringify({
    type: "hello",
    v: LIVE_VERSION,
    lastSeq,
    mode: choice.mode,
    gameId: choice.gameId,
    watching: choice.watching,
    utcOffsetMinutes,
  })
}

/** A clock check (`ping`), carrying the phone's clock, as one text frame. */
export function pingText(phoneAt: number): string {
  return JSON.stringify({ type: "ping", v: LIVE_VERSION, phoneAt })
}
