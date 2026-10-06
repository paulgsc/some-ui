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
 * LTY-AUTHOR: the authored round corpus. Real rounds, unlike
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
 * Several register entries say a rewrite *cannot* restore admissibility
 * (`CW-P4`, `CW-P8`, `CW-P9`, `CW-P11`, `CW-P16`), so they appear here as
 * the μ of distractors rather than of admissible members. That counts
 * toward Rem. 7.1's coverage: a proposition is instantiated by μ(d) on any
 * member of D. The corpus does not cover the register
 * yet, so `lintAuthoredRounds` does not run the register-wide checks.
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
  harness: {
    source: [
      "fn main() {",
      "    let mut n = 0usize;",
      "    let mut m = 0usize;",
      "    for arg in std::env::args().skip(1) {",
      "        let (dimension, value) = arg.split_once('=').expect(\"dimension=value\");",
      '        let value: usize = value.parse().expect("a size");',
      "        match dimension {",
      '            "n" => n = value,',
      '            "m" => m = value,',
      '            other => panic!("unknown dimension {other}"),',
      "        }",
      "    }",
      "    // Worst case: no query is present, so no scan stops early.",
      "    let items: Vec<u32> = (0..m as u32).map(|i| i * 2).collect();",
      "    let queries: Vec<u32> = (0..n as u32).map(|i| i * 2 + 1).collect();",
      '    println!("{}", count_present(&items, &queries));',
      "}",
      "",
    ].join("\n"),
  },
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
  harness: {
    source: [
      "fn main() {",
      "    let mut n = 0usize;",
      "    for arg in std::env::args().skip(1) {",
      "        let (dimension, value) = arg.split_once('=').expect(\"dimension=value\");",
      '        let value: usize = value.parse().expect("a size");',
      "        match dimension {",
      '            "n" => n = value,',
      '            other => panic!("unknown dimension {other}"),',
      "        }",
      "    }",
      "    // Worst case: every value distinct, so no pair ends the search.",
      "    let values: Vec<i64> = (0..n as i64).collect();",
      '    println!("{}", has_duplicate(&values));',
      "}",
      "",
    ].join("\n"),
  },
}

const RANGE_SUMS: Round = {
  id: "range-sums-prefix",
  algorithm: {
    language: "rust",
    entryPoint:
      "range_sums(values: &[i64], queries: &[(usize, usize)]) -> Vec<i64>",
    inputAlphabet:
      "A slice of i64 and a slice of half-open ranges (l, r) with l <= r <= values.len(). n is values.len() and q is queries.len(); the result holds each range's sum.",
    source: [
      "pub fn range_sums(values: &[i64], queries: &[(usize, usize)]) -> Vec<i64> {",
      "    let mut out = Vec::new();",
      "    for &(l, r) in queries {",
      "        let mut total = 0;",
      "        for i in l..r {",
      "            total += values[i];",
      "        }",
      "        out.push(total);",
      "    }",
      "    out",
      "}",
      "",
    ].join("\n"),
  },
  constraintDiff: {
    before: [
      { dimension: "n", operator: "<=", bound: 1_000 },
      { dimension: "q", operator: "<=", bound: 1_000 },
    ],
    after: [
      { dimension: "n", operator: "<=", bound: 100_000 },
      { dimension: "q", operator: "<=", bound: 100_000 },
    ],
  },
  budget: BUDGET,
  graph: Loop(dim("q"), Loop(dim("n"), W(1))),
  diffOptions: [
    {
      member: {
        hunk: {
          path: "src/range_sums.rs",
          oldStart: 1,
          newStart: 1,
          segments: [
            {
              kind: "context",
              text: "pub fn range_sums(values: &[i64], queries: &[(usize, usize)]) -> Vec<i64> {\n",
            },
            {
              kind: "deletion",
              text: "    let mut out = Vec::new();\n    for &(l, r) in queries {\n        let mut total = 0;\n        for i in l..r {\n            total += values[i];\n        }\n        out.push(total);\n    }\n",
            },
            {
              kind: "addition",
              text: "    let mut prefix = vec![0i64; values.len() + 1];\n    for i in 0..values.len() {\n        prefix[i + 1] = prefix[i] + values[i];\n    }\n    let mut out = Vec::new();\n    for &(l, r) in queries {\n        out.push(prefix[r] - prefix[l]);\n    }\n",
            },
            { kind: "context", text: "    out\n" },
          ],
        },
        propositionId: "CW-P1",
        admissible: true,
        propositionGloss:
          "One pass builds the running totals, then each query is one subtraction. The two loops run one after the other, so their costs add: n plus q.",
      },
      graph: Seq(Loop(dim("n"), W(1)), Loop(dim("q"), W(1))),
      rescueCandidates: [],
      explanationPropositionId: UNRESCUABLE_EXPLANATION,
    },
    {
      member: {
        hunk: {
          path: "src/range_sums.rs",
          oldStart: 2,
          newStart: 2,
          segments: [
            { kind: "deletion", text: "    let mut out = Vec::new();\n" },
            {
              kind: "addition",
              text: "    let mut out = Vec::with_capacity(queries.len());\n",
            },
          ],
        },
        propositionId: "CW-P11",
        admissible: false,
        distractorStatement:
          "Reserves the output's room up front, saving reallocations. Every query still adds up its whole range, and that is where the work is.",
        propositionGloss:
          "The change touches only the output vector, which is off the path that sums each range.",
      },
      graph: Loop(dim("q"), Loop(dim("n"), W(1))),
      rescueCandidates: [
        {
          constraints: [
            { dimension: "n", operator: "<=", bound: 500 },
            { dimension: "q", operator: "<=", bound: 100_000 },
          ],
          propositionId: "CW-P4",
        },
      ],
      explanationPropositionId: UNRESCUABLE_EXPLANATION,
    },
    {
      member: {
        hunk: {
          path: "src/range_sums.rs",
          oldStart: 3,
          newStart: 3,
          segments: [
            { kind: "context", text: "    for &(l, r) in queries {\n" },
            {
              kind: "addition",
              text: "        if l == r {\n            out.push(0);\n            continue;\n        }\n",
            },
            { kind: "context", text: "        let mut total = 0;\n" },
          ],
        },
        propositionId: "CW-P8",
        admissible: false,
        distractorStatement:
          "Answers an empty range without looping. A range that spans the whole slice still sums every value, so the worst case is unchanged.",
        propositionGloss:
          "The shortcut fires only for empty ranges; a full-width range still costs n.",
      },
      graph: Loop(dim("q"), Loop(dim("n"), W(1))),
      rescueCandidates: [
        {
          constraints: [
            { dimension: "n", operator: "<=", bound: 100_000 },
            { dimension: "q", operator: "<=", bound: 500 },
          ],
          propositionId: "CW-P4",
        },
      ],
      explanationPropositionId: UNRESCUABLE_EXPLANATION,
    },
  ],
  harness: {
    source: [
      "fn main() {",
      "    let mut n = 0usize;",
      "    let mut q = 0usize;",
      "    for arg in std::env::args().skip(1) {",
      "        let (dimension, value) = arg.split_once('=').expect(\"dimension=value\");",
      '        let value: usize = value.parse().expect("a size");',
      "        match dimension {",
      '            "n" => n = value,',
      '            "q" => q = value,',
      '            other => panic!("unknown dimension {other}"),',
      "        }",
      "    }",
      "    // Worst case: every range spans the whole slice.",
      "    let values: Vec<i64> = (0..n as i64).map(|i| i % 7 - 3).collect();",
      "    let queries: Vec<(usize, usize)> = vec![(0, n); q];",
      "    let sums = range_sums(&values, &queries);",
      '    println!("{} {}", sums.len(), sums.iter().fold(0i64, |a, b| a.wrapping_add(*b)));',
      "}",
      "",
    ].join("\n"),
  },
}

const COUNT_AT_LEAST_MAX: Round = {
  id: "count-at-least-max-hoist",
  algorithm: {
    language: "rust",
    entryPoint: "count_at_least_max(values: &[i64], queries: &[i64]) -> usize",
    inputAlphabet:
      "Two slices of i64. n is values.len() and q is queries.len(); the result counts the queries at least as large as every value.",
    source: [
      "pub fn count_at_least_max(values: &[i64], queries: &[i64]) -> usize {",
      "    let mut count = 0;",
      "    for q in queries {",
      "        let mut best = i64::MIN;",
      "        for v in values {",
      "            if *v > best {",
      "                best = *v;",
      "            }",
      "        }",
      "        if *q >= best {",
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
      { dimension: "q", operator: "<=", bound: 1_000 },
    ],
    after: [
      { dimension: "n", operator: "<=", bound: 100_000 },
      { dimension: "q", operator: "<=", bound: 100_000 },
    ],
  },
  budget: BUDGET,
  graph: Loop(dim("q"), Loop(dim("n"), W(1))),
  diffOptions: [
    {
      member: {
        hunk: {
          path: "src/count_at_least_max.rs",
          oldStart: 2,
          newStart: 2,
          segments: [
            { kind: "context", text: "    let mut count = 0;\n" },
            {
              kind: "addition",
              text: "    let mut best = i64::MIN;\n    for v in values {\n        if *v > best {\n            best = *v;\n        }\n    }\n",
            },
            { kind: "context", text: "    for q in queries {\n" },
            {
              kind: "deletion",
              text: "        let mut best = i64::MIN;\n        for v in values {\n            if *v > best {\n                best = *v;\n            }\n        }\n",
            },
          ],
        },
        propositionId: "CW-P2",
        admissible: true,
        propositionGloss:
          "The maximum does not depend on the query, so it moves out of the loop. Inside, the scan was multiplied by q; outside, it runs once.",
      },
      graph: Seq(Loop(dim("n"), W(1)), Loop(dim("q"), W(1))),
      rescueCandidates: [],
      explanationPropositionId: UNRESCUABLE_EXPLANATION,
    },
    {
      member: {
        hunk: {
          path: "src/count_at_least_max.rs",
          oldStart: 10,
          newStart: 10,
          segments: [
            {
              kind: "deletion",
              text: "        if *q >= best {\n            count += 1;\n        }\n",
            },
            {
              kind: "addition",
              text: "        count += usize::from(*q >= best);\n",
            },
          ],
        },
        propositionId: "CW-P11",
        admissible: false,
        distractorStatement:
          "Counts without a branch. The branch was never the cost: the scan for the maximum still runs once per query.",
        propositionGloss:
          "The rewrite touches the count, which is off the path that scans every value for every query.",
      },
      graph: Loop(dim("q"), Loop(dim("n"), W(1))),
      rescueCandidates: [
        {
          constraints: [
            { dimension: "n", operator: "<=", bound: 500 },
            { dimension: "q", operator: "<=", bound: 100_000 },
          ],
          propositionId: "CW-P4",
        },
      ],
      explanationPropositionId: UNRESCUABLE_EXPLANATION,
    },
    {
      member: {
        hunk: {
          path: "src/count_at_least_max.rs",
          oldStart: 6,
          newStart: 6,
          segments: [
            {
              kind: "context",
              text: "            if *v > best {\n                best = *v;\n",
            },
            {
              kind: "addition",
              text: "                if best == i64::MAX {\n                    break;\n                }\n",
            },
          ],
        },
        propositionId: "CW-P8",
        admissible: false,
        distractorStatement:
          "Stops scanning once the largest possible value turns up. Unless it does, every query still scans every value.",
        propositionGloss:
          "The exit fires only on i64::MAX, so the worst case still costs n per query.",
      },
      graph: Loop(dim("q"), Loop(dim("n"), W(1))),
      rescueCandidates: [
        {
          constraints: [
            { dimension: "n", operator: "<=", bound: 100_000 },
            { dimension: "q", operator: "<=", bound: 500 },
          ],
          propositionId: "CW-P4",
        },
      ],
      explanationPropositionId: UNRESCUABLE_EXPLANATION,
    },
  ],
  harness: {
    source: [
      "fn main() {",
      "    let mut n = 0usize;",
      "    let mut q = 0usize;",
      "    for arg in std::env::args().skip(1) {",
      "        let (dimension, value) = arg.split_once('=').expect(\"dimension=value\");",
      '        let value: usize = value.parse().expect("a size");',
      "        match dimension {",
      '            "n" => n = value,',
      '            "q" => q = value,',
      '            other => panic!("unknown dimension {other}"),',
      "        }",
      "    }",
      "    // Worst case: i64::MAX never appears, so no scan stops early.",
      "    let values: Vec<i64> = (0..n as i64).collect();",
      "    let queries: Vec<i64> = (0..q as i64).collect();",
      '    println!("{}", count_at_least_max(&values, &queries));',
      "}",
      "",
    ].join("\n"),
  },
}

const MIN_GAP: Round = {
  id: "min-gap-sort-adjacent",
  algorithm: {
    language: "rust",
    entryPoint: "min_gap(values: &[i64]) -> i64",
    inputAlphabet:
      "One slice of i64 of length n with values small enough that differences fit in i64; the result is the smallest distance between two entries, or i64::MAX for fewer than two.",
    source: [
      "pub fn min_gap(values: &[i64]) -> i64 {",
      "    let mut best = i64::MAX;",
      "    for i in 0..values.len() {",
      "        for j in 0..values.len() {",
      "            if i != j {",
      "                let gap = (values[i] - values[j]).abs();",
      "                if gap < best {",
      "                    best = gap;",
      "                }",
      "            }",
      "        }",
      "    }",
      "    best",
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
          path: "src/min_gap.rs",
          oldStart: 2,
          newStart: 2,
          segments: [
            { kind: "context", text: "    let mut best = i64::MAX;\n" },
            {
              kind: "deletion",
              text: "    for i in 0..values.len() {\n        for j in 0..values.len() {\n            if i != j {\n                let gap = (values[i] - values[j]).abs();\n                if gap < best {\n                    best = gap;\n                }\n            }\n        }\n    }\n",
            },
            {
              kind: "addition",
              text: "    let mut sorted = values.to_vec();\n    sorted.sort_unstable();\n    for i in 1..sorted.len() {\n        let gap = sorted[i] - sorted[i - 1];\n        if gap < best {\n            best = gap;\n        }\n    }\n",
            },
            { kind: "context", text: "    best\n" },
          ],
        },
        propositionId: "CW-P7",
        admissible: true,
        propositionGloss:
          "In sorted order the closest pair is always two neighbours, so one pass over neighbours replaces comparing every pair.",
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
          path: "src/min_gap.rs",
          oldStart: 3,
          newStart: 3,
          segments: [
            {
              kind: "deletion",
              text: "    for i in 0..values.len() {\n        for j in 0..values.len() {\n            if i != j {\n                let gap = (values[i] - values[j]).abs();\n                if gap < best {\n                    best = gap;\n                }\n            }\n        }\n    }\n",
            },
            {
              kind: "addition",
              text: "    let n = values.len();\n    for k in 0..n * n {\n        let (i, j) = (k / n, k % n);\n        if i != j {\n            let gap = (values[i] - values[j]).abs();\n            if gap < best {\n                best = gap;\n            }\n        }\n    }\n",
            },
          ],
        },
        propositionId: "CW-P12",
        admissible: false,
        distractorStatement:
          "Flattens the two loops into one loop over every index pair. One loop instead of two, and still n times n iterations.",
        propositionGloss:
          "The nesting is gone, but the single loop runs n squared times: the exponent comes from the repetition, not the depth.",
      },
      graph: Loop(dim("n", 2), W(1)),
      rescueCandidates: [
        {
          constraints: [{ dimension: "n", operator: "<=", bound: 5_000 }],
          propositionId: "CW-P4",
        },
      ],
      explanationPropositionId: UNRESCUABLE_EXPLANATION,
    },
    {
      member: {
        hunk: {
          path: "src/min_gap.rs",
          oldStart: 4,
          newStart: 4,
          segments: [
            {
              kind: "deletion",
              text: "        for j in 0..values.len() {\n            if i != j {\n",
            },
            {
              kind: "addition",
              text: "        for j in (i + 1)..values.len() {\n            if i < j {\n",
            },
          ],
        },
        propositionId: "CW-P9",
        admissible: false,
        distractorStatement:
          "Visits each pair once instead of twice. That halves the comparisons, and their number still grows with the square of n.",
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
  harness: {
    source: [
      "fn main() {",
      "    let mut n = 0usize;",
      "    for arg in std::env::args().skip(1) {",
      "        let (dimension, value) = arg.split_once('=').expect(\"dimension=value\");",
      '        let value: usize = value.parse().expect("a size");',
      "        match dimension {",
      '            "n" => n = value,',
      '            other => panic!("unknown dimension {other}"),',
      "        }",
      "    }",
      "    // Every pair is examined whatever the values; these are spaced by 3.",
      "    let values: Vec<i64> = (0..n as i64).map(|i| i * 3).collect();",
      '    println!("{}", min_gap(&values));',
      "}",
      "",
    ].join("\n"),
  },
}

export const AUTHORED_ROUNDS: ReadonlyArray<Round> = [
  COUNT_PRESENT,
  HAS_DUPLICATE,
  RANGE_SUMS,
  COUNT_AT_LEAST_MAX,
  MIN_GAP,
]
