/**
 * What plays next, and what the log keeps: Next always has a card, and the
 * log only grows.
 */
import type { CardEvent, Round, RustcRun } from "@rust-rounds/lib/formats"
import type { Held } from "@rust-rounds/lib/play/held"
import {
  heldOverSession,
  newRounds,
  nextCard,
  NOTHING_HELD,
  playable,
  refinesWaiting,
  runOf,
} from "@rust-rounds/lib/play/held"
import { appendToLog, EMPTY_LOG } from "@rust-rounds/lib/play/log"
import { INDEXING_01, INDEXING_01_RUNS } from "@rust-rounds/lib/worked-example"
import { WORKED_LOG } from "@rust-rounds/lib/worked-example/fixture"
import { describe, expect, it } from "vitest"

const BORROW: Round = {
  ...INDEXING_01,
  id: "borrowing-01",
  concept: "borrowing",
  cards: [
    {
      kind: "refine",
      id: "a",
      note: "note-0001",
      nudge: "rustc names a trait here.",
      aim: "understand",
      say: "Say which trait is missing.",
    },
  ],
}

const ROUNDS = [INDEXING_01, BORROW]

const played = (card: string, at: string): CardEvent => ({
  round: INDEXING_01.id,
  card,
  at,
  picked: null,
  note: null,
  refines: null,
  skipped: true,
  rustc: null,
})

describe("nextCard", () => {
  it("goes on through the cards not played yet, across rounds in Mixed", () => {
    expect(nextCard(ROUNDS, EMPTY_LOG, null, null)).toEqual({
      round: INDEXING_01.id,
      card: "a",
    })
    expect(
      nextCard(ROUNDS, EMPTY_LOG, null, { round: INDEXING_01.id, card: "d" })
    ).toEqual({ round: BORROW.id, card: "a" })
  })

  it("keeps to the concept picked", () => {
    expect(nextCard(ROUNDS, EMPTY_LOG, "borrowing", null)).toEqual({
      round: BORROW.id,
      card: "a",
    })
  })

  it("brings back the card played longest ago once every card is played", () => {
    // The worked log played a to d in order; borrowing is not in it.
    expect(
      nextCard([INDEXING_01], WORKED_LOG, null, {
        round: INDEXING_01.id,
        card: "d",
      })
    ).toEqual({ round: INDEXING_01.id, card: "a" })
  })

  it("plays the one card again when a concept holds only that", () => {
    const log = appendToLog(
      EMPTY_LOG,
      { id: "s", startedAt: "2026-10-30T19:00:00Z" },
      {
        kind: "card",
        event: { ...played("a", "2026-10-30T19:01:00Z"), round: BORROW.id },
        guessedWrong: false,
      }
    )
    expect(
      nextCard(ROUNDS, log, "borrowing", { round: BORROW.id, card: "a" })
    ).toEqual({ round: BORROW.id, card: "a" })
  })
})

describe("what is new", () => {
  it("names rounds with nothing played, and refine cards waiting", () => {
    expect(newRounds(ROUNDS, WORKED_LOG).map((round) => round.id)).toEqual([
      BORROW.id,
    ])
    expect(refinesWaiting(ROUNDS, WORKED_LOG)).toBe(1)
  })
})

describe("what is held", () => {
  it("always holds the worked example, with its recorded runs", () => {
    expect(playable(NOTHING_HELD)).toEqual([INDEXING_01])
    expect(runOf(NOTHING_HELD, { round: INDEXING_01.id, card: "c" })).toEqual(
      INDEXING_01_RUNS.c
    )
    expect(runOf(NOTHING_HELD, { round: BORROW.id, card: "a" })).toBeNull()
  })
})

describe("appendToLog", () => {
  it("only adds: a session opens once, and nothing logged changes", () => {
    const head = { id: "s", startedAt: "2026-10-30T19:00:00Z" }
    const one = appendToLog(WORKED_LOG, head, {
      kind: "card",
      event: played("a", "2026-10-30T19:01:00Z"),
      guessedWrong: true,
    })
    const two = appendToLog(one, head, {
      kind: "pin",
      ref: { round: INDEXING_01.id, card: "a" },
    })
    const three = appendToLog(two, head, {
      kind: "pin",
      ref: { round: INDEXING_01.id, card: "a" },
    })
    expect(three.sessions.slice(0, -1)).toEqual(WORKED_LOG.sessions)
    expect(three.sessions.at(-1)).toEqual({
      ...head,
      cards: [played("a", "2026-10-30T19:01:00Z")],
      pinned: [{ round: INDEXING_01.id, card: "a" }],
      fromMyDesk: [],
      tutorGuessedWrong: [{ round: INDEXING_01.id, card: "a" }],
    })
  })
})

// RH1: an open session keeps its own version of every round it holds.
// Family: for a round id both hold, the stored version the same as the
// session's or different, with or without home's runs and ended programs of
// its cards. `runtime.test.ts`, "RH1", holds it through the `held` step.
describe("RH1: heldOverSession keeps the session's version of its rounds", () => {
  const ROUND_A = BORROW
  const ROUND_B: Round = { ...BORROW, concept: "borrowing-b" }
  const OTHER: Round = { ...BORROW, id: "traits-01", concept: "traits" }
  /** A run told apart from another by its toolchain. */
  const run = (patch: number): RustcRun => ({
    outcome: "compile-error",
    toolchain: `1.97.${patch}`,
    code: "E0277",
    stderr: "",
    span: null,
  })
  const session: Held = { ...NOTHING_HELD, rounds: [ROUND_A] }

  it("keeps the session's round when home's copy of the id differs, with nothing home knows of that copy", () => {
    const stored: Held = {
      ...NOTHING_HELD,
      rounds: [ROUND_B, OTHER],
      runs: { "borrowing-01/a": run(1), "traits-01/a": run(2) },
      home: { ...NOTHING_HELD.home, ended: ["borrowing-01/a", "traits-01/a"] },
    }

    const held = heldOverSession(stored, session)

    expect(held.rounds).toEqual([ROUND_A, OTHER])
    expect(held.runs).toEqual({ "traits-01/a": run(2) })
    expect(held.home.ended).toEqual(["traits-01/a"])
  })

  it("takes home's runs and ended programs when the stored round is the session's", () => {
    const stored: Held = {
      ...NOTHING_HELD,
      rounds: [{ ...ROUND_A }, OTHER],
      runs: { "borrowing-01/a": run(1) },
      home: { ...NOTHING_HELD.home, ended: ["borrowing-01/a"] },
    }

    const held = heldOverSession(stored, session)

    expect(held.rounds).toEqual([ROUND_A, OTHER])
    expect(held.runs).toEqual({ "borrowing-01/a": run(1) })
    expect(held.home.ended).toEqual(["borrowing-01/a"])
  })
})
