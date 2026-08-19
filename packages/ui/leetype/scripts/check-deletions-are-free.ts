/**
 * CI guardrail (LTY-PATCH P6, #1081) — the single test the whole epic's
 * safety claim rests on. #998 proved "context contributes nothing to the
 * gate" in Rust, for a frame; this proves the identical property
 * end-to-end for a hunk, against the real compiled engine, in the
 * workspace, because the failure mode is silent: a hunk whose deletion
 * secretly weighed on the gate would show up as every step escaping at
 * `MAX_STEP_ATTEMPTS`, with no error and no failing test — until this one.
 *
 * Drives the real `@some-ui/leetype-wasm` binary via `load-real-wasm.ts`,
 * not the `.d.ts` stub every `*.test.ts` file resolves to — see that
 * file's own doc comment for why a vitest test cannot do this.
 *
 * Usage: pnpm --filter @some-ui/leetype test:deletions-are-free
 */
import type { PlayableGame } from "./deletions-are-free"
import { compareGateFigures, playToCompletion } from "./deletions-are-free"
import { loadRealWasm } from "./load-real-wasm"

/**
 * `TypingGameWasm`'s methods cross the wasm boundary raw (`layout(): unknown`,
 * etc.) — this workspace's own typed wrapper (`TypedTypingGame`) is what
 * normally narrows them, but that class is built for the app's async
 * loader/subscription lifecycle, not a one-shot script. This cast asserts
 * what the crate's own documented shape guarantees: `layout().displaySource`
 * and `roles()` are exactly what `PlayableGame` expects.
 */
function asPlayableGame(instance: unknown): PlayableGame {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- see above; the crate's documented shape is not statically checkable from `unknown`
  return instance as PlayableGame
}

/**
 * A hunk with a `-` side that dwarfs its `+` side: ten deleted lines of a
 * function nobody types, framing one added line, against that exact same
 * added line with no deletion at all. Large on purpose — the failure mode
 * this guards is a `-` side heavy enough to tip a real gate threshold, and
 * a one-line deletion would be too small to have ever tipped it even with
 * a real bug in the accounting.
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
