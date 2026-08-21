import type { Exercise } from "@leetype/types/exercise"

import { diagnosticDivisionGuard } from "./division-guard"
import { entryApi } from "./entry-api"
import { adversarial, HOSTILE_PROMPT_STEP } from "./fixtures"
import { diagnosticInclusiveBoundary } from "./inclusive-boundary"
import { constructionLazyDefault } from "./lazy-default"
import { diagnosticLoopProgress } from "./loop-progress"
import { diagnosticShrinkingInterval } from "./shrinking-interval"

/**
 * Hand-authored exercises. The whole corpus, for now — per-concept modules
 * composed into one array, in place of the 550-line monolith this directory
 * used to be (LTY-SEED G2, #1107). Every exported name below is unchanged
 * in shape and value from that monolith: this is a file-organization
 * change, not an API change, and nothing outside this directory learns the
 * layout moved.
 *
 * The interesting research problem — infer the minimal competencies
 * required to have written a piece of software, then synthesize the
 * smallest observable proof of each — is explicitly deferred out of M20
 * (see `docs/leetype/README.md`). The mechanical half has to be playable
 * before there is anything to judge the judgment against, and it can be
 * made playable against exercises somebody wrote down — a person, today; a
 * reviewed generator, from LTY-SEED G3 onward (`packages/some-content/
 * prompts/leetype-exercise-generator/index.md`), the review step doing the
 * same job either way.
 *
 * One module per exercise (or per tightly-related pair, as `entry-api.ts`
 * is for the Entry API chain and its diagnostic tail), named for the
 * concept or failure class it probes, so "what already probes concept C" is
 * answerable by filename for the common case and by `./concept-index.ts`
 * exactly, for every case. `fixtures.ts` is the one module deliberately not
 * named after a concept: it holds shell-stress data a generator must never
 * mistake for corpus.
 *
 * Nothing outside `../index.ts` (the shim) may import from this directory.
 * See that module for why: the seed data stays private so that replacing
 * it later is a body swap in one place, not a format re-argued at every
 * call site that reached in directly.
 */
export const SEED_EXERCISES: ReadonlyArray<Exercise> = [
  entryApi,
  diagnosticLoopProgress,
  diagnosticInclusiveBoundary,
  diagnosticShrinkingInterval,
  diagnosticDivisionGuard,
  constructionLazyDefault,
  adversarial,
]

/** The one that reads like a real curriculum, for stories and tests. */
export const SEED_EXERCISE_ID = entryApi.id

/** The one that is deliberately hostile, for stories and tests. */
export const ADVERSARIAL_EXERCISE_ID = adversarial.id

/**
 * The three diagnostic instances still freestanding (LTY-FAMILIES A3), for
 * stories and tests. Two more — the double-lookup and eager-vs-lazy
 * instances — exist as steps but not as exercises: LTY-FAMILIES A4 folded
 * them into `entryApi`'s tail (see `entry-09-diagnostic-double-lookup` and
 * `entry-10-diagnostic-eager-lazy-default` in `./entry-api.ts`).
 *
 * `diagnosticDivisionGuard` (LTY-PATCH P4, #1079) is deliberately not
 * listed here: `../index.test.ts` pins this list at exactly the three
 * original A3 failure classes, single-line repairs included — a pin worth
 * keeping literally true rather than widened to fit a newer instance that
 * was never one of those three classes. It is still in `SEED_EXERCISES`
 * and reachable by id through `nextExercise`; it is only absent from *this*
 * enumeration.
 */
export const DIAGNOSTIC_EXERCISE_IDS = [
  diagnosticLoopProgress.id,
  diagnosticInclusiveBoundary.id,
  diagnosticShrinkingInterval.id,
] as const

export { HOSTILE_PROMPT_STEP }
