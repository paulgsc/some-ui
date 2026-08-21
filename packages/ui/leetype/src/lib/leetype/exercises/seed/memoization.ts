import { CONCEPT_IDS } from "@leetype/lib/leetype/exercises/concepts"
import type { DiagnosticStep, Exercise } from "@leetype/types/exercise"

/**
 * LTY-SEED G4 (#1109): the epic's first worked generation run, diagnostic
 * half. Generated against `leetype-exercise-generator/index.md` v1.0 with
 * `Concept: memoization`, `Invariant violated: an overlapping-subproblems
 * recurrence must cache a prior result or it re-derives it exponentially
 * many times`. Landed after review against #1005's six constraints — see
 * `docs/leetype/leetype-exercise-generator-log.md` for what that review
 * caught and fixed before this module existed in this form.
 *
 * `memoization` is a genuinely new concept (`concepts.ts`), not a
 * near-duplicate of anything already probed: `loopProgress` is about a
 * loop's own termination measure, this is about redundant recomputation
 * across recursive calls — a different failure entirely. Rendered lines,
 * after `‹…›` stripping: the function signature stays `context`; the
 * three-line memo-check guard reads `add` throughout (line one mixes
 * inherited indentation with the typed `if`, per the mixed-line rule); the
 * base case, the recursive computation, the memo insert and the return all
 * stay `context` — already given, unaffected by the fix.
 */
const diagnosticMemoizationStep: DiagnosticStep = {
  id: "diagnostic-memoization-01",
  goal: "Cache a subproblem's result so fib stops recomputing it on every call.",
  concepts: [CONCEPT_IDS.memoization],
  blocks: [
    {
      kind: "trace",
      headline: "REGRESSION",
      observations: [
        { label: "fib(35) calls, naive", value: "29,860,703" },
        { label: "fib(35) subproblems, distinct", value: "36" },
      ],
    },
    {
      kind: "typing",
      source:
        "‹fn fib(n: u64, memo: &mut HashMap<u64, u64>) -> u64 {\n    ›if let Some(v) = memo.get(&n) {\n        return *v;\n    }‹\n    if n < 2 {\n        return n;\n    }\n    let result = fib(n - 1, memo) + fib(n - 2, memo);\n    memo.insert(n, result);\n    result\n}›",
      language: "rust",
      patch: {
        path: "src/dp/fib.rs",
        oldStart: 1,
        newStart: 1,
        lineKinds: [
          "context",
          "add",
          "add",
          "add",
          "context",
          "context",
          "context",
          "context",
          "context",
          "context",
          "context",
        ],
      },
    },
  ],
  rationale: {
    cause:
      "fib recomputes fib(n-1) and fib(n-2) from scratch on every call, so the same subproblem is solved exponentially many times instead of once",
    whyRepairDiscriminates:
      "checking the memo before recursing is the only change that turns repeated recomputation into a single lookup per distinct n, without changing what value is returned",
  },
}

export const diagnosticMemoization: Exercise = {
  id: "diagnostic-memoization",
  title: "Diagnostic: memoization",
  steps: [diagnosticMemoizationStep],
}
