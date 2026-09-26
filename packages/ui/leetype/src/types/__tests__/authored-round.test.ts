import { dim, Loop, W } from "@leetype/lib/leetype/cost"
import type { Round } from "@leetype/types/authored-round"
import { CostGraphSchema, RoundSchema } from "@leetype/types/authored-round"
import { describe, expect, it } from "vitest"

const ROUND: Round = {
  id: "sum-pairs",
  algorithm: {
    language: "rust",
    entryPoint: "sum_pairs(values: &[u64]) -> u64",
    inputAlphabet: "One slice of u64 of length n.",
    source:
      "pub fn sum_pairs(values: &[u64]) -> u64 {\n    values.iter().sum()\n}\n",
  },
  constraintDiff: {
    before: [{ dimension: "n", operator: "<=", bound: 10 }],
    after: [{ dimension: "n", operator: "<=", bound: 1_000 }],
  },
  budget: { operations: 1_000 },
  graph: Loop(dim("n", 2), W(1)),
  diffOptions: [
    {
      member: {
        hunk: {
          path: "src/sum_pairs.rs",
          oldStart: 2,
          newStart: 2,
          segments: [{ kind: "addition", text: "    // fast\n" }],
        },
        propositionId: "CW-P1",
        admissible: true,
      },
      graph: Loop(dim("n"), W(1)),
      rescueCandidates: [],
      explanationPropositionId: "CW-P16",
    },
    {
      member: {
        hunk: {
          path: "src/sum_pairs.rs",
          oldStart: 2,
          newStart: 2,
          segments: [{ kind: "addition", text: "    // slow\n" }],
        },
        propositionId: "CW-P2",
        admissible: false,
        distractorStatement: "Keeps the nested loop.",
      },
      graph: Loop(dim("n", 2), W(1)),
      rescueCandidates: [
        {
          constraints: [{ dimension: "n", operator: "<=", bound: 30 }],
          propositionId: "CW-P4",
        },
      ],
      explanationPropositionId: "CW-P16",
    },
  ],
}

describe("RoundSchema", () => {
  it("accepts a well-formed round", () => {
    expect(RoundSchema.safeParse(ROUND).success).toBe(true)
  })

  it("requires A to be Rust", () => {
    const result = RoundSchema.safeParse({
      ...ROUND,
      algorithm: { ...ROUND.algorithm, language: "typescript" },
    })
    expect(result.success).toBe(false)
  })

  it("holds diffOptions' members to DiffSetSchema: exactly one admissible", () => {
    const [first, second] = ROUND.diffOptions
    if (first === undefined || second === undefined) throw new Error("fixture")
    const result = RoundSchema.safeParse({
      ...ROUND,
      diffOptions: [
        first,
        { ...second, member: { ...second.member, admissible: true } },
      ],
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues.map((issue) => issue.message).join()).toMatch(
      /exactly one member of D/
    )
  })

  it("rejects a constraint diff that moves no bound", () => {
    const result = RoundSchema.safeParse({
      ...ROUND,
      constraintDiff: {
        before: ROUND.constraintDiff.after,
        after: ROUND.constraintDiff.after,
      },
    })
    expect(result.success).toBe(false)
  })

  it("rejects a rescue candidate with an unknown proposition id", () => {
    const [first, second] = ROUND.diffOptions
    if (first === undefined || second === undefined) throw new Error("fixture")
    const result = RoundSchema.safeParse({
      ...ROUND,
      diffOptions: [
        first,
        {
          ...second,
          rescueCandidates: [
            {
              constraints: [{ dimension: "n", operator: "<=", bound: 30 }],
              // Not "CW-Pn"-shaped: scripts/check-proposition-citations.ts
              // would flag that literal as a real dangling citation.
              propositionId: "not-a-real-proposition-id",
            },
          ],
        },
      ],
    })
    expect(result.success).toBe(false)
  })
})

describe("CostGraphSchema", () => {
  it("accepts a nested graph built with lib/leetype/cost", () => {
    expect(
      CostGraphSchema.safeParse(Loop(dim("n"), Loop(dim("m"), W(1)))).success
    ).toBe(true)
  })

  it("rejects a repetition that is not in normal form", () => {
    const loop = (repetition: unknown): unknown => ({
      kind: "loop",
      repetition,
      body: { kind: "work", cost: 1 },
    })
    const n = (exponent: number): unknown => ({
      kind: "pow",
      dimension: "n",
      exponent,
    })
    expect(CostGraphSchema.safeParse(loop([n(0)])).success).toBe(false)
    expect(CostGraphSchema.safeParse(loop([n(1), n(-1)])).success).toBe(false)
    expect(CostGraphSchema.safeParse(loop([n(1), n(1)])).success).toBe(false)
    expect(
      CostGraphSchema.safeParse(
        loop([
          { kind: "pow", dimension: "n", exponent: 1 },
          { kind: "log", dimension: "n", exponent: 1 },
        ])
      ).success
    ).toBe(false)
    expect(CostGraphSchema.safeParse(loop([n(2)])).success).toBe(true)
  })

  it("rejects an unknown node kind", () => {
    expect(
      CostGraphSchema.safeParse({ kind: "recurse", cost: 1 }).success
    ).toBe(false)
  })
})
