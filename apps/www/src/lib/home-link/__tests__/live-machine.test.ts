/**
 * The live socket's machine over every event it takes (LA21): an event made
 * under an earlier opening changes nothing, whatever the phase; and a 4400
 * is retried at once only when the hello before it told home a `lastSeq`;
 * and a socket that never opened is the home link's to wait out (AW1).
 */
import type { FeedChoice, HomeMessage } from "@some-ui/game-week"
import { describe, expect, it } from "vitest"

import type {
  LiveEvent,
  LivePhase,
  LiveState,
} from "@/lib/home-link/live-machine"
import { initialLive, step } from "@/lib/home-link/live-machine"

const CHOICE: FeedChoice = {
  mode: "standard",
  gameId: "401873010",
  watching: { "401873010": true },
}

const OFFER: HomeMessage = {
  kind: "offer",
  seq: 42,
  following: true,
  games: [],
  offer: {
    seq: 42,
    gameId: "401873010",
    strip: "",
    cards: [],
    justHappened: [],
  },
}

/** Every event made under an opening, at `at`. */
function underOpening(at: number): ReadonlyArray<LiveEvent> {
  return [
    { kind: "pairing-read", at, pairingId: "p2" },
    { kind: "paired", at, pairing: { base: "https://h.example", token: "t" } },
    { kind: "paired", at, pairing: null },
    { kind: "pairing-failed", at },
    { kind: "open-refused", at },
    { kind: "opened", at },
    { kind: "heard", at, message: OFFER, now: 1 },
    { kind: "heard", at, message: { kind: "version" }, now: 1 },
    { kind: "closed", at, code: 4400 },
    { kind: "closed", at, code: 1006 },
    { kind: "due", at, timer: "quiet" },
    { kind: "due", at, timer: "ping" },
    { kind: "due", at, timer: "retry" },
  ]
}

const PHASES: ReadonlyArray<LivePhase> = [
  "idle",
  "pairing",
  "connecting",
  "open",
]

/** A watched, paired, open socket to home at opening 1, with `lastSeq`. */
function open(lastSeq: number | null): LiveState {
  return {
    ...initialLive([]),
    phase: "open",
    opening: 1,
    watched: true,
    choice: CHOICE,
    lastSeq,
    pairedAs: "p1",
  }
}

describe("the live socket's machine", () => {
  it("ignores every event from an earlier opening, in every phase", () => {
    for (const phase of PHASES) {
      const state: LiveState = { ...open(42), phase, opening: 5 }
      for (const event of underOpening(4)) {
        expect(step(state, event)).toEqual({ state, effects: [] })
      }
    }
  })

  it("on a 4400 after a hello with a lastSeq, forgets it and opens again at once", () => {
    const said = step(open(42), { kind: "choose", choice: CHOICE })
    expect(said.effects).toEqual([
      { kind: "hello", choice: CHOICE, lastSeq: 42 },
    ])
    const closed = step(said.state, { kind: "closed", at: 1, code: 4400 })
    expect(closed.state).toMatchObject({
      phase: "pairing",
      link: "asking",
      lastSeq: null,
      attempt: 0,
    })
    expect(closed.effects.map((e) => e.kind)).toEqual([
      "close",
      "disarm",
      "arm",
      "read-pairing",
    ])
  })

  it("on a 4400 after a hello without one, waits for an update", () => {
    const said = step(open(null), { kind: "choose", choice: CHOICE })
    const closed = step(said.state, { kind: "closed", at: 1, code: 4400 })
    expect(closed.state).toMatchObject({ phase: "idle", link: "update" })
    expect(closed.effects.map((e) => e.kind)).toEqual(["close", "disarm"])
  })

  it("says hello only once home has accepted the socket", () => {
    const connecting: LiveState = { ...open(null), phase: "connecting" }
    expect(
      step(connecting, { kind: "choose", choice: CHOICE }).effects
    ).toEqual([])
    const opened = step(connecting, { kind: "opened", at: 1 })
    expect(opened.effects.map((e) => e.kind)).toEqual([
      "arm",
      "reached",
      "hello",
      "ping",
      "arm",
    ])
  })

  // AW1: every order of the link's hold beginning or ending against a
  // socket being made, found silent, or opened.
  describe("away from home (AW1)", () => {
    /** A watched socket being made at opening 1. */
    const connecting: LiveState = {
      ...open(null),
      phase: "connecting",
    }
    const kinds = (s: { effects: ReadonlyArray<{ kind: string }> }): string =>
      s.effects.map((e) => e.kind).join(",")

    it("arms no try of its own while the link holds the phone away, whatever ended the socket", () => {
      for (const state of [connecting, open(null)]) {
        for (const ending of [
          { kind: "closed", at: 1, code: 1006 },
          { kind: "due", at: 1, timer: "quiet" },
        ] as const) {
          const after = step({ ...state, held: true }, ending)
          expect(after.state.link).toBe("away")
          expect(after.effects.map((e) => e.kind)).not.toContain("arm")
        }
      }
    })

    it("tries again on its own time when the link holds nothing, and starts no stretch itself", () => {
      for (const state of [connecting, open(null)]) {
        const after = step(state, { kind: "closed", at: 1, code: 1006 })
        expect(kinds(after)).not.toContain("reached")
        expect(after.effects).toContainEqual(
          expect.objectContaining({ kind: "arm", timer: "retry" })
        )
      }
    })

    it("asks for no socket while held, and asks once when the hold ends", () => {
      const idle: LiveState = { ...open(null), phase: "idle", opening: 2 }
      const held = step(idle, { kind: "home", held: true }).state
      for (const event of [
        { kind: "watch" },
        { kind: "visibility", hidden: false },
        { kind: "relinked", pairingId: "p2" },
        { kind: "due", at: 2, timer: "retry" },
        { kind: "home", held: true },
      ] as const) {
        expect(kinds(step(held, event))).not.toContain("read-pairing")
      }
      const ended = step(held, { kind: "home", held: false })
      expect(kinds(ended)).toContain("read-pairing")
      expect(kinds(step(ended.state, { kind: "home", held: false }))).toBe("")
    })

    it("does not ask on a hold's end while hidden or not watched", () => {
      const idle: LiveState = { ...open(null), phase: "idle", held: true }
      for (const state of [
        { ...idle, hidden: true },
        { ...idle, watched: false },
      ]) {
        expect(kinds(step(state, { kind: "home", held: false }))).toBe("")
      }
    })

    it("leaves a socket being made or open alone when a hold begins", () => {
      for (const state of [connecting, open(null)]) {
        const after = step(state, { kind: "home", held: true })
        expect([after.state.phase, kinds(after)]).toEqual([state.phase, ""])
      }
    })

    it("tells the link home answered once a socket opens", () => {
      expect(
        step(connecting, { kind: "opened", at: 1 }).effects
      ).toContainEqual({ kind: "reached" })
    })
  })
})
