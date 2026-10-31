/**
 * What plays next, and what the log keeps: Next always has a card, and the
 * log only grows.
 */
import type { CardEvent, Round } from "@rust-rounds/lib/formats"
import {
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
