import {
  FIXTURE_ADVERSARIAL_EXERCISE_ID,
  nextExercise,
} from "@leetype/lib/leetype/exercises"
import { promptBlocksOf } from "@leetype/types/exercise"
import { describe, expect, it } from "vitest"

import { EVIDENCE_ROW_BUDGET, evidenceRowsOf } from "./rows"

/**
 * The corpus lint LTY-EVIDENCE E3 promises: "if a diagnostic observation
 * needs pages, it is not granular enough" turned into a CI failure rather
 * than a sentence in a doc comment.
 *
 * `PromptPanel`'s pagination path is a defensive floor now — real code,
 * proven against the deliberately-hostile fixture (see
 * `index.stories.tsx`'s `DeliberatelyAbusive`) — but never something a
 * validated corpus should reach. This is the other half of that claim: it
 * walks every step the shim actually hands out and fails loudly if one
 * would.
 */
describe("corpus lint: no step's evidence reaches the panel's row budget", () => {
  for (const exercise of [
    nextExercise(),
    nextExercise({ preferId: FIXTURE_ADVERSARIAL_EXERCISE_ID }),
  ]) {
    it(`holds for every step in "${exercise.id}"`, () => {
      for (const step of exercise.steps) {
        const rowCount = evidenceRowsOf(promptBlocksOf(step)).length
        expect(
          rowCount,
          `step "${step.id}" has ${rowCount} evidence rows, over the budget of ${EVIDENCE_ROW_BUDGET}`
        ).toBeLessThanOrEqual(EVIDENCE_ROW_BUDGET)
      }
    })
  }
})
