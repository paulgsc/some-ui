import {
  dim,
  logDim,
  Loop,
  multiplyMonomials,
  Seq,
  W,
} from "@leetype/lib/leetype/cost"
import type { Round } from "@leetype/types/authored-round"

/**
 * LTY-AUTHOR (#1540): the authored round corpus. Real rounds, unlike
 * `lib/leetype/round-corpus`'s fixtures: every `A` is a complete Rust
 * program that compiles (`scripts/check-round-programs-compile.ts`), every
 * hunk applies to it (`lintAuthoredRounds`), and every authored
 * admissibility claim agrees with `isAdmissible` on the member's own cost
 * graph.
 *
 * Each round opens admissible under `constraintDiff.before`, becomes
 * inadmissible under `constraintDiff.after` (Def. 8.1 case 1 into case 2),
 * and presents `D` at the new bounds. Cost graphs are authored against the
 * worst case, because admissibility is a worst-case relation (Def. 3.1,
 * `CW-P8`).
 *
 * Coverage is partial on purpose. Several register entries say a rewrite
 * *cannot* restore admissibility (`CW-P4`, `CW-P8`, `CW-P9`, `CW-P11`,
 * `CW-P16`), so they appear here as the μ of distractors rather than of
 * admissible members. How the register-wide coverage obligation (Rem. 7.1,
 * Rem. 10.2) applies to them is open on #1540.
 */

/** Rounds share one budget: 10^8 primitive operations, an order-of-magnitude figure (Ax. 3.1). */
const BUDGET = { operations: 100_000_000, wallClock: "about a second" }

/** Def. 8.2 case 2's fallback question for every member below: no member is unrescuable, so it is never reached. */
const UNRESCUABLE_EXPLANATION = "CW-P16" as const

const COUNT_PRESENT: Round = {
  id: "count-present-sorted-lookup",
  algorithm: {
    language: "rust",
    entryPoint: "count_present(items: &[u32], queries: &[u32]) -> usize",
    inputAlphabet:
      "Two slices of u32. n is queries.len() and m is items.len(); the result counts the queries that appear in items.",
    source: [
      "pub fn count_present(items: &[u32], queries: &[u32]) -> usize {",
      "    let mut count = 0;",
      "    for q in queries {",
      "        let mut found = false;",
      "        for x in items {",
      "            if x == q {",
      "                found = true;",
      "            }",
      "        }",
      "        if found {",
      "            count += 1;",
      "        }",
      "    }",
      "    count",
      "}",
      "",
    ].join("\n"),
  },
  constraintDiff: {
    before: [
      { dimension: "n", operator: "<=", bound: 1_000 },
      { dimension: "m", operator: "<=", bound: 1_000 },
    ],
    after: [
      { dimension: "n", operator: "<=", bound: 100_000 },
      { dimension: "m", operator: "<=", bound: 100_000 },
    ],
  },
  budget: BUDGET,
  graph: Loop(dim("n"), Loop(dim("m"), W(1))),
  diffOptions: [
    {
      member: {
        hunk: {
          path: "src/count_present.rs",
          oldStart: 1,
          newStart: 1,
          segments: [
            {
              kind: "context",
              text: "pub fn count_present(items: &[u32], queries: &[u32]) -> usize {\n",
            },
            {
              kind: "addition",
              text: "    let mut sorted = items.to_vec();\n    sorted.sort_unstable();\n",
            },
            {
              kind: "context",
              text: "    let mut count = 0;\n    for q in queries {\n",
            },
            {
              kind: "deletion",
              text: "        let mut found = false;\n        for x in items {\n            if x == q {\n                found = true;\n            }\n        }\n        if found {\n",
            },
            {
              kind: "addition",
              text: "        if sorted.binary_search(q).is_ok() {\n",
            },
          ],
        },
        propositionId: "CW-P6",
        admissible: true,
        propositionGloss:
          "Sorting items once costs m log m. Each of the n queries then costs log m instead of m.",
      },
      graph: Seq(
        Loop(dim("m"), W(1)),
        Loop(multiplyMonomials(dim("m"), logDim("m")), W(1)),
        Loop(dim("n"), Loop(logDim("m"), W(1)))
      ),
      rescueCandidates: [],
      explanationPropositionId: UNRESCUABLE_EXPLANATION,
    },
    {
      member: {
        hunk: {
          path: "src/count_present.rs",
          oldStart: 6,
          newStart: 6,
          segments: [
            {
              kind: "context",
              text: "            if x == q {\n                found = true;\n",
            },
            { kind: "addition", text: "                break;\n" },
          ],
        },
        propositionId: "CW-P8",
        admissible: false,
        distractorStatement:
          "Stops scanning items at the first match. A query that is absent still scans every item, so the worst case is unchanged.",
        propositionGloss:
          "The break fires only on a match, so every absent query still costs m.",
      },
      graph: Loop(dim("n"), Loop(dim("m"), W(1))),
      rescueCandidates: [
        {
          constraints: [
            { dimension: "n", operator: "<=", bound: 1_000 },
            { dimension: "m", operator: "<=", bound: 100_000 },
          ],
          propositionId: "CW-P4",
        },
      ],
      explanationPropositionId: UNRESCUABLE_EXPLANATION,
    },
  ],
}

const HAS_DUPLICATE: Round = {
  id: "has-duplicate-sort-adjacent",
  algorithm: {
    language: "rust",
    entryPoint: "has_duplicate(values: &[i64]) -> bool",
    inputAlphabet:
      "One slice of i64 of length n; the result is whether any value occurs twice.",
    source: [
      "pub fn has_duplicate(values: &[i64]) -> bool {",
      "    for i in 0..values.len() {",
      "        for j in 0..values.len() {",
      "            if i != j && values[i] == values[j] {",
      "                return true;",
      "            }",
      "        }",
      "    }",
      "    false",
      "}",
      "",
    ].join("\n"),
  },
  constraintDiff: {
    before: [{ dimension: "n", operator: "<=", bound: 1_000 }],
    after: [{ dimension: "n", operator: "<=", bound: 100_000 }],
  },
  budget: BUDGET,
  graph: Loop(dim("n"), Loop(dim("n"), W(1))),
  diffOptions: [
    {
      member: {
        hunk: {
          path: "src/has_duplicate.rs",
          oldStart: 1,
          newStart: 1,
          segments: [
            {
              kind: "context",
              text: "pub fn has_duplicate(values: &[i64]) -> bool {\n",
            },
            {
              kind: "deletion",
              text: "    for i in 0..values.len() {\n        for j in 0..values.len() {\n            if i != j && values[i] == values[j] {\n                return true;\n            }\n        }\n    }\n",
            },
            {
              kind: "addition",
              text: "    let mut sorted = values.to_vec();\n    sorted.sort_unstable();\n    for i in 1..sorted.len() {\n        if sorted[i - 1] == sorted[i] {\n            return true;\n        }\n    }\n",
            },
            { kind: "context", text: "    false\n" },
          ],
        },
        propositionId: "CW-P7",
        admissible: true,
        propositionGloss:
          "Sorting puts equal values next to each other, so one pass over neighbours replaces comparing every pair.",
      },
      graph: Seq(
        Loop(dim("n"), W(1)),
        Loop(multiplyMonomials(dim("n"), logDim("n")), W(1)),
        Loop(dim("n"), W(1))
      ),
      rescueCandidates: [],
      explanationPropositionId: UNRESCUABLE_EXPLANATION,
    },
    {
      member: {
        hunk: {
          path: "src/has_duplicate.rs",
          oldStart: 3,
          newStart: 3,
          segments: [
            {
              kind: "deletion",
              text: "        for j in 0..values.len() {\n            if i != j && values[i] == values[j] {\n",
            },
            {
              kind: "addition",
              text: "        for j in (i + 1)..values.len() {\n            if values[i] == values[j] {\n",
            },
          ],
        },
        propositionId: "CW-P9",
        admissible: false,
        distractorStatement:
          "Compares each pair once instead of twice. That halves the work, and the work still grows with the square of n.",
        propositionGloss:
          "The inner loop now covers only the upper triangle: about half of n squared comparisons.",
      },
      graph: Loop(dim("n", 2), W(0.5)),
      rescueCandidates: [
        {
          constraints: [{ dimension: "n", operator: "<=", bound: 14_000 }],
          propositionId: "CW-P4",
        },
      ],
      explanationPropositionId: UNRESCUABLE_EXPLANATION,
    },
  ],
}

export const AUTHORED_ROUNDS: ReadonlyArray<Round> = [
  COUNT_PRESENT,
  HAS_DUPLICATE,
]
