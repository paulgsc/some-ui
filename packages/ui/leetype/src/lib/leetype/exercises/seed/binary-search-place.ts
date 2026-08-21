import { CONCEPT_IDS } from "@leetype/lib/leetype/exercises/concepts"
import type { ConstructionStep, Exercise } from "@leetype/types/exercise"

/**
 * LTY-SEED G4 (#1109): the epic's first worked generation run, construction
 * half. Generated against `leetype-exercise-generator/index.md` v1.0 with
 * `Concept: lookup-as-place`, `Invariant violated: a sorted search's own
 * failure branch already encodes where an absent element belongs, so
 * recovering that index should never need a second scan`.
 * `transferFrom: entry-03-place` — the same abstraction `entryApi` names
 * for a `HashMap` entry (a lookup returning a place to act on, not a value)
 * transferred to a sorted `Vec` and a completely different standard-library
 * type (`Result<usize, usize>` rather than `Entry`).
 *
 * Review caught one real thing worth recording (see
 * `docs/leetype/leetype-exercise-generator-log.md`): the first draft's
 * `obligation`/`transition` prose implied the naive and binary-search forms
 * agree for every input, which is false when the array holds duplicates of
 * the target (`binary_search` may then return `Ok` for any one of several
 * equally-valid matches, while the naive form always finds the first index
 * strictly greater). The code was never wrong — `unwrap_or_else` handles
 * both arms correctly — only the prose overclaimed. Scoped below to the
 * case the exercise is actually about: the target is *absent*, which is
 * exactly when an insertion is happening and exactly when `binary_search`
 * is guaranteed to return `Err`.
 */
const constructionBinarySearchPlaceStep: ConstructionStep = {
  id: "construction-binary-search-place-01",
  goal: "Use a failed binary search's own answer as the sorted insertion point.",
  concepts: [CONCEPT_IDS.lookupAsPlace],
  transferFrom: "entry-03-place",
  obligation:
    "when a sorted search fails to find an absent target, its own Err arm already is the index to insert at — recovering that index should not need a second, separate scan",
  blocks: [
    {
      kind: "transition",
      label: "insertion index, target absent",
      before: "a full O(n) scan to find where the new value belongs",
      after: "already returned by binary_search's Err(i)",
    },
    {
      kind: "typing",
      source:
        "‹let insert_at = arr.iter().position(|&x| x > target).unwrap_or(arr.len());\n›let insert_at = arr.binary_search(&target).unwrap_or_else(|i| i);",
      language: "rust",
      patch: {
        path: "src/search/sorted_insert.rs",
        oldStart: 1,
        newStart: 1,
        lineKinds: ["del", "add"],
      },
    },
  ],
}

export const constructionBinarySearchPlace: Exercise = {
  id: "construction-binary-search-place",
  title: "Construction: binary search insertion place",
  steps: [constructionBinarySearchPlaceStep],
}
