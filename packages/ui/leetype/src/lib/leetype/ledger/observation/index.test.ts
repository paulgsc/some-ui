import { observationsOfCommitment } from "@leetype/lib/leetype/ledger/observation"
import type { PropositionId } from "@leetype/lib/leetype/proposition-register/generated"
import { describe, expect, it } from "vitest"

const PRESENTED: ReadonlyArray<PropositionId> = [
  "CW-P3",
  "CW-P6",
  "CW-P8",
  "CW-P11",
]

const CARD = {
  answerId: "CW-P6",
  presented: PRESENTED,
  roundId: "count-present-sorted-lookup",
  rewriteKey: "rw:0000000000000000",
  sessionId: "s-1",
  at: 1_000,
} as const

describe("observationsOfCommitment — Prop. 9.1's three observations", () => {
  it("records a correct selection as `correct`, under the answer as witness", () => {
    const filed = observationsOfCommitment({
      ...CARD,
      commitment: { kind: "choice", id: "CW-P6" },
    })
    expect(filed[0]).toEqual({
      about: "CW-P6",
      observation: {
        outcome: { kind: "correct" },
        propositionId: "CW-P6",
        role: "witness",
        roundId: CARD.roundId,
        rewriteKey: CARD.rewriteKey,
        sessionId: CARD.sessionId,
        at: CARD.at,
      },
    })
  })

  it("records which wrong proposition was chosen — the content of the misconception", () => {
    const filed = observationsOfCommitment({
      ...CARD,
      commitment: { kind: "choice", id: "CW-P8" },
    })
    expect(filed[0]?.observation.outcome).toEqual({
      kind: "incorrect",
      chosen: "CW-P8",
    })
  })

  it("records abstention as its own case: not null, not absent, not incorrect", () => {
    const filed = observationsOfCommitment({
      ...CARD,
      commitment: { kind: "abstain" },
    })
    expect(filed).toHaveLength(PRESENTED.length)
    for (const { observation } of filed) {
      expect(observation.outcome).toEqual({ kind: "abstain" })
    }
  })

  it("files one distractor observation under every other presented option", () => {
    const filed = observationsOfCommitment({
      ...CARD,
      commitment: { kind: "choice", id: "CW-P6" },
    })
    expect(filed.map(({ about }) => about)).toEqual([
      "CW-P6",
      "CW-P3",
      "CW-P8",
      "CW-P11",
    ])
    expect(filed.slice(1).map(({ observation }) => observation.role)).toEqual([
      "distractor",
      "distractor",
      "distractor",
    ])
    // Every observation names the card's answer, whatever entry it is filed under.
    for (const { observation } of filed) {
      expect(observation.propositionId).toBe("CW-P6")
    }
  })

  it("has no two-valued accessor: the outcome is exactly its kind (and `chosen`)", () => {
    const outcomes = [
      { kind: "choice", id: "CW-P6" },
      { kind: "choice", id: "CW-P3" },
      { kind: "abstain" },
    ] as const
    const keys = outcomes.map((commitment) =>
      Object.keys(
        observationsOfCommitment({ ...CARD, commitment })[0]!.observation
          .outcome
      ).sort()
    )
    expect(keys).toEqual([["kind"], ["chosen", "kind"], ["kind"]])
  })

  it("refuses a choice that was not on the card rather than misfiling it", () => {
    expect(() =>
      observationsOfCommitment({
        ...CARD,
        commitment: { kind: "choice", id: "CW-P16" },
      })
    ).toThrow(/not an option/)
  })
})
