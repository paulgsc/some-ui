import {
  EMPTY_LEDGER,
  LEDGER_PROFILE,
  LEDGER_SCHEMA_VERSION,
  parseLedger,
  recordObservations,
  RING_CAPACITY,
} from "@leetype/lib/leetype/ledger"
import type { Observation } from "@leetype/lib/leetype/ledger/observation"
import { observationsOfCommitment } from "@leetype/lib/leetype/ledger/observation"
import { PROPOSITION_REGISTER } from "@leetype/lib/leetype/proposition-register/generated"
import type { PropositionId } from "@leetype/lib/leetype/proposition-register/generated"
import { propositionPoolOf } from "@leetype/lib/leetype/round-probe"
import { describe, expect, it } from "vitest"

function card(
  at: number,
  choice: PropositionId | "abstain",
  answerId: PropositionId = "CW-P6"
): ReturnType<typeof observationsOfCommitment> {
  return observationsOfCommitment({
    answerId,
    presented: [
      ...new Set<PropositionId>([answerId, "CW-P3", "CW-P8", "CW-P11"]),
    ],
    commitment:
      choice === "abstain"
        ? { kind: "abstain" }
        : { kind: "choice", id: choice },
    roundId: `round-${at}`,
    rewriteKey: `rw:${at}`,
    sessionId: "s-1",
    at,
  })
}

describe("the ledger (L1) — sparse, keyed by CW-P id, bounded", () => {
  it("stores nothing for a proposition never presented: unseen is absence", () => {
    const ledger = recordObservations(EMPTY_LEDGER, card(1, "CW-P6"))
    expect(Object.keys(ledger.entries).sort()).toEqual(
      ["CW-P11", "CW-P3", "CW-P6", "CW-P8"].sort()
    )
    // Sixteen register entries, four rows: not one row per entry.
    expect(Object.keys(PROPOSITION_REGISTER)).toHaveLength(16)
    expect(ledger.entries["CW-P1"]).toBeUndefined()
  })

  it("keys by proposition, so one proposition's evidence spans rounds", () => {
    let ledger = EMPTY_LEDGER
    ledger = recordObservations(ledger, card(1, "CW-P6"))
    ledger = recordObservations(ledger, card(2, "CW-P6"))
    expect(
      ledger.entries["CW-P6"]?.ring.map((observation) => observation.roundId)
    ).toEqual(["round-1", "round-2"])
  })

  it("keeps each ring bounded and timestamp-ordered, newest kept (Def. 5.5, Ax. 5.1)", () => {
    let ledger = EMPTY_LEDGER
    // Arrive out of order: the fold still stores them by `at`.
    const times = Array.from({ length: RING_CAPACITY + 5 }, (_, i) => i + 1)
    for (const at of [...times].reverse()) {
      ledger = recordObservations(ledger, card(at, "CW-P3"))
    }
    const ring = ledger.entries["CW-P6"]?.ring ?? []
    expect(ring).toHaveLength(RING_CAPACITY)
    expect(ring.map((observation) => observation.at)).toEqual(
      times.slice(-RING_CAPACITY)
    )
  })

  it("is idempotent over a replayed observation (Ax. 5.1)", () => {
    const once = recordObservations(EMPTY_LEDGER, card(1, "CW-P6"))
    expect(recordObservations(once, card(1, "CW-P6"))).toEqual(once)
  })

  it("never loses the fact of a correct selection to ring eviction", () => {
    let ledger = recordObservations(EMPTY_LEDGER, card(1, "CW-P6"))
    for (let at = 2; at < RING_CAPACITY + 10; at += 1) {
      ledger = recordObservations(ledger, card(at, "abstain"))
    }
    const entry = ledger.entries["CW-P6"]
    expect(
      entry?.ring.some(
        (observation: Observation) => observation.outcome.kind === "correct"
      )
    ).toBe(false)
    expect(entry?.recognizedAt).toBe(1)
  })

  it("has a footprint independent of rounds played (Thm. 7.1)", () => {
    let ledger = EMPTY_LEDGER
    const ids = propositionPoolOf().map(({ id }) => id)
    for (let at = 1; at <= 2_000; at += 1) {
      const answerId = ids[at % ids.length]!
      ledger = recordObservations(
        ledger,
        observationsOfCommitment({
          answerId,
          presented: [answerId],
          commitment: { kind: "choice", id: answerId },
          roundId: "count-present-sorted-lookup",
          rewriteKey: "rw:0123456789abcdef",
          sessionId: "s-lmn0pq12-3abcde",
          at: 1_790_000_000_000 + at,
        })
      )
    }
    const bytes = JSON.stringify(ledger).length
    // 16 entries × 16 observations × ~220 B: the bound `RING_CAPACITY` states.
    expect(bytes).toBeLessThan(16 * RING_CAPACITY * 260)
  })
})

describe("parseLedger — validated on read, every failure empty (Thm. 7.2, 7.3)", () => {
  const good = recordObservations(EMPTY_LEDGER, card(1, "CW-P6"))

  it("round-trips through JSON", () => {
    expect(parseLedger(JSON.parse(JSON.stringify(good)))).toEqual(good)
  })

  it("discards an unknown schema or profile version whole", () => {
    expect(parseLedger({ ...good, schema: LEDGER_SCHEMA_VERSION + 1 })).toEqual(
      EMPTY_LEDGER
    )
    expect(parseLedger({ ...good, profile: `${LEDGER_PROFILE}-next` })).toEqual(
      EMPTY_LEDGER
    )
    expect(parseLedger("not a ledger")).toEqual(EMPTY_LEDGER)
    expect(parseLedger(null)).toEqual(EMPTY_LEDGER)
  })

  it("drops one malformed or unknown entry and keeps the rest", () => {
    const parsed = parseLedger({
      ...good,
      entries: {
        ...good.entries,
        // Not "CW-Pn"-shaped: scripts/check-proposition-citations.ts
        // would flag that literal as a real dangling citation.
        "not-a-real-proposition-id": good.entries["CW-P6"],
        "CW-P3": { ring: [{ outcome: { kind: "sort-of" } }] },
        "CW-P8": { ring: [] },
      },
    })
    expect(Object.keys(parsed.entries).sort()).toEqual(["CW-P11", "CW-P6"])
    expect(parsed.entries["CW-P6"]).toEqual(good.entries["CW-P6"])
  })
})
