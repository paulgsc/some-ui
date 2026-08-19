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
 * LTY-PATCH P6 (#1081): also the one caller that hands `lintCorpus` the
 * real, wasm-backed `PatchAlignmentCheck` — this process is plain Node
 * (via `tsx`), not vitest, so it is not subject to the `@some-ui/leetype-wasm`
 * -> `.d.ts`-stub alias every `*.test.ts` file resolves to, and can load
 * the real compiled engine (`load-real-wasm.ts`).
 *
 * Usage: pnpm --filter @some-ui/leetype lint:corpus
 */
import { ALL_FIXTURE_EXERCISES } from "@leetype/lib/leetype/exercises"
import type { PatchAlignmentCheck } from "@leetype/lib/leetype/exercises/corpus-lint"
import { lintCorpus } from "@leetype/lib/leetype/exercises/corpus-lint"

import { loadRealWasm } from "./load-real-wasm"

async function main(): Promise<void> {
  const wasm = await loadRealWasm()
  const patchAlignmentCheck: PatchAlignmentCheck = {
    renderedSourceOf: (source) => wasm.rendered_source(source),
    rolesOf: (source) => wasm.classify_source(source),
  }

  const violations = lintCorpus(ALL_FIXTURE_EXERCISES, patchAlignmentCheck)

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

await main()
