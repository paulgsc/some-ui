import { dim, Loop, W } from "@leetype/lib/leetype/cost"
import {
  applyHunk,
  assembleRound,
  lintAuthoredRounds,
} from "@leetype/lib/leetype/round-assembly"
import type { Round } from "@leetype/types/authored-round"
import type { DiffHunk } from "@leetype/types/exercise"
import { describe, expect, it } from "vitest"

const SOURCE = [
  "pub fn total(values: &[u64]) -> u64 {",
  "    let mut sum = 0;",
  "    for v in values {",
  "        sum += v;",
  "    }",
  "    sum",
  "}",
  "",
].join("\n")

const HUNK: DiffHunk = {
  path: "src/total.rs",
  oldStart: 2,
  newStart: 2,
  segments: [
    {
      kind: "deletion",
      text: "    let mut sum = 0;\n    for v in values {\n        sum += v;\n    }\n    sum\n",
    },
    { kind: "addition", text: "    values.iter().sum()\n" },
  ],
}

function round(overrides: Partial<Round> = {}): Round {
  return {
    id: "total",
    algorithm: {
      language: "rust",
      entryPoint: "total(values: &[u64]) -> u64",
      inputAlphabet: "One slice of u64 of length n.",
      source: SOURCE,
    },
    constraintDiff: {
      before: [{ dimension: "n", operator: "<=", bound: 10 }],
      after: [{ dimension: "n", operator: "<=", bound: 1_000 }],
    },
    budget: { operations: 1_000 },
    graph: Loop(dim("n", 2), W(1)),
    diffOptions: [
      {
        member: { hunk: HUNK, propositionId: "CW-P7", admissible: true },
        graph: Loop(dim("n"), W(1)),
        rescueCandidates: [],
        explanationPropositionId: "CW-P16",
      },
      {
        member: {
          hunk: {
            path: "src/total.rs",
            oldStart: 4,
            newStart: 4,
            segments: [
              { kind: "context", text: "        sum += v;\n" },
              { kind: "addition", text: "        sum += 0;\n" },
            ],
          },
          propositionId: "CW-P9",
          admissible: false,
          distractorStatement: "Adds a second statement to the loop body.",
        },
        graph: Loop(dim("n", 2), W(2)),
        rescueCandidates: [
          {
            constraints: [{ dimension: "n", operator: "<=", bound: 20 }],
            propositionId: "CW-P4",
          },
        ],
        explanationPropositionId: "CW-P16",
      },
    ],
    ...overrides,
  }
}

describe("applyHunk", () => {
  it("replaces context and deletion text with context and addition text", () => {
    const applied = applyHunk(SOURCE, HUNK)
    expect(applied).toEqual({
      ok: true,
      source:
        "pub fn total(values: &[u64]) -> u64 {\n    values.iter().sum()\n}\n",
    })
  })

  it("refuses a hunk whose old text is not at oldStart", () => {
    const applied = applyHunk(SOURCE, { ...HUNK, oldStart: 3, newStart: 3 })
    expect(applied.ok).toBe(false)
  })

  it("refuses a start line past the end of the source", () => {
    const applied = applyHunk(SOURCE, { ...HUNK, oldStart: 40, newStart: 40 })
    expect(applied).toEqual({
      ok: false,
      reason: "oldStart 40 is past the end of the source",
    })
  })

  it("refuses a hunk whose newStart differs from oldStart", () => {
    expect(applyHunk(SOURCE, { ...HUNK, newStart: 3 }).ok).toBe(false)
  })

  it("refuses a hunk that only carries context", () => {
    const applied = applyHunk(SOURCE, {
      ...HUNK,
      segments: [{ kind: "context", text: "    let mut sum = 0;\n" }],
    })
    expect(applied.ok).toBe(false)
  })
})

describe("assembleRound", () => {
  it("builds A + d per member and opens on D at C′", () => {
    const assembled = assembleRound(round())
    expect(assembled.patchedSources[0]).toContain("values.iter().sum()")
    expect(assembled.patchedSources[1]).toContain("sum += 0;")
    expect(assembled.initialState.phase).toBe("posingDiffSelection")
  })

  it("throws, naming the round and option, when a hunk does not apply", () => {
    const broken = round({
      algorithm: { ...round().algorithm, source: "fn x() {}\n" },
    })
    expect(() => assembleRound(broken)).toThrow(/round "total", diff option 0/)
  })
})

describe("lintAuthoredRounds", () => {
  it("passes a well-formed round", () => {
    expect(lintAuthoredRounds([round()])).toEqual([])
  })

  it("reports a round that fails RoundSchema and skips its other checks", () => {
    const violations = lintAuthoredRounds([{ ...round(), id: "" }])
    expect(violations).toHaveLength(1)
    expect(violations[0]).toMatch(/authored round 0 \(id\)/)
  })

  it("reports a hunk that does not apply to A", () => {
    const violations = lintAuthoredRounds([
      round({
        algorithm: { ...round().algorithm, source: `// header\n${SOURCE}` },
      }),
    ])
    expect(violations.join("\n")).toMatch(
      /diff option 0: the hunk does not apply to A/
    )
  })

  it("reports an authored admissible claim the cost graph contradicts", () => {
    const base = round()
    const [first, second] = base.diffOptions
    if (first === undefined || second === undefined) throw new Error("fixture")
    const violations = lintAuthoredRounds([
      {
        ...base,
        diffOptions: [{ ...first, graph: Loop(dim("n", 2), W(1)) }, second],
      },
    ])
    expect(violations.join("\n")).toMatch(
      /authored as admissible, but isAdmissible/
    )
  })

  it("reports an A that is inadmissible before the constraint diff", () => {
    const violations = lintAuthoredRounds([
      round({ graph: Loop(dim("n", 4), W(1)) }),
    ])
    expect(violations.join("\n")).toMatch(
      /not admissible under constraintDiff.before/
    )
  })

  it("reports an A that stays admissible after the constraint diff", () => {
    const violations = lintAuthoredRounds([
      round({ graph: Loop(dim("n"), W(1)) }),
    ])
    expect(violations.join("\n")).toMatch(
      /still admissible under constraintDiff.after/
    )
  })

  it("reports a patched cost graph that never repeats over a bounded dimension", () => {
    const base = round()
    const [first, second] = base.diffOptions
    if (first === undefined || second === undefined) throw new Error("fixture")
    const violations = lintAuthoredRounds([
      { ...base, diffOptions: [{ ...first, graph: W(1) }, second] },
    ])
    expect(violations.join("\n")).toMatch(
      /diff option 0, G_\{A\+d\}: constraint on dimension "n" has no matching repetition/
    )
  })

  it("reports a rescue candidate that is not a constraint diff from C′", () => {
    const base = round()
    const [first, second] = base.diffOptions
    if (first === undefined || second === undefined) throw new Error("fixture")
    const violations = lintAuthoredRounds([
      {
        ...base,
        diffOptions: [
          first,
          {
            ...second,
            rescueCandidates: [
              {
                constraints: [{ dimension: "n", operator: ">=", bound: 20 }],
                propositionId: "CW-P4",
              },
            ],
          },
        ],
      },
    ])
    expect(violations.join("\n")).toMatch(
      /rescue candidate 0: not a valid constraint diff/
    )
  })

  it("reports hunks that name different paths", () => {
    const base = round()
    const [first, second] = base.diffOptions
    if (first === undefined || second === undefined) throw new Error("fixture")
    const violations = lintAuthoredRounds([
      {
        ...base,
        diffOptions: [
          first,
          {
            ...second,
            member: {
              ...second.member,
              hunk: { ...second.member.hunk, path: "src/other.rs" },
            },
          },
        ],
      },
    ])
    expect(violations.join("\n")).toMatch(/hunks name 2 different paths/)
  })

  it("reports a repeated round id", () => {
    expect(lintAuthoredRounds([round(), round()]).join("\n")).toMatch(
      /round id "total" is used by more than one round/
    )
  })
})
