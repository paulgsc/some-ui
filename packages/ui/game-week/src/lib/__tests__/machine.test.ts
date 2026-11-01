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
  phaseOf,
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
    expect(phaseOf(next.state)).toBe("opening")
    expect(next.effects).toContainEqual({ type: "openMic" })
  })

  it("lets a bite go when tapped again while the microphone opens", () => {
    const opening = step(here(), { type: "say", said: THIRD }).state
    const next = step(opening, { type: "done" })
    expect(next.effects).toContainEqual({ type: "discardTake" })
    expect(phaseOf(next.state)).toBe("idle")
    expect(next.state.notice).toBe(NOTICES.early)
  })

  it("starts nothing while a bite is under way", () => {
    const next = step(recording(), { type: "say", said: { how: "said-first" } })
    expect(next.effects).toEqual([])
    expect(phaseOf(next.state)).toBe("recording")
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
    expect(state.activity.kind === "taking" && state.activity.moment).toEqual({
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
    expect(phaseOf(before.state)).toBe("recording")
    const after = step(before.state, tick(quiet + 200, 0.01))
    expect(phaseOf(after.state)).toBe("finishing")
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
    expect(phaseOf(s.state)).toBe("recording")
    expect(phaseOf(step(s.state, tick(3_200, 0)).state)).toBe("finishing")
  })

  it("never stops on quiet before anything was heard", () => {
    const s = run(recording(), tick(100, 0), tick(5_000, 0), tick(30_000, 0))
    expect(phaseOf(s.state)).toBe("recording")
  })

  it("talking again empties the quiet bar", () => {
    const s = run(
      recording(),
      tick(100, 0.5),
      tick(200, 0),
      tick(1_900, 0.4),
      tick(3_000, 0)
    )
    expect(phaseOf(s.state)).toBe("recording")
  })

  it("always stops at one minute", () => {
    const s = run(recording(), tick(100, 0.5), tick(59_900, 0.6))
    expect(phaseOf(s.state)).toBe("recording")
    const end = step(s.state, tick(60_000, 0.6))
    expect(phaseOf(end.state)).toBe("finishing")
    expect(end.effects).toContainEqual({ type: "finishTake" })
  })

  it("Done stops it", () => {
    const next = step(recording(), { type: "done" })
    expect(phaseOf(next.state)).toBe("finishing")
  })

  it("leaving, or the screen going off, stops and keeps it", () => {
    expect(phaseOf(step(recording(), { type: "left" }).state)).toBe("finishing")
    expect(phaseOf(step(recording(), { type: "hidden" }).state)).toBe(
      "finishing"
    )
  })
})

describe("keeping a bite (GW3, GW4)", () => {
  const stopped = (): GameWeekState => step(recording(), { type: "done" }).state

  it("offers Undo only on the bite on screen: one kept late goes home instead", () => {
    const aTaken = run(stopped(), {
      type: "taken",
      take: take(),
      id: "a",
      at: T0 + 5_000,
    }).state
    const bTaken = run(
      aTaken,
      { type: "say", said: THIRD },
      { type: "micOpened", at: T0 + 6_000 },
      { type: "done" },
      { type: "taken", take: take(), id: "b", at: T0 + 9_000 }
    ).state
    // A's keep answers only now.
    const lateA = step(bTaken, { type: "kept", id: "a" })
    expect(lateA.effects).toEqual([{ type: "release", id: "a" }])
    expect(lateA.state.undo).toBeNull()
    const keptB = step(lateA.state, { type: "kept", id: "b" })
    expect(keptB.state.undo).toEqual({ id: "b", until: T0 + 9_000 + UNDO_MS })
    expect(step(keptB.state, { type: "undo" }).effects).toContainEqual({
      type: "undo",
      id: "b",
    })
  })

  it("lists the kept bite as its row, plays it, and Undo takes the row and the sound away", () => {
    const kept = run(
      stopped(),
      { type: "taken", take: take(), id: "b1", at: T0 + 5_000 },
      { type: "kept", id: "b1" }
    ).state
    expect(kept.lastBite).toMatchObject({
      take: { id: "b1", durationMs: 4_000, kept: { place: "going" } },
      stored: true,
    })
    const asked = step(kept, { type: "play", id: "b1" })
    expect(asked.effects).toEqual([{ type: "loadAudio", id: "b1", play: 1 }])
    const playing = step(asked.state, {
      type: "loaded",
      play: 1,
      audio: new Blob(["v"]),
    })
    expect(playing.effects).toMatchObject([{ type: "playAudio", play: 1 }])
    const undone = step(playing.state, { type: "undo" })
    expect(undone.effects).toEqual([
      { type: "stopAudio" },
      { type: "undo", id: "b1" },
    ])
    expect(undone.state.lastBite).toBeNull()
    expect(undone.state.takes.playback).toEqual({ kind: "quiet" })
  })

  it("keeps it the moment it is taken, held back for Undo", () => {
    const next = step(stopped(), {
      type: "taken",
      take: take(),
      id: "b1",
      at: T0 + 5_000,
    })
    expect(phaseOf(next.state)).toBe("idle")
    expect(next.state.keeping).toEqual([
      { id: "b1", holdUntil: T0 + 5_000 + UNDO_MS, held: false },
    ])
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

  const failed = (): GameWeekState =>
    run(
      stopped(),
      { type: "taken", take: take(), id: "b1", at: T0 + 5_000 },
      { type: "keepFailed", id: "b1" }
    ).state

  it("leaves a bite the store could not keep to the store, and says so", () => {
    const state = failed()
    expect(state.keeping).toEqual([
      { id: "b1", holdUntil: T0 + 5_000 + UNDO_MS, held: true },
    ])
    expect(state.notice).toBe(NOTICES.notKept)
  })

  it("offers Undo on a bite the store holds, until the store's hold ends", () => {
    const state = failed()
    expect(state.undo).toEqual({ id: "b1", until: T0 + 5_000 + UNDO_MS })
    const undone = step(state, { type: "undo" })
    expect(undone.effects).toEqual([{ type: "undo", id: "b1" }])
    expect(undone.state.keeping).toEqual([])
    expect(undone.state.notice).toBe(NOTICES.thrownAway)
    const late = step(state, { type: "clock", now: T0 + 5_000 + UNDO_MS })
    expect(late.state.undo).toBeNull()
    expect(step(late.state, { type: "undo" }).effects).toEqual([])
  })

  it("hears when a later try keeps a held bite, and leaves its Undo as it was", () => {
    const state = failed()
    const kept = step(state, { type: "kept", id: "b1" })
    expect(kept.effects).toEqual([])
    expect(kept.state.keeping).toEqual([])
    expect(kept.state.undo).toEqual(state.undo)
    expect(kept.state.notice).toBe(NOTICES.keptNow)
  })

  it("offers no Undo on a keep that lands after its hold ran out", () => {
    const late = run(
      stopped(),
      { type: "taken", take: take(), id: "b1", at: T0 + 5_000 },
      { type: "clock", now: T0 + 5_000 + UNDO_MS },
      { type: "keepFailed", id: "b1" }
    ).state
    expect(late.undo).toBeNull()
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

  it("is offered until the store's hold ends, however late the keep lands", () => {
    const late = run(
      recording(),
      { type: "done" },
      { type: "taken", take: take(), id: "b1", at: T0 + 5_000 },
      { type: "clock", now: T0 + 8_000 },
      { type: "kept", id: "b1" }
    ).state
    expect(late.undo).toEqual({ id: "b1", until: T0 + 5_000 + UNDO_MS })
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
    expect(phaseOf(s.state)).toBe("asking")
  })

  it("offers what could be happening as it stopped, with Undo open", () => {
    const state = asking()
    expect(state.activity.kind === "asking" && state.activity.offer?.seq).toBe(
      41
    )
    expect(state.undo).toEqual({ id: "b2", until: null })
    // An open question lasts as long as the bite's hold.
    const later = step(state, { type: "clock", now: T0 + 60_000 })
    expect(later.effects).toEqual([])
    expect(phaseOf(later.state)).toBe("asking")
  })

  it("closes the question and Undo when the bite's hold runs out, leaving it Later", () => {
    const ends = T0 + 5_000 + ASK_HOLD_MS
    const state = asking()
    expect(
      step(state, { type: "clock", now: ends - 1 }).state.activity.kind
    ).toBe("asking")
    const closed = step(state, { type: "clock", now: ends })
    // The store already let it go as it was: nothing to amend or release.
    expect(closed.effects).toEqual([])
    expect(phaseOf(closed.state)).toBe("idle")
    expect(closed.state.undo).toBeNull()
    expect(closed.state.notice).toBe(NOTICES.askClosed)
    expect(step(closed.state, { type: "undo" }).effects).toEqual([])
    expect(step(closed.state, { type: "answer", said: THIRD }).effects).toEqual(
      []
    )
  })

  it("says so when an answer is refused as too late, not dropping it silently", () => {
    const answered = step(asking(), { type: "answer", said: THIRD }).state
    expect(
      step(answered, { type: "amendFailed", onItsWay: true }).state.notice
    ).toBe(NOTICES.tooLateToNote)
    expect(
      step(answered, { type: "amendFailed", onItsWay: false }).state.notice
    ).toBe(NOTICES.notNoted)
  })

  it("keeps Undo open on a bite the store holds while it asks", () => {
    const s = run(
      recording({ how: "said-first" }),
      { type: "done" },
      { type: "taken", take: take(), id: "b2", at: T0 + 5_000 },
      { type: "keepFailed", id: "b2" }
    )
    expect(phaseOf(s.state)).toBe("asking")
    expect(s.state.undo).toEqual({ id: "b2", until: null })
  })

  it("a pick adds what the bite was about, still said first, then Undo runs a few seconds", () => {
    const state = asking()
    const said: Said = {
      how: "just-happened",
      scenario: "in.big-play",
      context: "31-yard catch",
    }
    const next = step(state, { type: "answer", said })
    expect(phaseOf(next.state)).toBe("idle")
    const [amend] = next.effects
    expect(amend).toMatchObject({
      type: "amend",
      id: "b2",
      holdUntil: state.now + UNDO_MS,
      fields: {
        how: "said-first",
        scenario: "in.big-play",
        context: "31-yard catch",
        seq: "41",
      },
    })
    expect(next.state.undo).toEqual({ id: "b2", until: state.now + UNDO_MS })
  })

  it("Undo while asking throws it away", () => {
    const next = step(asking(), { type: "undo" })
    expect(next.effects).toEqual([{ type: "undo", id: "b2" }])
    expect(phaseOf(next.state)).toBe("idle")
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

  it("an answer given while the keep fails reaches the store, and the screen says the bite isn't kept", () => {
    const s = run(
      recording({ how: "said-first" }),
      { type: "done" },
      { type: "taken", take: take(), id: "b2", at: T0 + 5_000 },
      { type: "answer", said: null },
      { type: "keepFailed", id: "b2" }
    )
    // The amend left with the answer, after the keep: the store applies it
    // to the bite it holds.
    expect(s.effects).toEqual([])
    expect(s.state.notice).toBe(NOTICES.notKept)
    expect(
      step(s.state, { type: "amendFailed", onItsWay: false }).state.notice
    ).toBe(NOTICES.notKept)
  })

  it("an answer while keeping moves the hold Undo ends at", () => {
    const answered = run(
      recording({ how: "said-first" }),
      { type: "done" },
      { type: "taken", take: take(), id: "b2", at: T0 + 5_000 },
      { type: "clock", now: T0 + 7_000 },
      { type: "answer", said: null }
    ).state
    expect(answered.keeping).toEqual([
      { id: "b2", holdUntil: T0 + 7_000 + UNDO_MS, held: false },
    ])
    expect(step(answered, { type: "kept", id: "b2" }).state.undo).toEqual({
      id: "b2",
      until: T0 + 7_000 + UNDO_MS,
    })
  })
})

// GB1 (promise): every bite the recorder keeps carries the `how` it was
// chosen by, and a bite said first stays `said-first` whatever follows the
// stop. Family: how the bite started (offered, just happened, every
// scenario, said first) x what followed (for a bite said first: a pick from
// an offer card, from just happened or from every scenario, Later, the hold
// running out, the page left, a keep that failed and was then answered; for
// the rest: kept, the page left, a keep that failed). The bite's record is
// the keep's fields with each amend's fields put in their place, as the
// store's `amended` does (apps/www/src/lib/game-bites, whose GB1 test holds
// that side).
describe("GB1: every bite keeps how it was chosen", () => {
  const PICKS = {
    "picked an offer card": THIRD,
    "picked just happened": {
      how: "just-happened",
      scenario: "in.big-play",
      context: "31-yard catch",
    },
    "picked every scenario": {
      how: "every-scenario",
      scenario: "post.result",
      context: "",
    },
  } as const satisfies Record<string, Said>

  const STARTS: ReadonlyArray<Said> = [
    THIRD,
    PICKS["picked just happened"],
    PICKS["picked every scenario"],
    { how: "said-first" },
  ]

  type After = {
    readonly stop: GameWeekEvent
    readonly then: ReadonlyArray<GameWeekEvent>
    /** The scenario the bite ends up naming, for a bite said first. */
    readonly picked: Said | null
  }

  const done: GameWeekEvent = { type: "done" }
  const KEPT: After = { stop: done, then: [], picked: null }
  const LEFT: After = { stop: { type: "left" }, then: [], picked: null }
  const KEEP_FAILED: After = {
    stop: done,
    then: [{ type: "keepFailed", id: "b9" }],
    picked: null,
  }

  const AFTER_SAID_FIRST: Record<string, After> = {
    ...Object.fromEntries(
      Object.entries(PICKS).map(([name, said]) => [
        name,
        { stop: done, then: [{ type: "answer", said }], picked: said },
      ])
    ),
    Later: { stop: done, then: [{ type: "answer", said: null }], picked: null },
    "the hold ran out": {
      stop: done,
      then: [{ type: "clock", now: T0 + 5_000 + ASK_HOLD_MS }],
      picked: null,
    },
    "the page was left": LEFT,
    "a keep failed, then a pick": {
      stop: done,
      then: [
        { type: "keepFailed", id: "b9" },
        { type: "answer", said: THIRD },
      ],
      picked: THIRD,
    },
  }

  /** What the store ends up holding of the bite `b9`. */
  function recorded(said: Said, after: After): Record<string, string> {
    const { all } = run(
      recording(said),
      after.stop,
      { type: "taken", take: take(), id: "b9", at: T0 + 5_000 },
      ...after.then
    )
    const keeps = all.filter((e) => e.type === "keep")
    expect(keeps).toHaveLength(1)
    let fields = keeps[0]?.type === "keep" ? keeps[0].bite.fields : {}
    for (const effect of all)
      if (effect.type === "amend" && effect.id === "b9") fields = effect.fields
    return { ...fields }
  }

  for (const said of STARTS) {
    const afters: Record<string, After> =
      said.how === "said-first"
        ? AFTER_SAID_FIRST
        : {
            kept: KEPT,
            "the page was left": LEFT,
            "a keep failed": KEEP_FAILED,
          }
    for (const [name, after] of Object.entries(afters)) {
      it(`${said.how}, ${name}: says ${said.how}`, () => {
        const fields = recorded(said, after)
        expect(fields.how).toBe(said.how)
        const named = said.how === "said-first" ? after.picked : said
        if (named === null || named.how === "said-first")
          expect("scenario" in fields).toBe(false)
        else expect(fields.scenario).toBe(named.scenario)
      })
    }
  }
})

describe("with no offer for the game", () => {
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

  it("shows what just happened by home's clock running ahead as just now", () => {
    const { offer } = FEED
    if (offer === null) throw new Error("the fixture offers")
    const ahead = {
      ...FEED,
      offer: {
        ...offer,
        justHappened: [
          {
            scenario: "in.sack" as const,
            context: "Sacked on 3rd down",
            at: new Date(T0 + 2_000).toISOString(),
          },
        ],
      },
    }
    expect(view("light", ahead)?.justHappened.map((j) => j.scenario)).toEqual([
      "in.sack",
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
    expect(s.activity.kind === "taking" && s.activity.moment.watching).toBe(
      false
    )
  })
})
