import type { DiagnosticStep, Exercise } from "@leetype/types/exercise"

import { CONCEPT_IDS } from "../concepts"

/**
 * Failure class 1: a loop that never advances toward its own exit.
 *
 * The corpus's first hand-authored patch instance (LTY-PATCH P2, #1077):
 * this step's frame was always a one-line hunk with three lines of context
 * around it (cited by #1076's decision record as the existing evidence for
 * "the engine does not change") — `patch` paints it as the diff it already
 * was. Rendered lines, after `‹…›` stripping: `while cursor < input.len()
 * {` and `    parse(input[cursor]);` stay pure context; `    cursor += 1;`
 * mixes inherited indentation with the one typed statement, so the whole
 * line reads `add` per the mixed-line rule (docs/leetype/README.md); `}`
 * closes the second context span and stays `context`. No `del` line here —
 * this hunk's fault is an absence, not a visibly wrong line, which is as
 * legitimate a hunk shape as one with a removed line.
 */
const diagnosticLoopProgressStep: DiagnosticStep = {
  id: "diagnostic-loop-progress-01",
  goal: "Give the parse loop the missing step that lets it terminate.",
  concepts: [CONCEPT_IDS.loopProgress, CONCEPT_IDS.mutableState],
  blocks: [
    {
      kind: "trace",
      headline: "TIMEOUT",
      observations: [{ label: "cursor", value: "remained 0" }],
    },
    {
      kind: "typing",
      source:
        "‹while cursor < input.len() {\n    parse(input[cursor]);\n    ›cursor += 1;‹\n}›",
      language: "rust",
      patch: {
        path: "src/parse/cursor.rs",
        oldStart: 1,
        newStart: 1,
        lineKinds: ["context", "context", "add", "context"],
      },
    },
  ],
  rationale: {
    cause:
      "the loop body never mutates cursor, so the while condition never becomes false",
    whyRepairDiscriminates:
      "incrementing cursor is the only change that gives the loop measurable progress toward input.len()",
  },
}

export const diagnosticLoopProgress: Exercise = {
  id: "diagnostic-loop-progress",
  title: "Diagnostic: loop progress",
  steps: [diagnosticLoopProgressStep],
}
