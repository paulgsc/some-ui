/**
 * RR6 (#2237): a note goes home named by its card, and a refine's new take
 * names the earlier note it refines, in the `ref` home's rule takes.
 */
import type { Round } from "@rust-rounds/lib/formats"
import { NOTHING_HELD } from "@rust-rounds/lib/play/held"
import { homeRef } from "@rust-rounds/lib/play/home-ref"
import { lineOf } from "@rust-rounds/lib/play/machine"
import { INDEXING_01 } from "@rust-rounds/lib/worked-example"
import { describe, expect, it } from "vitest"

const BORROW: Round = {
  ...INDEXING_01,
  id: "borrowing-01",
  concept: "borrowing",
  cards: [
    {
      kind: "refine",
      id: "say-again",
      note: "9f1c2d3e-0000-4000-8000-000000000001",
      nudge: "rustc names a trait here.",
      aim: "understand",
      say: "Say which trait is missing.",
    },
  ],
}

const HELD = { ...NOTHING_HELD, rounds: [BORROW] }

/** Home's `ref` rule (paulgsc/server `voice_repo::is_name`). */
const HOME_REF = /^[A-Za-z0-9_.:-]{1,200}$/

describe("homeRef", () => {
  it("names a card by its round and id, joined as home's rule allows", () => {
    const card = INDEXING_01.cards[0]
    if (card === undefined) throw new Error("the worked example has a card")
    const ref = homeRef(lineOf({ round: INDEXING_01.id, card: card.id }), HELD)
    expect(ref).toBe(`${INDEXING_01.id}:${card.id}`)
    expect(ref).toMatch(HOME_REF)
  })

  it("names the earlier note a refine card brings back, so the pair is home's record", () => {
    const ref = homeRef(
      lineOf({ round: "borrowing-01", card: "say-again" }),
      HELD
    )
    expect(ref).toBe(
      "borrowing-01:say-again:9f1c2d3e-0000-4000-8000-000000000001"
    )
    expect(ref).toMatch(HOME_REF)
  })

  it("names no card for a line no card makes", () => {
    for (const line of ["", "rust-rounds:", "lens:two-cups", "rust-rounds:a"]) {
      expect(homeRef(line, HELD)).toBeNull()
    }
    // A card of a round the phone no longer holds is still named.
    expect(homeRef(lineOf({ round: "gone-01", card: "a" }), HELD)).toBe(
      "gone-01:a"
    )
  })
})
