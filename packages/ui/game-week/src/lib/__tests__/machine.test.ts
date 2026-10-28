import type { Said } from "@game-week/lib/bite"
import type {
  GameWeekEvent,
  GameWeekState,
  OfferView,
} from "@game-week/lib/machine"
import {
  ASK_HOLD_MS,
  currentGame,
  initialState,
  offerView,
  step,
  UNDO_MS,
} from "@game-week/lib/machine"
import { MODE_RULES } from "@game-week/lib/modes"
import { INITIAL_PREFS } from "@game-week/lib/ports"
import { NOTICES } from "@game-week/lib/words"
import { describe, expect, it } from "vitest"

import { FEED, here, KICKOFF, run, T0, take } from "./fixture"

const THIRD: Said = {
  how: "offered",
  scenario: "in.third-long",
  context: "3rd & 9 at the SEA 38",
}

/** Tapped, the microphone opened at `T0 + 100`. */
function recording(said: Said = THIRD, state = here()): GameWeekState {
  return run(state, { type: "say", said }, { type: "micOpened", at: T0 + 100 })
    .state
}

const tick = (ms: number, level: number): GameWeekEvent => ({
  type: "ticked",
  now: T0 + 100 + ms,
  level,
})

describe("a tap", () => {
  it("opens the microphone in the same step (GW1)", () => {
    const next = step(here(), { type: "say", said: THIRD })
    expect(next.state.activity.kind).toBe("opening")
    expect(next.effects).toContainEqual({ type: "openMic" })
  })

  it("starts nothing while a bite is under way", () => {
    const next = step(recording(), { type: "say", said: { how: "said-first" } })
    expect(next.effects).toEqual([])
    expect(next.state.activity.kind).toBe("recording")
  })

  it("starts nothing without a game, and says why", () => {
    const empty = run(initialState(INITIAL_PREFS, T0), {
      type: "fed",
      feed: { games: [], offer: null },
    }).state
    const next = step(empty, { type: "say", said: THIRD })
    expect(next.effects).toEqual([])
    expect(next.state.notice).toBe(NOTICES.pickFirst)
  })

  it("notes what the screen showed when talking started", () => {
    const state = recording()
    expect(
      state.activity.kind === "recording" && state.activity.moment
    ).toEqual({
      gameId: "401772981",
      seq: 41,
      strip: FEED.offer?.strip,
      watching: true,
      mode: "standard",
    })
  })
})

describe("the quiet stop (GW2)", () => {
  it("stops after the mode's quiet once talking was heard", () => {
    const quiet = MODE_RULES.standard.quietMs
    const before = run(
      recording(),
      tick(100, 0.5),
      tick(200, 0.01),
      tick(quiet + 100, 0.01)
    )
    expect(before.state.activity.kind).toBe("recording")
    const after = step(before.state, tick(quiet + 200, 0.01))
    expect(after.state.activity.kind).toBe("finishing")
    expect(after.effects).toContainEqual({ type: "finishTake" })
  })

  it("waits 3 s of quiet in Full", () => {
    const full = here({ ...INITIAL_PREFS, mode: "full" })
    const s = run(
      recording(THIRD, full),
      tick(100, 0.5),
      tick(200, 0),
      tick(2_300, 0)
    )
    expect(s.state.activity.kind).toBe("recording")
    expect(step(s.state, tick(3_200, 0)).state.activity.kind).toBe("finishing")
  })

  it("never stops on quiet before anything was heard", () => {
    const s = run(recording(), tick(100, 0), tick(5_000, 0), tick(30_000, 0))
    expect(s.state.activity.kind).toBe("recording")
  })

  it("talking again empties the quiet bar", () => {
    const s = run(
      recording(),
      tick(100, 0.5),
      tick(200, 0),
      tick(1_900, 0.4),
      tick(3_000, 0)
    )
    expect(s.state.activity.kind).toBe("recording")
  })

  it("always stops at one minute", () => {
    const s = run(recording(), tick(100, 0.5), tick(59_900, 0.6))
    expect(s.state.activity.kind).toBe("recording")
    const end = step(s.state, tick(60_000, 0.6))
    expect(end.state.activity.kind).toBe("finishing")
    expect(end.effects).toContainEqual({ type: "finishTake" })
  })

  it("Done stops it", () => {
    const next = step(recording(), { type: "done" })
    expect(next.state.activity.kind).toBe("finishing")
  })

  it("leaving, or the screen going off, stops and keeps it", () => {
    expect(step(recording(), { type: "left" }).state.activity.kind).toBe(
      "finishing"
    )
    expect(step(recording(), { type: "hidden" }).state.activity.kind).toBe(
      "finishing"
    )
  })
})

describe("keeping a bite (GW3, GW4)", () => {
  const stopped = (): GameWeekState => step(recording(), { type: "done" }).state

  it("keeps it the moment it is taken, held back for Undo", () => {
    const next = step(stopped(), {
      type: "taken",
      take: take(),
      id: "b1",
      at: T0 + 5_000,
    })
    expect(next.state.activity.kind).toBe("idle")
    expect(next.state.keeping).toEqual(["b1"])
    const keep = next.effects.find((e) => e.type === "keep")
    expect(keep?.type === "keep" && keep.bite).toMatchObject({
      id: "b1",
      gameId: "401772981",
      at: new Date(T0 + 5_000).toISOString(),
      contentType: "audio/webm;codecs=opus",
      holdUntil: T0 + 5_000 + UNDO_MS,
      fields: { how: "offered", scenario: "in.third-long", seq: "41" },
    })
  })

  it("keeps nothing under a second", () => {
    const next = step(stopped(), {
      type: "taken",
      take: take(400),
      id: "b1",
      at: T0,
    })
    expect(next.effects).toEqual([])
    expect(next.state.notice).toBe(NOTICES.tooShort)
  })

  it("holds a bite the store could not keep, until it is kept again", () => {
    const taken = step(stopped(), {
      type: "taken",
      take: take(),
      id: "b1",
      at: T0 + 5_000,
    })
    const keep = taken.effects.find((e) => e.type === "keep")
    if (keep?.type !== "keep") throw new Error("no keep")
    const failed = step(taken.state, {
      type: "keepFailed",
      bite: keep.bite,
      audio: keep.audio,
    })
    expect(failed.state.stranded.map((s) => s.bite.id)).toEqual(["b1"])
    expect(failed.state.notice).toBe(NOTICES.notKept)
    const again = step(failed.state, { type: "keepAgain", id: "b1" })
    expect(again.state.stranded).toEqual([])
    expect(again.effects).toEqual([
      {
        type: "keep",
        bite: { ...keep.bite, holdUntil: T0 + 5_000 + UNDO_MS },
        audio: keep.audio,
      },
    ])
  })
})

describe("Undo", () => {
  const kept = (): GameWeekState =>
    run(
      recording(),
      { type: "done" },
      { type: "taken", take: take(), id: "b1", at: T0 + 5_000 },
      { type: "kept", id: "b1" }
    ).state

  it("throws the bite away inside its window", () => {
    const state = kept()
    expect(state.undo?.id).toBe("b1")
    const next = step(state, { type: "undo" })
    expect(next.effects).toEqual([{ type: "undo", id: "b1" }])
    expect(next.state.undo).toBeNull()
  })

  it("closes after a few seconds, and the bite may go home", () => {
    const state = kept()
    const until = state.undo?.until ?? 0
    expect(step(state, { type: "clock", now: until - 1 }).effects).toEqual([])
    const closed = step(state, { type: "clock", now: until })
    expect(closed.effects).toEqual([{ type: "release", id: "b1" }])
    expect(step(closed.state, { type: "undo" }).effects).toEqual([])
  })

  it("closes when the next bite starts", () => {
    const next = step(kept(), { type: "say", said: THIRD })
    expect(next.effects).toContainEqual({ type: "release", id: "b1" })
    expect(next.state.undo).toBeNull()
  })

  it("says so when the bite had already gone", () => {
    expect(step(kept(), { type: "undoFailed" }).state.notice).toBe(
      NOTICES.tooLateToUndo
    )
  })
})

describe("say it first", () => {
  const asking = (state = here()): GameWeekState =>
    run(
      recording({ how: "said-first" }, state),
      { type: "done" },
      { type: "taken", take: take(), id: "b2", at: T0 + 5_000 },
      { type: "kept", id: "b2" }
    ).state

  it("keeps the bite at once, held while it asks what it was about", () => {
    const s = run(
      recording({ how: "said-first" }),
      { type: "done" },
      { type: "taken", take: take(), id: "b2", at: T0 + 5_000 }
    )
    const keep = s.effects.find((e) => e.type === "keep")
    expect(keep?.type === "keep" && keep.bite.holdUntil).toBe(
      T0 + 5_000 + ASK_HOLD_MS
    )
    expect(keep?.type === "keep" && keep.bite.fields.how).toBe("said-first")
    expect(keep?.type === "keep" && "scenario" in keep.bite.fields).toBe(false)
    expect(s.state.activity.kind).toBe("asking")
  })

  it("offers what could be happening as it stopped, with Undo open", () => {
    const state = asking()
    expect(state.activity.kind === "asking" && state.activity.offer?.seq).toBe(
      41
    )
    expect(state.undo).toEqual({ id: "b2", until: null })
    // An open question never times out on the clock.
    expect(step(state, { type: "clock", now: T0 + 60_000 }).effects).toEqual([])
  })

  it("a pick rewrites what the bite is about, then Undo runs a few seconds", () => {
    const state = asking()
    const said: Said = {
      how: "just-happened",
      scenario: "in.big-play",
      context: "31-yard catch",
    }
    const next = step(state, { type: "answer", said })
    expect(next.state.activity.kind).toBe("idle")
    const [amend] = next.effects
    expect(amend).toMatchObject({
      type: "amend",
      id: "b2",
      holdUntil: state.now + UNDO_MS,
      fields: {
        how: "just-happened",
        scenario: "in.big-play",
        context: "31-yard catch",
        seq: "41",
      },
    })
    expect(next.state.undo).toEqual({ id: "b2", until: state.now + UNDO_MS })
  })

  it("Later leaves it said first, for home to work out", () => {
    const state = asking()
    const next = step(state, { type: "answer", said: null })
    const [amend] = next.effects
    expect(amend?.type === "amend" && amend.fields.how).toBe("said-first")
    expect(amend?.type === "amend" && "scenario" in amend.fields).toBe(false)
  })

  it("Undo while asking throws it away", () => {
    const next = step(asking(), { type: "undo" })
    expect(next.effects).toEqual([{ type: "undo", id: "b2" }])
    expect(next.state.activity.kind).toBe("idle")
  })

  it("an answer before the keep lands still amends, and Undo opens on the keep", () => {
    const s = run(
      recording({ how: "said-first" }),
      { type: "done" },
      { type: "taken", take: take(), id: "b2", at: T0 + 5_000 },
      { type: "answer", said: null }
    )
    expect(s.effects).toContainEqual(
      expect.objectContaining({ type: "amend", id: "b2" })
    )
    expect(s.state.undo).toBeNull()
    expect(step(s.state, { type: "kept", id: "b2" }).state.undo?.id).toBe("b2")
  })

  it("a pick from every scenario names no offer", () => {
    const next = step(asking(), {
      type: "answer",
      said: { how: "every-scenario", scenario: "post.result", context: "" },
    })
    const [amend] = next.effects
    expect(amend?.type === "amend" && amend.fields).toMatchObject({
      how: "every-scenario",
      scenario: "post.result",
    })
  })
})

describe("away from home", () => {
  const away = here(INITIAL_PREFS, { games: FEED.games, offer: null })

  it("offers nothing", () => {
    expect(offerView(away)).toBeNull()
  })

  it("still records said first and from every scenario, with no offer named", () => {
    for (const said of [
      { how: "said-first" },
      { how: "every-scenario", scenario: "in.turnover", context: "" },
    ] as const) {
      const s = run(
        recording(said, away),
        { type: "done" },
        { type: "taken", take: take(), id: "b3", at: T0 + 5_000 }
      )
      const keep = s.effects.find((e) => e.type === "keep")
      expect(keep?.type === "keep" && keep.bite.fields).toMatchObject({
        how: said.how,
        strip: "",
      })
      expect(keep?.type === "keep" && "seq" in keep.bite.fields).toBe(false)
    }
  })

  it("an offer for another game is not this game's", () => {
    const other = step(here(), { type: "pickGame", gameId: "401772990" }).state
    expect(currentGame(other)?.id).toBe("401772990")
    expect(offerView(other)).toBeNull()
  })
})

describe("modes (GW25)", () => {
  const view = (
    mode: "light" | "standard" | "full",
    feed = FEED
  ): OfferView | null => offerView(here({ ...INITIAL_PREFS, mode }, feed))

  it("shows each mode's number of cards, likeliest first", () => {
    expect(view("light")?.cards.map((c) => c.rank)).toEqual([1, 2])
    expect(view("standard")?.cards.map((c) => c.rank)).toEqual([1, 2, 3, 4])
    expect(view("full")?.cards.map((c) => c.rank)).toEqual([1, 2, 3, 4, 5, 6])
  })

  it("shows what just happened, newest first, while each mode keeps it", () => {
    expect(view("light")?.justHappened.map((j) => j.scenario)).toEqual([
      "in.big-play",
    ])
    expect(view("standard")?.justHappened.map((j) => j.scenario)).toEqual([
      "in.big-play",
      "in.injury",
    ])
    expect(view("full")?.justHappened.map((j) => j.scenario)).toEqual([
      "in.big-play",
      "in.injury",
      "in.kick",
    ])
  })

  it("offers pregame scenarios only from each mode's start", () => {
    // Kickoff in two hours: Standard (3 h) shows pregame, Light (1 h) not yet.
    const later = {
      ...FEED,
      games: [
        {
          ...FEED.games[0]!,
          kickoff: new Date(T0 + 2 * 3_600_000).toISOString(),
        },
      ],
    }
    expect(
      view("standard", later)?.cards.some((c) => c.scenario === "pre.weather")
    ).toBe(true)
    expect(
      view("light", later)?.cards.some((c) => c.scenario === "pre.weather")
    ).toBe(false)
    expect(KICKOFF).toBeLessThan(T0)
  })

  it("a mode picked is kept", () => {
    const next = step(here(), { type: "pickMode", mode: "full" })
    expect(next.effects).toEqual([
      { type: "savePrefs", prefs: { ...INITIAL_PREFS, mode: "full" } },
    ])
  })

  it("the eye says whether I'm watching, and every bite keeps it", () => {
    const off = step(here(), {
      type: "toggleWatching",
      gameId: "401772981",
    }).state
    const s = recording(THIRD, off)
    expect(s.activity.kind === "recording" && s.activity.moment.watching).toBe(
      false
    )
  })
})
