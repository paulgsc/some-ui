import type { Ledger } from "@leetype/lib/leetype/ledger"
import { EMPTY_LEDGER, recordObservations } from "@leetype/lib/leetype/ledger"
import {
  demonstrated,
  DISCRIMINATION_REJECTIONS,
  RETENTION_WINDOW_BASE_MS,
  RETENTION_WINDOW_MAX_MS,
  SPACED_RETRIEVAL_MIN_GAP_MS,
  TRANSFER_REWRITES,
} from "@leetype/lib/leetype/ledger/demonstration"
import type { Observation } from "@leetype/lib/leetype/ledger/observation"
import type { PropositionId } from "@leetype/lib/leetype/proposition-register/generated"
import { READING_OPTION_COUNT } from "@leetype/lib/leetype/reading-probe"
import { describe, expect, it } from "vitest"

const P: PropositionId = "CW-P6"
const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE
const T0 = 1_790_000_000_000

type Spec = {
  role: Observation["role"]
  outcome: Observation["outcome"]
  rewriteKey?: string
  roundId?: string
  sessionId: string
  at: number
}

function observation(spec: Spec): Observation {
  return {
    outcome: spec.outcome,
    propositionId: spec.role === "witness" ? P : "CW-P8",
    role: spec.role,
    roundId: spec.roundId ?? `round-${spec.at}`,
    rewriteKey: spec.rewriteKey ?? "rw:z",
    sessionId: spec.sessionId,
    at: spec.at,
  }
}

function ledgerOf(specs: ReadonlyArray<Spec>): Ledger {
  return recordObservations(
    EMPTY_LEDGER,
    specs.map((spec) => ({ about: P, observation: observation(spec) }))
  )
}

const correct = { kind: "correct" } as const
const transfer = (rewriteKey: string, sessionId: string, at: number): Spec => ({
  role: "witness",
  outcome: correct,
  rewriteKey,
  sessionId,
  at,
})
const rejection = (sessionId: string, at: number): Spec => ({
  role: "distractor",
  outcome: correct,
  sessionId,
  at,
})

/** The smallest demonstrating history: three rewrites, one rejection, two spaced sessions. */
const FULL: ReadonlyArray<Spec> = [
  transfer("rw:a", "s1", T0),
  transfer("rw:b", "s1", T0 + MINUTE),
  transfer("rw:c", "s2", T0 + DAY),
  rejection("s2", T0 + DAY + MINUTE),
]
const LAST_QUALIFYING = T0 + DAY + MINUTE

describe("demonstrated — Def. 10.2's conjunction, each conjunct reported", () => {
  it("holds on three distinct rewrites, one rejection, and two spaced sessions", () => {
    const result = demonstrated(P, ledgerOf(FULL), LAST_QUALIFYING + MINUTE)
    expect(result.transfer).toEqual({ met: true, distinctRewrites: 3 })
    expect(result.discrimination).toEqual({ met: true, rejections: 1 })
    expect(result.retention).toEqual({ met: true, spacedSessions: 2 })
    expect(result.holds).toBe(true)
  })

  it("reports an unseen entry as nothing met, not as an error", () => {
    const result = demonstrated(P, EMPTY_LEDGER, T0)
    expect(result.holds).toBe(false)
    expect(result.transfer.distinctRewrites).toBe(0)
    expect(result.decay.expiresAt).toBeNull()
  })

  it("counts three rounds carrying one rewrite as one piece of evidence", () => {
    const result = demonstrated(
      P,
      ledgerOf([
        transfer("rw:a", "s1", T0),
        transfer("rw:a", "s1", T0 + MINUTE),
        transfer("rw:a", "s2", T0 + DAY),
        rejection("s2", T0 + DAY + MINUTE),
      ]),
      T0 + DAY + 2 * MINUTE
    )
    expect(result.transfer).toEqual({ met: false, distinctRewrites: 1 })
    expect(result.holds).toBe(false)
  })

  it("counts one round offering three rewrites as one round", () => {
    const inOneRound = (rewriteKey: string, at: number): Spec => ({
      ...transfer(rewriteKey, at < T0 + DAY ? "s1" : "s2", at),
      roundId: "one-round",
    })
    const result = demonstrated(
      P,
      ledgerOf([
        inOneRound("rw:a", T0),
        inOneRound("rw:b", T0 + MINUTE),
        inOneRound("rw:c", T0 + DAY),
        rejection("s2", T0 + DAY + MINUTE),
      ]),
      T0 + DAY + 2 * MINUTE
    )
    expect(result.transfer).toEqual({ met: false, distinctRewrites: 1 })
    expect(result.holds).toBe(false)
  })

  it("pairs rounds with rewrites, so neither is counted twice", () => {
    // Round A offers a and b; rounds B and C carry only a. Three rounds and
    // two keys pair at most twice (A–b, B–a). Round D with c makes three.
    const spec = (roundId: string, rewriteKey: string, at: number): Spec => ({
      ...transfer(rewriteKey, "s1", at),
      roundId,
    })
    const three = [
      spec("A", "rw:a", T0),
      spec("A", "rw:b", T0 + 1),
      spec("B", "rw:a", T0 + 2),
      spec("C", "rw:a", T0 + 3),
    ]
    expect(demonstrated(P, ledgerOf(three), T0 + 4).transfer).toEqual({
      met: false,
      distinctRewrites: 2,
    })
    expect(
      demonstrated(P, ledgerOf([...three, spec("D", "rw:c", T0 + 4)]), T0 + 5)
        .transfer
    ).toEqual({ met: true, distinctRewrites: 3 })
  })

  it("is not demonstrated without a correct rejection (Prop. 10.1)", () => {
    // The always-select-it learner: right every time it is the answer.
    const result = demonstrated(
      P,
      ledgerOf([
        transfer("rw:a", "s1", T0),
        transfer("rw:b", "s1", T0 + MINUTE),
        transfer("rw:c", "s2", T0 + DAY),
        {
          role: "distractor",
          outcome: { kind: "incorrect", chosen: P },
          sessionId: "s2",
          at: T0 + DAY + MINUTE,
        },
      ]),
      T0 + DAY + 2 * MINUTE
    )
    expect(result.transfer.met).toBe(true)
    expect(result.discrimination).toEqual({ met: false, rejections: 0 })
    expect(result.holds).toBe(false)
  })

  it("cannot come from a single session, however much evidence it holds", () => {
    const oneSession = Array.from({ length: 12 }, (_, index) =>
      index % 4 === 3
        ? rejection("s1", T0 + index * MINUTE)
        : transfer(`rw:${index}`, "s1", T0 + index * MINUTE)
    )
    const result = demonstrated(P, ledgerOf(oneSession), T0 + DAY)
    expect(result.transfer.met).toBe(true)
    expect(result.discrimination.met).toBe(true)
    expect(result.retention).toEqual({ met: false, spacedSessions: 1 })
    expect(result.holds).toBe(false)
  })

  it("does not count a Restart minutes later as a session boundary", () => {
    const soon = T0 + MINUTE * 5
    expect(soon - T0).toBeLessThan(SPACED_RETRIEVAL_MIN_GAP_MS)
    const result = demonstrated(
      P,
      ledgerOf([
        transfer("rw:a", "s1", T0),
        transfer("rw:b", "s1", T0 + MINUTE),
        transfer("rw:c", "s2", soon),
        rejection("s2", soon + MINUTE),
      ]),
      soon + 2 * MINUTE
    )
    expect(result.retention).toEqual({ met: false, spacedSessions: 1 })
  })
})

describe("lapse — Def. 5.4's stability, evaluated at read time (Thm. 5.3)", () => {
  it("holds inside the window two spaced sessions support, and lapses after it", () => {
    const ledger = ledgerOf(FULL)
    const edge = LAST_QUALIFYING + RETENTION_WINDOW_BASE_MS
    expect(demonstrated(P, ledger, edge).holds).toBe(true)
    const after = demonstrated(P, ledger, edge + 1)
    expect(after.holds).toBe(false)
    expect(after.decay).toEqual({
      stability: 2,
      expiresAt: edge,
      lapsed: true,
    })
    // The conjuncts are still true of the evidence; only the claim decayed.
    expect(after.transfer.met && after.discrimination.met).toBe(true)
  })

  it("decays more slowly after another successful spaced session", () => {
    const third = T0 + 3 * DAY
    const ledger = ledgerOf([...FULL, rejection("s3", third)])
    const result = demonstrated(P, ledger, third)
    expect(result.decay.stability).toBe(3)
    expect(result.decay.expiresAt).toBe(third + 2 * RETENTION_WINDOW_BASE_MS)
  })

  it("decays faster after a session with a confident error, and not after an abstention", () => {
    const later = T0 + 2 * DAY
    const withError = ledgerOf([
      ...FULL,
      {
        role: "witness",
        outcome: { kind: "incorrect", chosen: "CW-P8" },
        sessionId: "s3",
        at: later,
      },
    ])
    expect(demonstrated(P, withError, later).decay.stability).toBe(1)
    expect(demonstrated(P, withError, LAST_QUALIFYING + 4 * DAY).holds).toBe(
      false
    )

    const withAbstention = ledgerOf([
      ...FULL,
      {
        role: "witness",
        outcome: { kind: "abstain" },
        sessionId: "s3",
        at: later,
      },
    ])
    expect(demonstrated(P, withAbstention, later).decay.stability).toBe(2)
    expect(
      demonstrated(P, withAbstention, LAST_QUALIFYING + 4 * DAY).holds
    ).toBe(true)
  })
})

describe("lapse — the window is capped", () => {
  it("never supports a claim for more than a year, however stable", () => {
    const sessions = Array.from({ length: 16 }, (_, index) =>
      rejection(`s${index}`, T0 + index * DAY)
    )
    const last = T0 + 15 * DAY
    const result = demonstrated(P, ledgerOf(sessions), last)
    expect(result.decay.stability).toBe(16)
    expect(result.decay.expiresAt).toBe(last + RETENTION_WINDOW_MAX_MS)
  })
})

describe("Thm. 10.1 — the threshold is the likelihood argument, pinned", () => {
  it("is the least transfer count at which the conjunction can pass a likelihood ratio of 100 at k = 4", () => {
    const k = READING_OPTION_COUNT
    expect(k).toBeLessThanOrEqual(5)
    // One correct selection: at most k, not sufficient.
    expect(k).toBeLessThan(100)
    expect(k ** (TRANSFER_REWRITES + DISCRIMINATION_REJECTIONS)).toBe(256)
    expect(
      k ** (TRANSFER_REWRITES - 1 + DISCRIMINATION_REJECTIONS)
    ).toBeLessThan(100)
  })
})
