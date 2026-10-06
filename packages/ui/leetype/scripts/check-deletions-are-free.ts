/**
 * CI guardrail (LTY-PATCH): a hunk's deletion contributes nothing to the
 * gate, proven end-to-end against the real compiled engine. The failure is
 * silent otherwise: every step would escape at `MAX_STEP_ATTEMPTS` with no
 * error.
 *
 * Drives the real binary via `load-real-wasm.ts`; vitest resolves the
 * package to a `.d.ts` stub (see that file).
 *
 * Usage: pnpm --filter @some-ui/leetype test:deletions-are-free
 */
import type { PlayableGame } from "./deletions-are-free"
import { compareGateFigures, playToCompletion } from "./deletions-are-free"
import { loadRealWasm } from "./load-real-wasm"

/**
 * The raw `TypingGameWasm` methods return `unknown`; `TypedTypingGame` suits
 * the app's lifecycle, not a script. This cast asserts the crate's
 * documented shape matches `PlayableGame`.
 */
function asPlayableGame(instance: unknown): PlayableGame {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- see above; the crate's documented shape is not statically checkable from `unknown`
  return instance as PlayableGame
}

/**
 * Ten deleted lines framing one added line, against the same added line
 * alone. Large on purpose: a one-line deletion could never tip a real gate
 * threshold even with an accounting bug.
 */
const WITH_LARGE_DELETION =
  "‹fn slow_path(items: &[i32]) -> i32 {\n" +
  "    let mut total = 0;\n" +
  "    for item in items {\n" +
  "        if *item % 2 == 0 {\n" +
  "            total += item * 2;\n" +
  "        } else {\n" +
  "            total += item;\n" +
  "        }\n" +
  "    }\n" +
  "    total\n" +
  "}\n" +
  "›fn fast_path(items: &[i32]) -> i32 {\n" +
  "    items.iter().sum()\n" +
  "}"

const WITHOUT_DELETION =
  "fn fast_path(items: &[i32]) -> i32 {\n    items.iter().sum()\n}"

async function main(): Promise<void> {
  const wasm = await loadRealWasm()

  const startNow = Date.now()
  const withDeletion = playToCompletion(
    asPlayableGame(new wasm.TypingGame(WITH_LARGE_DELETION)),
    startNow
  )
  const withoutDeletion = playToCompletion(
    asPlayableGame(new wasm.TypingGame(WITHOUT_DELETION)),
    startNow
  )

  const violations = compareGateFigures(
    withDeletion,
    withoutDeletion,
    "large-deletion hunk vs. the same addition with no deletion"
  )

  if (violations.length > 0) {
    console.error(
      `Deletions-are-free check failed: ${violations.length} figure(s) diverged\n`
    )
    for (const violation of violations) {
      console.error(`  ${violation}`)
    }
    process.exitCode = 1
  } else {
    console.log(
      "Deletions-are-free check passed: assisted/correct/weightedWpm/gateThreshold " +
        "are identical with and without the '-' side."
    )
  }
}

await main()
