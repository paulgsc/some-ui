/**
 * RR6 (#2237): a note goes home named by its card, and a refine's new take
 * names the earlier note it refines, in the `ref` home's rule takes.
 */
import type { Round } from "@rust-rounds/lib/formats"
import type { Held } from "@rust-rounds/lib/play/held"
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

const HELD: Held = {
  ...NOTHING_HELD,
  rounds: [BORROW],
  home: { ...NOTHING_HELD.home, sent: [BORROW.id] },
}

describe("homeRef", () => {
  it("names a card by its round and id, joined as home's rule allows", () => {
    const card = INDEXING_01.cards[0]
    if (card === undefined) throw new Error("the worked example has a card")
    const ref = homeRef(lineOf({ round: INDEXING_01.id, card: card.id }), HELD)
    expect(ref).toBe(`${INDEXING_01.id}:${card.id}`)
  })

  it("names the earlier note a refine card brings back, so the pair is home's record", () => {
    const ref = homeRef(
      lineOf({ round: "borrowing-01", card: "say-again" }),
      HELD
    )
    expect(ref).toBe(
      "borrowing-01:say-again:9f1c2d3e-0000-4000-8000-000000000001"
    )
  })

  it("names no card for a line no card makes", () => {
    for (const line of ["", "rust-rounds:", "lens:two-cups", "rust-rounds:a"]) {
      expect(homeRef(line, HELD)).toBeNull()
    }
  })

  it("names no card the phone's rounds don't hold, so a refine take never goes without its note", () => {
    // As when the kept record can't be read and nothing comes back held.
    const line = lineOf({ round: "borrowing-01", card: "say-again" })
    expect(homeRef(line, NOTHING_HELD)).toBeNull()
    expect(homeRef(lineOf({ round: "gone-01", card: "a" }), HELD)).toBeNull()
    expect(homeRef(line, HELD)).not.toBeNull()
  })

  it("names a card only of a round home holds as played here, so a note on any other waits", () => {
    const line = lineOf({ round: "borrowing-01", card: "say-again" })
    const named = "borrowing-01:say-again:9f1c2d3e-0000-4000-8000-000000000001"
    const onHome = (home: Partial<Held["home"]>): Held => ({
      ...HELD,
      home: { ...NOTHING_HELD.home, ...home },
    })
    // Not sent yet: home may hold another round under its id.
    expect(homeRef(line, onHome({}))).toBeNull()
    expect(homeRef(line, onHome({ fetched: ["borrowing-01"] }))).toBe(named)
    // Home holds another round under its id, or read it before it could say.
    for (const why of ["other-round", "not-taken"] as const) {
      const refused = onHome({ refused: [{ id: "borrowing-01", why }] })
      expect(homeRef(line, refused)).toBeNull()
    }
    // Another round's standing leaves this one's notes named.
    const other = onHome({
      sent: ["borrowing-01"],
      refused: [{ id: "lifetimes-01", why: "other-round" }],
    })
    expect(homeRef(line, other)).toBe(named)
  })
})
