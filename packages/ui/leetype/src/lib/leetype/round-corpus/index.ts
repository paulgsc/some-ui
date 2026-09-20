import type { RoundCorpusEntry } from "@leetype/lib/leetype/exercises/corpus-lint"
import type { ConstraintSet } from "@leetype/types/constraint"
import type { DiffSet } from "@leetype/types/round"

/**
 * The fixture round corpus R5 (#1208) checks live against — the "real
 * corpus" `checkCitations`/`checkRegisterCoverage` (B1, #1218) were built
 * for but had no data to run against until now (see those functions' own
 * doc comments in `proposition-register/citation-check.ts`). No live
 * product surface produces `Round` data yet (C1/#1213, Step 6, has not
 * landed), so this corpus is hand-authored rather than harvested — held to
 * the same "shim standard" `lib/leetype/exercises/index.ts` already states
 * for the step corpus: it fails loudly here if malformed, not three
 * components later.
 *
 * One round per register entry, each round's own admissible member
 * witnessing that entry and each round's own distractor member reusing the
 * *next* entry's hunk (wrapping `CW-P16` back to `CW-P1`) as a plausible
 * but wrong-context rewrite. This single cyclic construction is what makes
 * every entry satisfy both of Rem. 7.1's coverage obligation (row 3: each
 * appears as its own round's `μ(d)`) and Rem. 10.2/Prop. 10.1's stricter one
 * (row 4: each also appears as a *distractor* in a different round, one
 * whose own admissible member names something else) in one pass, with
 * sixteen hunks instead of thirty-two.
 *
 * Each hunk is a loose, honest sketch of its proposition's own worked shape
 * — not a real compiling program (Def. 1.1 governs `A`, which this lint
 * never needs; R5 depends on R1-R4 only, never G-family or `lib/leetype/
 * cost`/`admissibility`) — and every hunk and distractor statement is
 * written to avoid `Θ`/`O(`/`Ω(` notation on purpose, so the corpus itself
 * never trips row 7's own check.
 */
export const ALL_FIXTURE_ROUNDS: ReadonlyArray<RoundCorpusEntry> = [
  {
    id: "round-cw-p1",
    constraints: [
      { dimension: "n", operator: "<=", bound: 100_000 },
    ] satisfies ConstraintSet,
    diffSet: [
      {
        hunk: {
          path: "src/algo/cw-p1.rs",
          oldStart: 1,
          newStart: 1,
          segments: [
            {
              kind: "addition",
              text: "scan_for_duplicates(&items);\ncompact_gaps(&items);",
            },
          ],
        },
        propositionId: "CW-P1",
        admissible: true,
      },
      {
        hunk: {
          path: "src/algo/cw-p2.rs",
          oldStart: 1,
          newStart: 1,
          segments: [
            {
              kind: "addition",
              text: "for i in 0..n {\n    for j in 0..n {\n        visit(i, j);\n    }\n}",
            },
          ],
        },
        propositionId: "CW-P2",
        admissible: false,
        distractorStatement:
          "reuses \"Nested repetition multiplies\" (CW-P2)'s own rewrite here — it nests one loop inside another, a real repair for a different algorithm shape, and does not respond to this round's own constraint.",
      },
    ] satisfies DiffSet,
  },
  {
    id: "round-cw-p2",
    constraints: [
      { dimension: "n", operator: "<=", bound: 2_000 },
    ] satisfies ConstraintSet,
    diffSet: [
      {
        hunk: {
          path: "src/algo/cw-p2.rs",
          oldStart: 1,
          newStart: 1,
          segments: [
            {
              kind: "addition",
              text: "for i in 0..n {\n    for j in 0..n {\n        visit(i, j);\n    }\n}",
            },
          ],
        },
        propositionId: "CW-P2",
        admissible: true,
      },
      {
        hunk: {
          path: "src/algo/cw-p3.rs",
          oldStart: 1,
          newStart: 1,
          segments: [
            {
              kind: "addition",
              text: "for i in 0..n {\n    work(i);\n}\nfor i in 0..n {\n    for j in 0..n {\n        pair(i, j);\n    }\n}",
            },
          ],
        },
        propositionId: "CW-P3",
        admissible: false,
        distractorStatement:
          "reuses \"The dominant term survives\" (CW-P3)'s own rewrite here — a sibling loop whose own larger term would survive, a real repair for a different algorithm shape, and does not respond to this round's own constraint.",
      },
    ] satisfies DiffSet,
  },
  {
    id: "round-cw-p3",
    constraints: [
      { dimension: "n", operator: "<=", bound: 2_000 },
    ] satisfies ConstraintSet,
    diffSet: [
      {
        hunk: {
          path: "src/algo/cw-p3.rs",
          oldStart: 1,
          newStart: 1,
          segments: [
            {
              kind: "addition",
              text: "for i in 0..n {\n    work(i);\n}\nfor i in 0..n {\n    for j in 0..n {\n        pair(i, j);\n    }\n}",
            },
          ],
        },
        propositionId: "CW-P3",
        admissible: true,
      },
      {
        hunk: {
          path: "src/algo/cw-p4.rs",
          oldStart: 1,
          newStart: 1,
          segments: [{ kind: "addition", text: "assert!(n <= 1_000_000);" }],
        },
        propositionId: "CW-P4",
        admissible: false,
        distractorStatement:
          "reuses \"A bound change does not change the class\" (CW-P4)'s own rewrite here — a raised threshold, a real repair for a different algorithm shape, and does not respond to this round's own constraint.",
      },
    ] satisfies DiffSet,
  },
  {
    id: "round-cw-p4",
    constraints: [
      { dimension: "n", operator: "<=", bound: 1_000_000 },
    ] satisfies ConstraintSet,
    diffSet: [
      {
        hunk: {
          path: "src/algo/cw-p4.rs",
          oldStart: 1,
          newStart: 1,
          segments: [{ kind: "addition", text: "assert!(n <= 1_000_000);" }],
        },
        propositionId: "CW-P4",
        admissible: true,
      },
      {
        hunk: {
          path: "src/algo/cw-p5.rs",
          oldStart: 1,
          newStart: 1,
          segments: [
            {
              kind: "addition",
              text: "let index: HashMap<_, _> = build_index(&items);\nindex.get(&key)",
            },
          ],
        },
        propositionId: "CW-P5",
        admissible: false,
        distractorStatement:
          "reuses \"Preprocessing substitutes space for repeated search\" (CW-P5)'s own rewrite here — a real repair for a different algorithm shape, and does not respond to this round's own constraint.",
      },
    ] satisfies DiffSet,
  },
  {
    id: "round-cw-p5",
    constraints: [
      { dimension: "n", operator: "<=", bound: 100_000 },
    ] satisfies ConstraintSet,
    diffSet: [
      {
        hunk: {
          path: "src/algo/cw-p5.rs",
          oldStart: 1,
          newStart: 1,
          segments: [
            {
              kind: "addition",
              text: "let index: HashMap<_, _> = build_index(&items);\nindex.get(&key)",
            },
          ],
        },
        propositionId: "CW-P5",
        admissible: true,
      },
      {
        hunk: {
          path: "src/algo/cw-p6.rs",
          oldStart: 1,
          newStart: 1,
          segments: [
            {
              kind: "addition",
              text: "items.sort();\nitems.binary_search(&key)",
            },
          ],
        },
        propositionId: "CW-P6",
        admissible: false,
        distractorStatement:
          "reuses \"Ordering substitutes a logarithm for a scan\" (CW-P6)'s own rewrite here — a real repair for a different algorithm shape, and does not respond to this round's own constraint.",
      },
    ] satisfies DiffSet,
  },
  {
    id: "round-cw-p6",
    constraints: [
      { dimension: "n", operator: "<=", bound: 100_000 },
    ] satisfies ConstraintSet,
    diffSet: [
      {
        hunk: {
          path: "src/algo/cw-p6.rs",
          oldStart: 1,
          newStart: 1,
          segments: [
            {
              kind: "addition",
              text: "items.sort();\nitems.binary_search(&key)",
            },
          ],
        },
        propositionId: "CW-P6",
        admissible: true,
      },
      {
        hunk: {
          path: "src/algo/cw-p7.rs",
          oldStart: 1,
          newStart: 1,
          segments: [
            { kind: "addition", text: "items.sort_by(|a, b| a.cmp(b));" },
          ],
        },
        propositionId: "CW-P7",
        admissible: false,
        distractorStatement:
          "reuses \"Sorting collapses pairwise comparison\" (CW-P7)'s own rewrite here — a real repair for a different algorithm shape, and does not respond to this round's own constraint.",
      },
    ] satisfies DiffSet,
  },
  {
    id: "round-cw-p7",
    constraints: [
      { dimension: "n", operator: "<=", bound: 50_000 },
    ] satisfies ConstraintSet,
    diffSet: [
      {
        hunk: {
          path: "src/algo/cw-p7.rs",
          oldStart: 1,
          newStart: 1,
          segments: [
            { kind: "addition", text: "items.sort_by(|a, b| a.cmp(b));" },
          ],
        },
        propositionId: "CW-P7",
        admissible: true,
      },
      {
        hunk: {
          path: "src/algo/cw-p8.rs",
          oldStart: 1,
          newStart: 1,
          segments: [
            {
              kind: "addition",
              text: "for item in &items {\n    if matches(item) {\n        return Some(item);\n    }\n}",
            },
          ],
        },
        propositionId: "CW-P8",
        admissible: false,
        distractorStatement:
          "reuses \"An early exit does not change the worst case\" (CW-P8)'s own rewrite here — a real repair for a different algorithm shape, and does not respond to this round's own constraint.",
      },
    ] satisfies DiffSet,
  },
  {
    id: "round-cw-p8",
    constraints: [
      { dimension: "n", operator: "<=", bound: 100_000 },
    ] satisfies ConstraintSet,
    diffSet: [
      {
        hunk: {
          path: "src/algo/cw-p8.rs",
          oldStart: 1,
          newStart: 1,
          segments: [
            {
              kind: "addition",
              text: "for item in &items {\n    if matches(item) {\n        return Some(item);\n    }\n}",
            },
          ],
        },
        propositionId: "CW-P8",
        admissible: true,
      },
      {
        hunk: {
          path: "src/algo/cw-p9.rs",
          oldStart: 1,
          newStart: 1,
          segments: [
            {
              kind: "addition",
              text: "for i in 0..n {\n    for j in i..n {\n        pair(i, j);\n    }\n}",
            },
          ],
        },
        propositionId: "CW-P9",
        admissible: false,
        distractorStatement:
          "reuses \"Triangular iteration is a constant factor\" (CW-P9)'s own rewrite here — a real repair for a different algorithm shape, and does not respond to this round's own constraint.",
      },
    ] satisfies DiffSet,
  },
  {
    id: "round-cw-p9",
    constraints: [
      { dimension: "n", operator: "<=", bound: 10_000 },
    ] satisfies ConstraintSet,
    diffSet: [
      {
        hunk: {
          path: "src/algo/cw-p9.rs",
          oldStart: 1,
          newStart: 1,
          segments: [
            {
              kind: "addition",
              text: "for i in 0..n {\n    for j in i..n {\n        pair(i, j);\n    }\n}",
            },
          ],
        },
        propositionId: "CW-P9",
        admissible: true,
      },
      {
        hunk: {
          path: "src/algo/cw-p10.rs",
          oldStart: 1,
          newStart: 1,
          segments: [
            {
              kind: "addition",
              text: "buffer.push(item);\n// grows the backing store by doubling, spread across many pushes",
            },
          ],
        },
        propositionId: "CW-P10",
        admissible: false,
        distractorStatement:
          "reuses \"Amortization is a claim about a sequence\" (CW-P10)'s own rewrite here — a real repair for a different algorithm shape, and does not respond to this round's own constraint.",
      },
    ] satisfies DiffSet,
  },
  {
    id: "round-cw-p10",
    constraints: [
      { dimension: "n", operator: "<=", bound: 1_000_000 },
    ] satisfies ConstraintSet,
    diffSet: [
      {
        hunk: {
          path: "src/algo/cw-p10.rs",
          oldStart: 1,
          newStart: 1,
          segments: [
            {
              kind: "addition",
              text: "buffer.push(item);\n// grows the backing store by doubling, spread across many pushes",
            },
          ],
        },
        propositionId: "CW-P10",
        admissible: true,
      },
      {
        hunk: {
          path: "src/algo/cw-p11.rs",
          oldStart: 1,
          newStart: 1,
          segments: [
            {
              kind: "addition",
              text: "if flag {\n    for i in 0..n {\n        for j in 0..n {\n            pair(i, j);\n        }\n    }\n} else {\n    simple();\n}",
            },
          ],
        },
        propositionId: "CW-P11",
        admissible: false,
        distractorStatement:
          "reuses \"Only the dominant path matters\" (CW-P11)'s own rewrite here — a real repair for a different algorithm shape, and does not respond to this round's own constraint.",
      },
    ] satisfies DiffSet,
  },
  {
    id: "round-cw-p11",
    constraints: [
      { dimension: "n", operator: "<=", bound: 2_000 },
    ] satisfies ConstraintSet,
    diffSet: [
      {
        hunk: {
          path: "src/algo/cw-p11.rs",
          oldStart: 1,
          newStart: 1,
          segments: [
            {
              kind: "addition",
              text: "if flag {\n    for i in 0..n {\n        for j in 0..n {\n            pair(i, j);\n        }\n    }\n} else {\n    simple();\n}",
            },
          ],
        },
        propositionId: "CW-P11",
        admissible: true,
      },
      {
        hunk: {
          path: "src/algo/cw-p12.rs",
          oldStart: 1,
          newStart: 1,
          segments: [
            {
              kind: "addition",
              text: "for i in 0..n {\n    step(i);\n}\nfor i in 0..n {\n    step(i);\n}\nfor i in 0..n {\n    step(i);\n}",
            },
          ],
        },
        propositionId: "CW-P12",
        admissible: false,
        distractorStatement:
          "reuses \"Loop depth is not the exponent\" (CW-P12)'s own rewrite here — a real repair for a different algorithm shape, and does not respond to this round's own constraint.",
      },
    ] satisfies DiffSet,
  },
  {
    id: "round-cw-p12",
    constraints: [
      { dimension: "n", operator: "<=", bound: 100_000 },
    ] satisfies ConstraintSet,
    diffSet: [
      {
        hunk: {
          path: "src/algo/cw-p12.rs",
          oldStart: 1,
          newStart: 1,
          segments: [
            {
              kind: "addition",
              text: "for i in 0..n {\n    step(i);\n}\nfor i in 0..n {\n    step(i);\n}\nfor i in 0..n {\n    step(i);\n}",
            },
          ],
        },
        propositionId: "CW-P12",
        admissible: true,
      },
      {
        hunk: {
          path: "src/algo/cw-p13.rs",
          oldStart: 1,
          newStart: 1,
          segments: [
            {
              kind: "addition",
              text: "let slot = hash_lookup(&key);\n// fast on typical keys, degrades under adversarial collisions",
            },
          ],
        },
        propositionId: "CW-P13",
        admissible: false,
        distractorStatement:
          "reuses \"Expected-case membership is not worst-case membership\" (CW-P13)'s own rewrite here — a real repair for a different algorithm shape, and does not respond to this round's own constraint.",
      },
    ] satisfies DiffSet,
  },
  {
    id: "round-cw-p13",
    constraints: [
      { dimension: "n", operator: "<=", bound: 100_000 },
    ] satisfies ConstraintSet,
    diffSet: [
      {
        hunk: {
          path: "src/algo/cw-p13.rs",
          oldStart: 1,
          newStart: 1,
          segments: [
            {
              kind: "addition",
              text: "let slot = hash_lookup(&key);\n// fast on typical keys, degrades under adversarial collisions",
            },
          ],
        },
        propositionId: "CW-P13",
        admissible: true,
      },
      {
        hunk: {
          path: "src/algo/cw-p14.rs",
          oldStart: 1,
          newStart: 1,
          segments: [
            {
              kind: "addition",
              text: "for i in 0..n {\n    for j in 0..m {\n        grid(i, j);\n    }\n}",
            },
          ],
        },
        propositionId: "CW-P14",
        admissible: false,
        distractorStatement:
          "reuses \"Two input dimensions do not collapse into one\" (CW-P14)'s own rewrite here — a real repair for a different algorithm shape, and does not respond to this round's own constraint.",
      },
    ] satisfies DiffSet,
  },
  {
    id: "round-cw-p14",
    constraints: [
      { dimension: "n", operator: "<=", bound: 5_000 },
    ] satisfies ConstraintSet,
    diffSet: [
      {
        hunk: {
          path: "src/algo/cw-p14.rs",
          oldStart: 1,
          newStart: 1,
          segments: [
            {
              kind: "addition",
              text: "for i in 0..n {\n    for j in 0..m {\n        grid(i, j);\n    }\n}",
            },
          ],
        },
        propositionId: "CW-P14",
        admissible: true,
      },
      {
        hunk: {
          path: "src/algo/cw-p15.rs",
          oldStart: 1,
          newStart: 1,
          segments: [
            {
              kind: "addition",
              text: "fn solve(n: u32) -> u32 {\n    if n <= 1 {\n        return n;\n    }\n    solve(n - 1) + solve(n - 2)\n}",
            },
          ],
        },
        propositionId: "CW-P15",
        admissible: false,
        distractorStatement:
          "reuses \"A recurrence is not a loop nest\" (CW-P15)'s own rewrite here — a real repair for a different algorithm shape, and does not respond to this round's own constraint.",
      },
    ] satisfies DiffSet,
  },
  {
    id: "round-cw-p15",
    constraints: [
      { dimension: "n", operator: "<=", bound: 30 },
    ] satisfies ConstraintSet,
    diffSet: [
      {
        hunk: {
          path: "src/algo/cw-p15.rs",
          oldStart: 1,
          newStart: 1,
          segments: [
            {
              kind: "addition",
              text: "fn solve(n: u32) -> u32 {\n    if n <= 1 {\n        return n;\n    }\n    solve(n - 1) + solve(n - 2)\n}",
            },
          ],
        },
        propositionId: "CW-P15",
        admissible: true,
      },
      {
        hunk: {
          path: "src/algo/cw-p16.rs",
          oldStart: 1,
          newStart: 1,
          segments: [
            {
              kind: "addition",
              text: "spawn_background_worker();\n// runs once, unaffected by n's bound",
            },
          ],
        },
        propositionId: "CW-P16",
        admissible: false,
        distractorStatement:
          "reuses \"A cost independent of the bounds is not a constraint problem\" (CW-P16)'s own rewrite here — a real repair for a different algorithm shape, and does not respond to this round's own constraint.",
      },
    ] satisfies DiffSet,
  },
  {
    id: "round-cw-p16",
    constraints: [
      { dimension: "n", operator: "<=", bound: 100_000 },
    ] satisfies ConstraintSet,
    diffSet: [
      {
        hunk: {
          path: "src/algo/cw-p16.rs",
          oldStart: 1,
          newStart: 1,
          segments: [
            {
              kind: "addition",
              text: "spawn_background_worker();\n// runs once, unaffected by n's bound",
            },
          ],
        },
        propositionId: "CW-P16",
        admissible: true,
      },
      {
        hunk: {
          path: "src/algo/cw-p1.rs",
          oldStart: 1,
          newStart: 1,
          segments: [
            {
              kind: "addition",
              text: "scan_for_duplicates(&items);\ncompact_gaps(&items);",
            },
          ],
        },
        propositionId: "CW-P1",
        admissible: false,
        distractorStatement:
          "reuses \"Sequential composition adds\" (CW-P1)'s own rewrite here — a real repair for a different algorithm shape, and does not respond to this round's own constraint.",
      },
    ] satisfies DiffSet,
  },
]
