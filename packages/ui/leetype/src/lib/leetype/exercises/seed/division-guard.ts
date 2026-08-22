import { CONCEPT_IDS } from "@leetype/lib/leetype/exercises/concepts"
import type { DiagnosticStep, Exercise } from "@leetype/types/exercise"
import { typingBlockFromDiff } from "@leetype/types/exercise"

/**
 * LTY-PATCH P4's own instance (#1079): the corpus's first multi-line patch
 * repair, demonstrating that a hunk decouples "one line" from "one locus."
 * The repair is a three-line guard clause — one contiguous `add` run — well
 * inside `DIAGNOSTIC_REPAIR_MAX_CHARS` even spanning three lines, which the
 * pre-LTY-PATCH single-line rule would have rejected outright regardless of
 * the character count.
 *
 * Rendered lines, after `‹…›` stripping: the function signature stays
 * `context`; the three-line guard (`if count == 0 { return 0; }`) reads
 * `add` throughout — line one mixes inherited indentation with the typed
 * `if`, per the mixed-line rule, and the two lines after it are entirely
 * typed; the division and the closing brace stay `context`, already given
 * and unaffected by the fix.
 */
const diagnosticDivisionGuardStep: DiagnosticStep = {
  id: "diagnostic-division-guard-01",
  goal: "Guard the division so a zero count returns instead of panicking.",
  concepts: [CONCEPT_IDS.preconditionGuard],
  blocks: [
    {
      kind: "trace",
      headline: "PANIC",
      observations: [{ label: "count", value: "0" }],
    },
    typingBlockFromDiff({
      language: "rust",
      path: "src/stats/average.rs",
      oldStart: 1,
      newStart: 1,
      segments: [
        {
          kind: "context",
          text: "fn average(total: i32, count: i32) -> i32 {\n    ",
        },
        {
          kind: "addition",
          text: "if count == 0 {\n        return 0;\n    }",
        },
        { kind: "context", text: "\n    total / count\n}" },
      ],
    }),
  ],
  rationale: {
    cause:
      "the function divides by count unconditionally, so a zero count panics on integer division",
    whyRepairDiscriminates:
      "returning early on count == 0 is the only change that avoids the division entirely for the one input that makes it undefined",
  },
}

export const diagnosticDivisionGuard: Exercise = {
  id: "diagnostic-division-guard",
  title: "Diagnostic: division guard",
  steps: [diagnosticDivisionGuardStep],
}
