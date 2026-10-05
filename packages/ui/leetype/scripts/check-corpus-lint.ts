/**
 * CI guardrail: the thin CLI that runs the corpus lints against the real
 * data (logic and tests in `../src/lib/leetype/exercises/corpus-lint.ts`),
 * alongside the repo's other data-as-CI-input guardrails. Three scans: the
 * step corpus (`lintCorpus`), the fixture round corpus (`lintRoundCorpus`),
 * and the authored rounds (`lintAuthoredRounds`).
 *
 * Usage: pnpm --filter @some-ui/leetype lint:corpus
 */
import { AUTHORED_ROUNDS } from "@leetype/lib/leetype/authored-rounds"
import { ALL_FIXTURE_EXERCISES } from "@leetype/lib/leetype/exercises"
import {
  lintCorpus,
  lintRoundCorpus,
} from "@leetype/lib/leetype/exercises/corpus-lint"
import { lintAuthoredRounds } from "@leetype/lib/leetype/round-assembly"
import { ALL_FIXTURE_ROUNDS } from "@leetype/lib/leetype/round-corpus"

function main(): void {
  const stepViolations = lintCorpus(ALL_FIXTURE_EXERCISES)
  const roundViolations = lintRoundCorpus(ALL_FIXTURE_ROUNDS)
  const authoredViolations = lintAuthoredRounds(AUTHORED_ROUNDS)
  const violations = [
    ...stepViolations,
    ...roundViolations,
    ...authoredViolations,
  ]

  if (violations.length > 0) {
    console.error(`Corpus lint failed: ${violations.length} violation(s)\n`)
    for (const violation of violations) {
      console.error(`  ${violation}`)
    }
    process.exitCode = 1
  } else {
    const exerciseCount = ALL_FIXTURE_EXERCISES.length
    const stepCount = ALL_FIXTURE_EXERCISES.reduce(
      (total, exercise) => total + exercise.steps.length,
      0
    )
    console.log(
      `Corpus lint passed: ${stepCount} step(s) across ${exerciseCount} exercise(s) checked, ` +
        `${ALL_FIXTURE_ROUNDS.length} round(s) checked, ` +
        `${AUTHORED_ROUNDS.length} authored round(s) checked.`
    )
  }
}

main()
