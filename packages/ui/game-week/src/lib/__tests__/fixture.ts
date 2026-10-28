import type { Feed } from "@game-week/lib/feed"
import type { GameWeekEvent, GameWeekState, Step } from "@game-week/lib/machine"
import { initialState, step } from "@game-week/lib/machine"
import type { Prefs } from "@game-week/lib/ports"
import { INITIAL_PREFS } from "@game-week/lib/ports"
import type { Take } from "@some-ui/voice-capture"

/** 2026-11-01 21:00 UTC: a Sunday afternoon game under way. */
export const T0 = Date.UTC(2026, 10, 1, 21)

export const KICKOFF = T0 - 70 * 60_000

export const FEED: Feed = {
  games: [
    {
      id: "401772981",
      label: "SF vs SEA",
      want: "SF win",
      kickoff: new Date(KICKOFF).toISOString(),
    },
    {
      id: "401772990",
      label: "LAR at ARI",
      want: "LAR loss",
      kickoff: new Date(T0 + 3 * 3_600_000).toISOString(),
    },
  ],
  offer: {
    seq: 41,
    gameId: "401772981",
    strip: "Q3 8:42 · SF 17, SEA 13",
    cards: [
      { scenario: "in.play-call", context: "Shotgun", rank: 2 },
      { scenario: "in.third-long", context: "3rd & 9 at the SEA 38", rank: 1 },
      { scenario: "pre.weather", context: "Rain", rank: 3 },
      { scenario: "in.sack", context: "Pressure", rank: 4 },
      { scenario: "in.penalty", context: "Flag", rank: 5 },
      { scenario: "in.big-play", context: "Deep", rank: 6 },
      { scenario: "in.kick", context: "Long", rank: 7 },
    ],
    justHappened: [
      {
        scenario: "in.kick",
        context: "44-yard field goal",
        at: new Date(T0 - 150_000).toISOString(),
      },
      {
        scenario: "in.big-play",
        context: "31-yard catch",
        at: new Date(T0 - 30_000).toISOString(),
      },
      {
        scenario: "in.injury",
        context: "Corner down",
        at: new Date(T0 - 75_000).toISOString(),
      },
    ],
  },
}

export function take(durationMs = 4_000, bytes = 2_000): Take {
  return {
    blob: new Blob(["x".repeat(bytes)], { type: "audio/webm" }),
    mimeType: "audio/webm;codecs=opus",
    durationMs,
  }
}

/** Steps `events` in order, collecting every effect. */
export function run(
  state: GameWeekState,
  ...events: ReadonlyArray<GameWeekEvent>
): Step & { all: Step["effects"] } {
  let current = state
  const all: Array<Step["effects"][number]> = []
  let last: Step = { state, effects: [] }
  for (const event of events) {
    last = step(current, event)
    current = last.state
    all.push(...last.effects)
  }
  return { ...last, all }
}

/** A page arrived, fed, at `T0`. */
export function here(
  prefs: Prefs = INITIAL_PREFS,
  feed: Feed = FEED
): GameWeekState {
  return run(
    initialState(prefs, T0),
    { type: "arrived" },
    { type: "fed", feed }
  ).state
}
