import { AUTHORED_ROUNDS } from "@leetype/lib/leetype/authored-rounds"
import type { Ledger } from "@leetype/lib/leetype/ledger"
import { EMPTY_LEDGER, recordObservations } from "@leetype/lib/leetype/ledger"
import { observationsOfCommitment } from "@leetype/lib/leetype/ledger/observation"
import type { PropositionId } from "@leetype/lib/leetype/proposition-register/generated"
import { rewriteKeyOf, rewriteOf } from "@leetype/lib/leetype/rewrite"
import { assembleRound } from "@leetype/lib/leetype/round-assembly"
import { nextRoundCycleState } from "@leetype/lib/leetype/round-cycle"
import { roundProbeOf } from "@leetype/lib/leetype/round-probe"
import {
  BOOST_CAP,
  nextRound,
  RECENT_DAMPING,
  roundWeights,
  WEIGHT_FLOOR,
} from "@leetype/lib/leetype/round-sampler"
import type { Round } from "@leetype/types/authored-round"
import { describe, expect, it, vi } from "vitest"

const T0 = 1_790_000_000_000
const CORPUS: ReadonlyArray<Round> = AUTHORED_ROUNDS
const [COUNT_PRESENT, HAS_DUPLICATE, RANGE_SUMS, COUNT_AT_LEAST, MIN_GAP] =
  CORPUS.map((round) => round.id)

/** One card commitment, filed against a round outside the corpus unless named. */
function answered(
  ledger: Ledger,
  card: {
    answerId: PropositionId
    choice: PropositionId | "abstain"
    rewriteKey?: string
    roundId?: string
    at?: number
  }
): Ledger {
  return recordObservations(
    ledger,
    observationsOfCommitment({
      answerId: card.answerId,
      presented: [
        ...new Set<PropositionId>([
          card.answerId,
          ...(card.choice === "abstain" ? [] : [card.choice]),
        ]),
      ],
      commitment:
        card.choice === "abstain"
          ? { kind: "abstain" }
          : { kind: "choice", id: card.choice },
      roundId: card.roundId ?? "elsewhere",
      rewriteKey: card.rewriteKey ?? "rw:elsewhere",
      sessionId: "s1",
      at: card.at ?? T0,
    })
  )
}

function weightsById(ledger: Ledger): Record<string, number> {
  const weights = roundWeights(ledger, CORPUS, T0)
  return Object.fromEntries(
    CORPUS.map((round, index) => [round.id, weights[index]!])
  )
}

/**
 * The reachability bound, derived from the weight floor. A round that was
 * not the last one played weighs at least `WEIGHT_FLOOR`, and every round
 * weighs at most `WEIGHT_FLOOR + BOOST_CAP`, so each draw reaches it with
 * probability at least `p = 1 / (1 + (N − 1)(1 + BOOST_CAP))` (1/33 for
 * this corpus of five), whatever the ledger says. The chance that some
 * round is still unreached after `B` draws is at most `N (1 − p)^B`; `B`
 * below makes that one in a million.
 */
function reachBound(n: number, failure = 1e-6): number {
  const ceiling = WEIGHT_FLOOR + BOOST_CAP
  const p = WEIGHT_FLOOR / (WEIGHT_FLOOR + (n - 1) * ceiling)
  return Math.ceil(Math.log(n / failure) / -Math.log(1 - p))
}

describe("nextRound — pure, replayable, oracle-free", () => {
  it("returns the same round for the same inputs, and nothing for an empty corpus", () => {
    const ledger = answered(EMPTY_LEDGER, {
      answerId: "CW-P6",
      choice: "CW-P8",
    })
    for (let seed = 0; seed < 20; seed += 1) {
      expect(nextRound(ledger, CORPUS, seed, T0)).toBe(
        nextRound(ledger, CORPUS, seed, T0)
      )
    }
    expect(nextRound(ledger, [], 1, T0)).toBeUndefined()
  })

  it("makes no network call (Thm. 8.1)", () => {
    const fetch = vi.fn()
    vi.stubGlobal("fetch", fetch)
    try {
      nextRound(EMPTY_LEDGER, CORPUS, 7, T0)
      expect(fetch).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it("draws uniformly from a cold ledger: the uniform prior (Prop. 5.1)", () => {
    const weights = roundWeights(EMPTY_LEDGER, CORPUS, T0)
    expect(new Set(weights).size).toBe(1)
  })
})

describe("Prop. 9.1 — each response moves the distribution its own way", () => {
  it("a confident error raises discriminating counter-instances", () => {
    // Shown CW-P6's rewrite, the learner named CW-P8.
    const weights = weightsById(
      answered(EMPTY_LEDGER, { answerId: "CW-P6", choice: "CW-P8" })
    )
    // Both in D: the round where the two must be told apart.
    expect(weights[COUNT_PRESENT!]).toBeGreaterThan(weights[RANGE_SUMS!]!)
    // CW-P8 as a distractor, without CW-P6.
    expect(weights[RANGE_SUMS!]).toBe(weights[COUNT_AT_LEAST!])
    expect(weights[RANGE_SUMS!]).toBeGreaterThan(weights[HAS_DUPLICATE!]!)
    // Neither: untouched.
    expect(weights[HAS_DUPLICATE!]).toBe(weights[MIN_GAP!])
  })

  it("an abstention raises instances of the same proposition", () => {
    const weights = weightsById(
      answered(EMPTY_LEDGER, { answerId: "CW-P7", choice: "abstain" })
    )
    expect(weights[HAS_DUPLICATE!]).toBe(weights[MIN_GAP!])
    expect(weights[HAS_DUPLICATE!]).toBeGreaterThan(weights[COUNT_PRESENT!]!)
  })

  it("a correct selection raises a new rewrite of it, not the same rewrite again", () => {
    const seenOn = (roundIndex: number): string => {
      const round = CORPUS[roundIndex]!
      const option = round.diffOptions.find(
        (candidate) => candidate.member.propositionId === "CW-P7"
      )!
      return rewriteKeyOf(rewriteOf(round.graph, option.graph))
    }
    const cold = weightsById(EMPTY_LEDGER)
    const elsewhere = weightsById(
      answered(EMPTY_LEDGER, { answerId: "CW-P7", choice: "CW-P7" })
    )
    expect(elsewhere[HAS_DUPLICATE!]).toBeGreaterThan(cold[HAS_DUPLICATE!]!)
    // Both corpus rounds carry CW-P7 through one rewrite (the same key), so
    // naming it there leaves nothing new of CW-P7 to reach for.
    expect(seenOn(1)).toBe(seenOn(4))
    const same = weightsById(
      answered(EMPTY_LEDGER, {
        answerId: "CW-P7",
        choice: "CW-P7",
        rewriteKey: seenOn(1),
      })
    )
    expect(same[MIN_GAP!]).toBe(cold[MIN_GAP!])
  })

  it("damps the round just played, and never to zero", () => {
    const ledger = answered(EMPTY_LEDGER, {
      answerId: "CW-P6",
      choice: "CW-P6",
      roundId: COUNT_PRESENT!,
    })
    const weights = weightsById(ledger)
    expect(weights[COUNT_PRESENT!]).toBeGreaterThan(0)
    expect(weights[COUNT_PRESENT!]).toBeLessThan(weights[MIN_GAP!]!)
  })
})

describe("Thm. 9.1 — failure changes sampling, not access", () => {
  it("keeps every weight between the floor and the cap, whatever the ledger", () => {
    let ledger = EMPTY_LEDGER
    const ids: ReadonlyArray<PropositionId> = ["CW-P6", "CW-P7", "CW-P8"]
    for (let at = 0; at < 60; at += 1) {
      ledger = answered(ledger, {
        answerId: ids[at % 3]!,
        choice: at % 5 === 0 ? "abstain" : ids[(at + 1) % 3]!,
        roundId: CORPUS[at % CORPUS.length]!.id,
        at: T0 + at,
      })
      for (const weight of roundWeights(ledger, CORPUS, T0 + at)) {
        expect(weight).toBeGreaterThanOrEqual(RECENT_DAMPING * WEIGHT_FLOOR)
        expect(weight).toBeLessThanOrEqual(WEIGHT_FLOOR + BOOST_CAP)
      }
    }
  })

  it("reaches every round, completable, in a session answering every round wrongly", () => {
    const bound = reachBound(CORPUS.length)
    expect(bound).toBeLessThan(600)
    for (let sessionSeed = 1; sessionSeed <= 25; sessionSeed += 1) {
      let ledger = EMPTY_LEDGER
      const reached = new Set<string>()
      let draws = 0
      while (reached.size < CORPUS.length && draws < bound) {
        const seed = (sessionSeed ^ Math.imul(draws + 1, 0x9e3779b9)) >>> 0
        const at = T0 + draws * 60_000
        const round = nextRound(ledger, CORPUS, seed, at)!
        reached.add(round.id)
        draws += 1

        const assembled = assembleRound(round)
        const initial = assembled.initialState
        expect(initial.phase).toBe("posingDiffSelection")
        if (initial.phase !== "posingDiffSelection") continue
        const diff =
          assembled.diffOptions[draws % assembled.diffOptions.length]!
        const probe = roundProbeOf(diff.member, seed)
        const wrong = probe.options.find(({ id }) => id !== probe.answerId)!
        const commitment = { kind: "choice", id: wrong.id } as const
        // The cycle advances on a wrong pair as on any other (Thm. 8.1).
        expect(
          nextRoundCycleState(initial, { kind: "selectDiff", diff, commitment })
            .phase
        ).not.toBe("posingDiffSelection")

        ledger = recordObservations(
          ledger,
          observationsOfCommitment({
            answerId: probe.answerId,
            presented: probe.options.map(({ id }) => id),
            commitment,
            roundId: round.id,
            rewriteKey: rewriteKeyOf(rewriteOf(round.graph, diff.graph)),
            sessionId: `s${sessionSeed}`,
            at,
          })
        )
      }
      expect(reached.size, `session seed ${sessionSeed}`).toBe(CORPUS.length)
    }
  })
})
