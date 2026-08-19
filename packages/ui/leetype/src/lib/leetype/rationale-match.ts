/**
 * `typed` mirrors `narrow()`'s own argument back, so a caller holding only
 * a `MatchState` still knows what produced it — useful for a component
 * that renders one and doesn't want to also thread the raw string through
 * as a second prop.
 */
export type MatchState = {
  typed: string
  /** Every candidate that still has `typed` as a prefix. */
  live: ReadonlyArray<string>
  /** The one candidate `typed` exactly equals, or `null` if none does yet. */
  completed: string | null
}

/**
 * The reason-reaffirmation shim's one piece of new logic (LTY-WHY W3,
 * #1103): given a fixed list of candidate strings and everything typed so
 * far, says which candidates are still possible and whether one is done.
 * See `docs/leetype/README.md`'s LTY-WHY section for the shim this
 * function is the entire judgment budget of.
 *
 * Total and boring on purpose. Recomputed fresh from the whole `typed`
 * string on every call — no incremental state inside the function itself,
 * the caller's `typed` string *is* the state — which is also what makes
 * backspace free: deleting a character and recomputing is the same call
 * with a shorter string, not a separate undo path to get right the way the
 * engine's own `backspace()` has real history to unwind.
 *
 * Exact character equality only, the same posture the real engine holds
 * (`key != expected` in `crates/leetype_wasm/src/leetype/session.rs`'s
 * `press()`): no fuzzy matching, no case-insensitivity, no trimming. A
 * heuristic that quietly accepts near-misses is a judgment with no
 * justification — the exact thing this epic's decision record forecloses
 * for grading, and this function is not reopening it for matching.
 *
 * `candidates` is plain strings, not `RationaleChoice` (`types/exercise`):
 * this function has no notion of a step, a schema, or which candidate an
 * author marked `canonical` — a caller extracts `.text` before calling in.
 * Keeping the input this narrow is what keeps this file free of any
 * exercise or engine import at all, checked directly in
 * `rationale-match.test.ts`.
 *
 * A shared full prefix between two candidates (which the corpus lint,
 * `lib/leetype/exercises/corpus-lint.ts`, rejects at author time) makes
 * this function complete on the shorter candidate while the longer one is
 * still live and uneliminated — an ambiguous, silent completion. That is
 * the lint's whole reason to exist, not a hypothetical:
 * `rationale-match.test.ts` reproduces it directly by calling `narrow`
 * with a prefix pair the lint would reject.
 */
export function narrow(
  candidates: ReadonlyArray<string>,
  typed: string
): MatchState {
  const live = candidates.filter((candidate) => candidate.startsWith(typed))
  const completed = live.find((candidate) => candidate === typed) ?? null
  return { typed, live, completed }
}
