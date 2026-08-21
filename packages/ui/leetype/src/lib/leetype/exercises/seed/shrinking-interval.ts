import { CONCEPT_IDS } from "@leetype/lib/leetype/exercises/concepts"
import type { DiagnosticStep, Exercise } from "@leetype/types/exercise"

/** Failure class 3: a search window whose edge never actually moves. */
const diagnosticShrinkingIntervalStep: DiagnosticStep = {
  id: "diagnostic-shrinking-interval-01",
  goal: "Give the shrinking search its missing step, so the window actually narrows.",
  concepts: [CONCEPT_IDS.loopProgress, CONCEPT_IDS.windowShrinking],
  blocks: [
    {
      kind: "trace",
      headline: "TIMEOUT",
      observations: [{ label: "right", value: "stayed at 4" }],
    },
    {
      kind: "typing",
      source:
        "‹let mut left = 0;\nlet mut right = chars.len();\nwhile left < right {\n    if chars[right - 1] == target {\n        break;\n    }\n    ›right -= 1;‹\n}›",
      language: "rust",
    },
  ],
  rationale: {
    cause:
      "nothing in the loop body decrements right, so the window's right edge never moves and left < right stays true forever when the target is never found",
    whyRepairDiscriminates:
      "right -= 1 is the one missing statement that gives the search window a shrinking measure to terminate on",
  },
}

export const diagnosticShrinkingInterval: Exercise = {
  id: "diagnostic-shrinking-interval",
  title: "Diagnostic: shrinking interval",
  steps: [diagnosticShrinkingIntervalStep],
}
