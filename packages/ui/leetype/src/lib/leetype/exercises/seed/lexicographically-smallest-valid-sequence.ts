import { CONCEPT_IDS } from "@leetype/lib/leetype/exercises/concepts"
import type { Exercise } from "@leetype/types/exercise"

import { withJudgment as step } from "./judgment-step"

/**
 * A 24-rung competency ladder for LeetCode 3302. Each rung exposes one
 * consequence and asks for only the decision that makes it true. The same
 * exercise feeds the mobile reading probe and desktop typing session.
 */
export const lexicographicallySmallestValidSequence: Exercise = {
  id: "leetcode-3302-valid-sequence",
  title: "3302 · Lexicographically Smallest Valid Sequence",
  steps: [
    step({
      id: "lc3302-01-length-feasibility",
      goal: "Reject targets that cannot fit in a strictly increasing index sequence.",
      concepts: [CONCEPT_IDS.subsequenceFeasibility],
      obligation: "m selected indices require at least m source positions",
      decisionReason:
        "The length guard avoids constructing state for a target that cannot own enough distinct positions",
      counterfactual: "the contract permitted reusing a source index",
      surfaceRule: "A length guard is standard for subsequence problems",
      blocks: [
        {
          kind: "transition",
          label: "m > n",
          before: "search",
          after: "impossible",
        },
        {
          kind: "typing",
          language: "rust",
          source: "‹if ›m > n‹ { return vec![]; }›",
        },
      ],
    }),
    step({
      id: "lc3302-02-suffix-certificate",
      goal: "Reserve one certificate slot for every target suffix.",
      concepts: [CONCEPT_IDS.suffixCertificate],
      obligation:
        "each target position needs a boundary certifying whether its remaining suffix can match",
      decisionReason:
        "One boundary per target suffix preserves exactly the feasibility fact the forward decision needs",
      counterfactual:
        "later decisions needed the number or identity of every possible suffix match",
      surfaceRule: "Dynamic programming tables solve sequence problems",
      blocks: [
        {
          kind: "transition",
          label: "certificate",
          before: "unknown",
          after: "m suffix boundaries",
        },
        {
          kind: "typing",
          language: "rust",
          source: "‹let mut right = ›vec![usize::MAX; m]‹;›",
        },
      ],
    }),
    step({
      id: "lc3302-03-reverse-cursors",
      goal: "Start both cursors at the end so suffix feasibility is measured directly.",
      concepts: [
        CONCEPT_IDS.suffixCertificate,
        CONCEPT_IDS.strictIndexOrdering,
      ],
      transferFrom: "lc3302-02-suffix-certificate",
      obligation: "a suffix certificate is built from right to left",
      decisionReason:
        "A reverse scan constructs suffix boundaries without revisiting source prefixes",
      counterfactual:
        "the required certificate described prefixes rather than suffixes",
      surfaceRule: "Suffix problems should be scanned backward",
      blocks: [
        {
          kind: "transition",
          label: "scan direction",
          before: "prefix first",
          after: "suffix first",
        },
        {
          kind: "typing",
          language: "rust",
          source: "‹let (mut i, mut j) = (›n, m‹);›",
        },
      ],
    }),
    step({
      id: "lc3302-04-reverse-progress",
      goal: "Inspect the preceding source position on every reverse-scan iteration.",
      concepts: [CONCEPT_IDS.loopProgress],
      obligation:
        "the reverse source cursor strictly decreases before it is indexed",
      decisionReason:
        "Decreasing the source cursor makes the certificate pass linear and prevents reconsideration",
      counterfactual:
        "candidates had to be revisited after later evidence arrived",
      surfaceRule: "Loops need cursor updates",
      blocks: [
        {
          kind: "trace",
          headline: "reverse cursor",
          observations: [
            { label: "each iteration", value: "i decreases by 1" },
          ],
        },
        {
          kind: "typing",
          language: "rust",
          source: "‹while i > 0 && j > 0 {\n    ›i -= 1;‹\n}›",
        },
      ],
    }),
    step({
      id: "lc3302-05-record-suffix-match",
      goal: "Record a boundary only when the current characters extend the exact suffix.",
      concepts: [CONCEPT_IDS.suffixCertificate],
      obligation: "right[j - 1] certifies an exact match of target[j - 1..]",
      decisionReason:
        "Recording only equality keeps the certificate about an exact suffix, leaving the sole mismatch for the forward choice",
      counterfactual:
        "the suffix itself were allowed to consume and report a mismatch budget",
      surfaceRule: "Matching subsequences compare equal characters",
      blocks: [
        {
          kind: "transition",
          label: "equal characters",
          before: "suffix unchanged",
          after: "suffix extended",
        },
        {
          kind: "typing",
          language: "rust",
          source: "‹if a[i] == b[j - 1] {\n    ›right[j - 1] = i;‹\n}›",
        },
      ],
    }),
    step({
      id: "lc3302-06-advance-suffix",
      goal: "Move to the preceding target character only after extending the suffix.",
      concepts: [CONCEPT_IDS.suffixCertificate, CONCEPT_IDS.loopProgress],
      transferFrom: "lc3302-05-record-suffix-match",
      obligation:
        "a target cursor decrement represents one newly certified character",
      decisionReason:
        "Advancing only on equality prevents the certificate from claiming a target character that no source position supports",
      counterfactual:
        "the certificate stored probabilistic or approximate matches",
      surfaceRule: "Two-pointer scans advance on matches",
      blocks: [
        {
          kind: "trace",
          headline: "suffix growth",
          observations: [{ label: "on equality", value: "j decreases by 1" }],
        },
        {
          kind: "typing",
          language: "rust",
          source:
            "‹if a[i] == b[j - 1] {\n    right[j - 1] = i;\n    ›j -= 1;‹\n}›",
        },
      ],
    }),
    step({
      id: "lc3302-07-forward-state",
      goal: "Reset the scan to construct the answer from its lexicographically decisive front.",
      concepts: [CONCEPT_IDS.lexicographicGreedyChoice],
      obligation:
        "lexicographic minimization chooses the earliest answer index first",
      decisionReason:
        "Forward construction makes the earliest differing answer index the first commitment considered",
      counterfactual:
        "the output order were colexicographic or optimized its final index first",
      surfaceRule: "Lexicographic answers use greedy scans",
      blocks: [
        {
          kind: "transition",
          label: "construction",
          before: "right-to-left proof",
          after: "left-to-right choices",
        },
        {
          kind: "typing",
          language: "rust",
          source: "let (mut i, mut j) = (0, 0);",
        },
      ],
    }),
    step({
      id: "lc3302-08-mismatch-budget",
      goal: "Represent the single allowed character change as a consumable budget.",
      concepts: [CONCEPT_IDS.oneMismatchBudget],
      obligation: "at most one selected unequal pair may be committed",
      decisionReason:
        "A boolean preserves the only history future choices observe: whether the one permitted mismatch is already spent",
      counterfactual:
        "the contract exposed the mismatch count or allowed more than one change",
      surfaceRule: "At-most-one constraints use booleans",
      blocks: [
        {
          kind: "transition",
          label: "mismatch",
          before: "available",
          after: "spent at most once",
        },
        {
          kind: "typing",
          language: "rust",
          source: "let mut changed = false;",
        },
      ],
    }),
    step({
      id: "lc3302-09-answer-capacity",
      goal: "Track selected indices in target order without changing their ordering semantics.",
      concepts: [CONCEPT_IDS.strictIndexOrdering],
      obligation:
        "the result records one increasing source index per matched target position",
      decisionReason:
        "An ordered index vector preserves exactly the observable witness and no alternate paths",
      counterfactual:
        "the caller also required every valid sequence or a count of them",
      surfaceRule: "LeetCode asks for a vector",
      blocks: [
        {
          kind: "transition",
          label: "answer",
          before: "empty",
          after: "up to m ordered indices",
        },
        {
          kind: "typing",
          language: "rust",
          source: "let mut answer = Vec::with_capacity(m);",
        },
      ],
    }),
    step({
      id: "lc3302-10-forward-domain",
      goal: "Search only while both a source candidate and a target demand remain.",
      concepts: [CONCEPT_IDS.subsequenceFeasibility, CONCEPT_IDS.loopProgress],
      obligation:
        "construction ends when either no candidate or no demand remains",
      decisionReason:
        "Stopping when either candidates or demand are exhausted avoids work that cannot change validity",
      counterfactual:
        "the scan had to report diagnostics about unused source positions",
      surfaceRule: "Two-pointer loops compare both lengths",
      blocks: [
        {
          kind: "transition",
          label: "loop domain",
          before: "unchecked",
          after: "i < n and j < m",
        },
        {
          kind: "typing",
          language: "rust",
          source: "‹while ›i < n && j < m‹ { }›",
        },
      ],
    }),
    step({
      id: "lc3302-11-exact-match-priority",
      goal: "Accept the earliest exact match without spending the mismatch budget.",
      concepts: [
        CONCEPT_IDS.lexicographicGreedyChoice,
        CONCEPT_IDS.oneMismatchBudget,
      ],
      obligation:
        "an exact match at the earliest candidate dominates skipping it and preserves the change",
      decisionReason:
        "Taking the earliest exact match improves the index prefix while preserving both suffix feasibility and the unused change",
      counterfactual:
        "an exact selection carried a different cost from a changed selection",
      surfaceRule: "Greedy subsequence solutions take matches",
      blocks: [
        {
          kind: "transition",
          label: "a[i] == b[j]",
          before: "candidate",
          after: "selected, budget preserved",
        },
        {
          kind: "typing",
          language: "rust",
          source: "‹if a[i] == b[j] {\n    ›answer.push(i);‹\n}›",
        },
      ],
    }),
    step({
      id: "lc3302-12-advance-target",
      goal: "Advance the target cursor exactly when an index is selected.",
      concepts: [CONCEPT_IDS.strictIndexOrdering],
      obligation:
        "each selected source index discharges exactly one target position",
      decisionReason:
        "Coupling target progress to selection preserves the one-index-per-target invariant",
      counterfactual:
        "one source position could satisfy multiple target positions",
      surfaceRule: "Matched pointers advance together",
      blocks: [
        {
          kind: "trace",
          headline: "selection",
          observations: [{ label: "target progress", value: "+1" }],
        },
        {
          kind: "typing",
          language: "rust",
          source: "‹answer.push(i);\n›j += 1;",
        },
      ],
    }),
    step({
      id: "lc3302-13-last-position-change",
      goal: "Allow an unused mismatch on the final target position without a suffix check.",
      concepts: [
        CONCEPT_IDS.oneMismatchBudget,
        CONCEPT_IDS.subsequenceFeasibility,
      ],
      obligation:
        "after selecting the last target position no suffix remains to protect",
      decisionReason:
        "The final target position needs no reserved suffix, so any remaining source position is a safe use of the budget",
      counterfactual: "a later obligation existed after the returned sequence",
      surfaceRule: "The last element is a special case",
      blocks: [
        {
          kind: "transition",
          label: "j + 1 == m",
          before: "one character remains",
          after: "any source character is feasible",
        },
        {
          kind: "typing",
          language: "rust",
          source: "‹let can_change = !changed && (›j + 1 == m‹);›",
        },
      ],
    }),
    step({
      id: "lc3302-14-suffix-room",
      goal: "Permit an early mismatch only when the exact suffix still starts later.",
      concepts: [CONCEPT_IDS.suffixCertificate, CONCEPT_IDS.oneMismatchBudget],
      transferFrom: "lc3302-13-last-position-change",
      obligation:
        "provided a later exact realization of target[j + 1..] is already known to exist, choosing i for target j must leave that realization strictly later than i — this step assumes the realization exists and leaves ruling out its absence to lc3302-19",
      decisionReason:
        "The stored boundary proves the ordering once a later exact suffix is known to exist; this comparison alone does not yet check that the boundary denotes a real index rather than the usize::MAX sentinel for 'no such suffix'",
      counterfactual:
        "the remaining suffix could spend another mismatch or reorder indices",
      surfaceRule: "Look ahead before making a greedy choice",
      blocks: [
        {
          kind: "transition",
          label: "suffix boundary",
          before: "i",
          after: "right[j + 1] > i",
        },
        {
          kind: "typing",
          language: "rust",
          source:
            "‹let can_change = !changed && (j + 1 == m || ›i < right[j + 1]‹);›",
        },
      ],
    }),
    step({
      id: "lc3302-15-strict-boundary",
      goal: "Keep the suffix boundary strictly after the mismatched index.",
      concepts: [
        CONCEPT_IDS.strictIndexOrdering,
        CONCEPT_IDS.suffixCertificate,
      ],
      transferFrom: "lc3302-14-suffix-room",
      obligation: "two target positions cannot reuse the same source index",
      decisionReason:
        "Strict comparison enforces distinct increasing indices rather than mere nondecreasing positions",
      counterfactual:
        "the contract explicitly allowed one source index to be reused",
      surfaceRule: "Index sequences use less-than",
      blocks: [
        {
          kind: "transition",
          label: "boundary test",
          before: "i <= right[j + 1]",
          after: "i < right[j + 1]",
        },
        { kind: "typing", language: "rust", source: "i < right[j + 1]" },
      ],
    }),
    step({
      id: "lc3302-16-commit-change",
      goal: "Consume the mismatch budget at the same moment its index is selected.",
      concepts: [CONCEPT_IDS.oneMismatchBudget],
      obligation:
        "no later unequal pair can be selected after the first mismatch",
      decisionReason:
        "Spending the budget atomically with selection prevents later code from observing a chosen mismatch as still available",
      counterfactual:
        "selection and budget accounting were transactionally retried or reversible",
      surfaceRule: "Set a flag after using a special case",
      blocks: [
        {
          kind: "transition",
          label: "can_change",
          before: "true",
          after: "changed = true",
        },
        {
          kind: "typing",
          language: "rust",
          source:
            "‹if can_change {\n    answer.push(i);\n    j += 1;\n    ›changed = true;‹\n}›",
        },
      ],
    }),
    step({
      id: "lc3302-17-source-progress",
      goal: "Advance past every considered source position, selected or skipped.",
      concepts: [CONCEPT_IDS.loopProgress, CONCEPT_IDS.strictIndexOrdering],
      obligation:
        "each source index is considered once and can be selected at most once",
      decisionReason:
        "A monotone source cursor gives each candidate one decision point, establishing linear work and increasing output indices",
      counterfactual:
        "a later constraint could invalidate and require retracting an earlier selection",
      surfaceRule: "Greedy scans always move forward",
      blocks: [
        {
          kind: "trace",
          headline: "forward scan",
          observations: [
            { label: "each iteration", value: "i increases by 1" },
          ],
        },
        {
          kind: "typing",
          language: "rust",
          source:
            "‹while i < n && j < m {\n    // consider i\n    ›i += 1;‹\n}›",
        },
      ],
    }),
    step({
      id: "lc3302-18-completion-test",
      goal: "Return indices only when every target position has been discharged.",
      concepts: [CONCEPT_IDS.impossibilityDetection],
      obligation: "a partial subsequence is not a valid sequence",
      decisionReason:
        "Target exhaustion is the observable validity condition; a nonempty partial witness remains invalid",
      counterfactual:
        "the API returned the longest achievable prefix instead of all-or-nothing validity",
      surfaceRule: "Return empty when no solution exists",
      blocks: [
        {
          kind: "transition",
          label: "j",
          before: "possibly less than m",
          after: "must equal m",
        },
        {
          kind: "typing",
          language: "rust",
          source: "‹if ›j == m‹ { answer } else { vec![] }›",
        },
      ],
    }),
    step({
      id: "lc3302-19-impossible-suffix",
      goal: "Treat a missing exact suffix certificate as permission denied, not as an index.",
      concepts: [
        CONCEPT_IDS.suffixCertificate,
        CONCEPT_IDS.impossibilityDetection,
      ],
      transferFrom: "lc3302-18-completion-test",
      obligation:
        "usize::MAX cannot satisfy the strictly-later suffix witness as a real source position",
      decisionReason:
        "A separate sentinel check distinguishes absent evidence from a very late real boundary",
      counterfactual:
        "the index type encoded absence structurally instead of with a sentinel",
      surfaceRule: "Sentinels should be checked",
      blocks: [
        {
          kind: "transition",
          label: "right[j + 1]",
          before: "missing",
          after: "change rejected",
        },
        {
          kind: "typing",
          language: "rust",
          source: "‹let suffix_exists = ›right[j + 1] != usize::MAX‹;›",
        },
      ],
    }),
    step({
      id: "lc3302-20-safe-change-predicate",
      goal: "Combine budget, existence, and ordering into one complete mismatch condition.",
      concepts: [CONCEPT_IDS.oneMismatchBudget, CONCEPT_IDS.suffixCertificate],
      transferFrom: "lc3302-19-impossible-suffix",
      obligation:
        "a non-final mismatch is safe exactly when an unused change leaves a certified later suffix",
      decisionReason:
        "The combined predicate is the minimal conjunction future correctness depends on: budget, suffix existence, and strict room",
      counterfactual:
        "the certificate guaranteed existence by construction or the budget were unbounded",
      surfaceRule: "Put all guards in one condition",
      blocks: [
        {
          kind: "transition",
          label: "can_change",
          before: "partial checks",
          after: "complete feasibility predicate",
        },
        {
          kind: "typing",
          language: "rust",
          source:
            "!changed && (j + 1 == m || (right[j + 1] != usize::MAX && i < right[j + 1]))",
        },
      ],
    }),
    step({
      id: "lc3302-21-earliest-safe-choice",
      goal: "Choose the first safe index instead of comparing complete candidate sequences.",
      concepts: [
        CONCEPT_IDS.lexicographicGreedyChoice,
        CONCEPT_IDS.greedyExchangeArgument,
      ],
      obligation:
        "replacing a later feasible first choice by the earliest safe one improves the sequence without harming its certified suffix",
      decisionReason:
        "Immediate commitment is justified by an exchange argument: no later feasible first index can improve the prefix",
      counterfactual:
        "choices had weights, global coupling, or a nonlexicographic objective",
      surfaceRule: "Greedy means choosing the first candidate",
      blocks: [
        {
          kind: "transition",
          label: "candidate i",
          before: "safe and earliest",
          after: "commit immediately",
        },
        {
          kind: "typing",
          language: "rust",
          source:
            "‹if exact || can_change {\n    ›answer.push(i);‹\n    j += 1;\n}›",
        },
      ],
    }),
    step({
      id: "lc3302-22-linear-bound",
      goal: "Account for both monotone scans as linear work with linear auxiliary storage.",
      concepts: [CONCEPT_IDS.linearTimeScan],
      obligation:
        "neither cursor retreats within its scan, so source positions are visited at most twice",
      decisionReason:
        "Two monotone scans trade O(m) certificate storage for avoiding repeated suffix searches",
      counterfactual:
        "auxiliary memory were forbidden and quadratic time were acceptable",
      surfaceRule: "Two-pointer algorithms are linear",
      blocks: [
        {
          kind: "trace",
          headline: "complexity",
          observations: [
            { label: "time / extra space", value: "O(n + m) / O(m)" },
          ],
        },
        {
          kind: "typing",
          language: "rust",
          source:
            "‹// reverse certificate + forward construction: ›O(n + m)‹ time›",
        },
      ],
    }),
    step({
      id: "lc3302-23-adversarial-prefix",
      goal: "Preserve an early mismatch when an exact-looking prefix would block the remaining suffix.",
      concepts: [
        CONCEPT_IDS.greedyExchangeArgument,
        CONCEPT_IDS.suffixCertificate,
      ],
      obligation:
        "the greedy decision is governed by suffix feasibility rather than local character preference alone",
      decisionReason:
        "The case separates suffix-certified judgment from the cargo-cult rule that exact characters must always win",
      counterfactual:
        "the objective minimized character changes before index lexicographic order",
      surfaceRule: "Adversarial examples are useful for greedy algorithms",
      blocks: [
        {
          kind: "trace",
          headline: "word1 = baac, word2 = aac",
          observations: [
            {
              label: "lexicographically first valid indices",
              value: "[0, 1, 3]",
            },
          ],
        },
        { kind: "typing", language: "rust", source: "vec![0, 1, 3]" },
      ],
    }),
    step({
      id: "lc3302-24-integrated-solution",
      goal: "Integrate the suffix certificate and earliest-safe scan into the complete solution.",
      concepts: [
        CONCEPT_IDS.lexicographicGreedyChoice,
        CONCEPT_IDS.suffixCertificate,
        CONCEPT_IDS.oneMismatchBudget,
        CONCEPT_IDS.linearTimeScan,
      ],
      transferFrom: "lc3302-23-adversarial-prefix",
      obligation:
        "the complete function returns the lexicographically smallest valid sequence or an empty vector when none exists",
      decisionReason:
        "The two-pass design stores only suffix feasibility and then commits the earliest choice whose remaining obligation is certified",
      counterfactual:
        "memory limits required recomputation, or the caller needed all valid sequences rather than the first",
      surfaceRule: "LeetCode 3302 is solved with a greedy suffix array",
      blocks: [
        {
          kind: "transition",
          label: "solution",
          before: "two proven scans",
          after: "one complete algorithm",
        },
        {
          kind: "typing",
          language: "rust",
          source: `fn valid_sequence(word1: &str, word2: &str) -> Vec<usize> {
    let (a, b) = (word1.as_bytes(), word2.as_bytes());
    let (n, m) = (a.len(), b.len());
    if m > n { return vec![]; }
    let mut right = vec![usize::MAX; m];
    let (mut i, mut j) = (n, m);
    while i > 0 && j > 0 {
        i -= 1;
        if a[i] == b[j - 1] { j -= 1; right[j] = i; }
    }
    let (mut i, mut j, mut changed) = (0, 0, false);
    let mut answer = Vec::with_capacity(m);
    while i < n && j < m {
        let exact = a[i] == b[j];
        let can_change = !changed && (j + 1 == m ||
            (right[j + 1] != usize::MAX && i < right[j + 1]));
        if exact || can_change {
            answer.push(i);
            j += 1;
            if !exact { changed = true; }
        }
        i += 1;
    }
    if j == m { answer } else { vec![] }
}`,
        },
      ],
    }),
  ],
}
