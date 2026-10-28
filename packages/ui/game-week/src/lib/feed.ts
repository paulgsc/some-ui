/**
 * What home tells the phone during a game week, as one port: the week's
 * games, and for the game being watched the latest offer (the live strip,
 * the scenarios that can be happening now, and what just happened). Home's
 * scenario engine (GWB3) makes the offers and a live connection (GWB4)
 * carries them; until then `fixtureFeed` stands in for both in development
 * and tests, and the Android app gets `awayFeed`: no offers, as away from
 * home. A real source plugs in as another `FeedPort`.
 */
import type { ScenarioId } from "@some-ui/game-scenarios"

/** One game of the week, read through SF. */
export type Game = {
  /** ESPN's id for the game: what each bite says it is about. */
  readonly id: string
  /** "SF vs SEA", as the picker shows it. */
  readonly label: string
  /** The result SF wants from it, in a few words. */
  readonly want: string
  /** Kickoff, ISO 8601. */
  readonly kickoff: string
}

/** A scenario that can be happening now, as the screen offers it. */
export type OfferCard = {
  readonly scenario: ScenarioId
  /** The live detail under its name: "3rd & 9 at the SEA 38". */
  readonly context: string
  /** 1 is the likeliest. */
  readonly rank: number
}

/** A scenario that just happened, and when. */
export type JustHappened = {
  readonly scenario: ScenarioId
  readonly context: string
  /** When it happened, ISO 8601. */
  readonly at: string
}

/** One offer from home: what the screen shows for one game at one moment. */
export type Offer = {
  /** Home's number for this offer; a later offer has a larger one. */
  readonly seq: number
  readonly gameId: string
  /** The live strip: clock and situation, as home words it. */
  readonly strip: string
  readonly cards: ReadonlyArray<OfferCard>
  readonly justHappened: ReadonlyArray<JustHappened>
}

/** What the phone knows of the week right now. */
export type Feed = {
  readonly games: ReadonlyArray<Game>
  /** The latest offer, or null while home is out of reach (away). */
  readonly offer: Offer | null
}

export type FeedPort = {
  /**
   * Calls `listener` with what is known now, then on each change. Returns
   * the unsubscribe.
   */
  watch: (listener: (feed: Feed) => void) => () => void
}

/** No games and no offers: the phone has no word from home. */
export const awayFeed: FeedPort = {
  watch(listener): () => void {
    listener({ games: [], offer: null })
    return () => undefined
  },
}

const MINUTE = 60_000

/**
 * A made-up Sunday, for development and tests: one game under way, a full
 * offer and three things that just happened, timed from `now()` at watch.
 * Never the Android app's source: its game ids are not ESPN's.
 */
export function fixtureFeed(now: () => number = Date.now): FeedPort {
  return {
    watch(listener): () => void {
      const at = now()
      const iso = (ms: number): string => new Date(ms).toISOString()
      const games: ReadonlyArray<Game> = [
        {
          id: "fixture-1",
          label: "SF vs SEA",
          want: "SF win",
          kickoff: iso(at - 70 * MINUTE),
        },
        {
          id: "fixture-2",
          label: "LAR at ARI",
          want: "LAR loss",
          kickoff: iso(at + 180 * MINUTE),
        },
      ]
      listener({
        games,
        offer: {
          seq: 41,
          gameId: "fixture-1",
          strip: "Q3 8:42 · SF 17, SEA 13 · 3rd & 9 at the SEA 38",
          cards: [
            {
              scenario: "in.third-long",
              context: "3rd & 9 at the SEA 38",
              rank: 1,
            },
            {
              scenario: "in.play-call",
              context: "Shotgun, three wide",
              rank: 2,
            },
            { scenario: "in.sack", context: "Pressure off the edge", rank: 3 },
            {
              scenario: "in.penalty",
              context: "Flag on the last snap",
              rank: 4,
            },
            { scenario: "in.big-play", context: "Single-high safety", rank: 5 },
            {
              scenario: "in.red-zone",
              context: "Two first downs away",
              rank: 6,
            },
          ],
          justHappened: [
            {
              scenario: "in.big-play",
              context: "31-yard catch over the middle",
              at: iso(at - 0.5 * MINUTE),
            },
            {
              scenario: "in.injury",
              context: "SEA corner down, now off",
              at: iso(at - 1.25 * MINUTE),
            },
            {
              scenario: "in.kick",
              context: "SEA 44-yard field goal",
              at: iso(at - 2.5 * MINUTE),
            },
          ],
        },
      })
      return () => undefined
    },
  }
}
