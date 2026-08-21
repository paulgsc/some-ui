import { CONCEPT_IDS } from "@leetype/lib/leetype/exercises/concepts"
import type { DiagnosticStep, Exercise } from "@leetype/types/exercise"

/** Failure class 2: an exclusive bound treated as if it were a valid index. */
const diagnosticInclusiveBoundaryStep: DiagnosticStep = {
  id: "diagnostic-inclusive-boundary-01",
  goal: "Fix the scan bound so the loop stops one before the slice ends, not at it.",
  concepts: [CONCEPT_IDS.exclusiveVsInclusiveBounds, CONCEPT_IDS.sliceIndexing],
  blocks: [
    {
      kind: "trace",
      headline: "PANIC",
      observations: [
        { label: "index", value: "4" },
        { label: "len", value: "4" },
      ],
    },
    {
      kind: "typing",
      source:
        "‹let (mut left, right) = (0, chars.len());\n// attempted: while left <= right — panics once left reaches right\nwhile ›left < right‹ {\n    sum += chars[left] as u32;\n    left += 1;\n}›",
      language: "rust",
    },
  ],
  rationale: {
    cause:
      "the loop condition treats right (an exclusive bound equal to chars.len()) as if it were a valid index, so the scan reads one position past the last element",
    whyRepairDiscriminates:
      "left < right is the only condition that excludes left == right, the exact point where chars[left] reads out of bounds",
  },
}

export const diagnosticInclusiveBoundary: Exercise = {
  id: "diagnostic-inclusive-boundary",
  title: "Diagnostic: inclusive boundary",
  steps: [diagnosticInclusiveBoundaryStep],
}
