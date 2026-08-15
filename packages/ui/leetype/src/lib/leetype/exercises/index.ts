import type { Exercise, Step } from "@leetype/types/exercise"
import { ExerciseCorpusSchema } from "@leetype/types/exercise"

import {
  ADVERSARIAL_EXERCISE_ID,
  HOSTILE_PROMPT_STEP,
  SEED_EXERCISE_ID,
  SEED_EXERCISES,
} from "./seed"

/**
 * Where exercises come from — a deliberately dumb shim.
 *
 * # What this is standing in for
 *
 * ```text
 * source → AST → concept extraction → evidence graph → difficulty estimation
 *        → minimal competency decomposition → forcing-question wording → steps
 * ```
 *
 * Every arrow left of the last one is deferred out of M20. This module
 * occupies the last arrow only: it hands back steps. The steps happen to
 * have been written by a person rather than derived, and that is the entire
 * difference between this file and the eventual pipeline.
 *
 * **The acceptance test for the real pipeline is therefore narrow: it emits
 * what this emits.** Not "a superset", not "something similar" — the same
 * `Exercise` value shape, validated by the same schema, through this same
 * function. If the pipeline wants a different shape, that is a change to
 * `types/exercise.ts` argued on its own merits, not something the generator
 * gets to decide on its way past.
 *
 * The rule the pipeline inherits, and the reason the *shape* matters more
 * than the contents: **no judgment is allowed unless it can produce its own
 * justification.** "This module demonstrates ownership" → show the spans.
 * "This concept depends on borrowing" → show the edge. A decision that
 * cannot explain itself is a bug or an open research problem, not acceptable
 * model behaviour. `provenance` and `concepts` are where that justification
 * will attach; they are optional and inert today because inventing structure
 * for a judgment nobody has made yet is worse than leaving room for it.
 *
 * # Why exactly one export
 *
 * The shim is allowed to be a hard-coded array. What it is not allowed to be
 * is *diffuse*: if three call sites reach into the seed set directly,
 * replacing it later means touching three places and re-arguing the format
 * at each. So the seed data is private to this directory and nothing but
 * this module imports it.
 */

/**
 * Everything the future selector will need and this one ignores.
 *
 * The eventual pipeline picks the next probe by expected information gain
 * over a learner model. This shim picks the only exercise it has. Taking the
 * argument *now* — and ignoring it — makes the replacement a body swap;
 * omitting it would make the replacement a signature change through every
 * caller.
 *
 * **Ignoring it is the current implementation, not the contract.**
 */
export type SelectionState = {
  /** Exercises the player has already finished, most recent last. */
  completed?: ReadonlyArray<string>
  /** Force a particular exercise — stories, tests, and a future deep link. */
  preferId?: string
}

/**
 * The seed set, validated at module load.
 *
 * The shim is held to the same standard as a host-supplied corpus because
 * that is what it is pretending to be: if a hand-authored step drifts out of
 * the schema, it should fail here, loudly, at the seam, and not three
 * components later as an undefined typing block.
 */
const CORPUS: ReadonlyArray<Exercise> =
  ExerciseCorpusSchema.parse(SEED_EXERCISES)

/**
 * The next exercise to play.
 *
 * Synchronous and boring on purpose: no network, no cache, no promise. The
 * whole point of the quarantine is that the interesting part is somewhere
 * else, and a shim that had to be awaited would have already started
 * pretending otherwise.
 */
export function nextExercise(state?: SelectionState): Exercise {
  const preferred =
    state?.preferId === undefined
      ? undefined
      : CORPUS.find((exercise) => exercise.id === state.preferId)

  // `CORPUS` is non-empty by schema (`ExerciseCorpusSchema` requires at least
  // one), so the fallback is a type-level necessity rather than a runtime
  // possibility.
  const first = CORPUS[0]
  if (first === undefined) {
    throw new Error("The exercise corpus is empty, which the schema forbids.")
  }

  return preferred ?? first
}

/**
 * Fixtures for stories and tests. One fixture set, not one per consumer —
 * these are ids into the same corpus `nextExercise` serves, so a story
 * mounts what a player would actually see.
 */
export const FIXTURE_EXERCISE_ID = SEED_EXERCISE_ID
export const FIXTURE_ADVERSARIAL_EXERCISE_ID = ADVERSARIAL_EXERCISE_ID

/**
 * A step over `PromptBlockSchema`'s prose budget, for stories and tests
 * that need to prove the panel's pagination path still works as a
 * defensive floor. Never handed out by `nextExercise` and never validated
 * against `StepSchema` — see `./seed.ts` for why.
 */
export const FIXTURE_HOSTILE_PROMPT_STEP: Step = HOSTILE_PROMPT_STEP
