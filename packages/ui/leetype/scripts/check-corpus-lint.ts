/**
 * CI guardrail (LTY-FAMILIES A5): the fourth of this repository's
 * data-as-CI-input lint family — `scripts/check-wasm-bindgen-boundary.sh`,
 * `scripts/check-mutation-boundary.sh` and `docs/canon/scripts/check-citations.sh`
 * are the other three. The checking logic lives in
 * `../src/lib/leetype/exercises/corpus-lint.ts`, alongside its own test
 * suite (`corpus-lint.test.ts`) against deliberately malformed fixtures;
 * this file is the thin CLI entry that runs it against the real corpus and
 * reports pass/fail the way the other guardrail scripts do.
 *
 * Usage: pnpm --filter @some-ui/leetype lint:corpus
 */
import { ALL_FIXTURE_EXERCISES } from "@leetype/lib/leetype/exercises"
import { lintCorpus } from "@leetype/lib/leetype/exercises/corpus-lint"

function main(): void {
  const violations = lintCorpus(ALL_FIXTURE_EXERCISES)

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
      `Corpus lint passed: ${stepCount} step(s) across ${exerciseCount} exercise(s) checked.`
    )
  }
}

main()
