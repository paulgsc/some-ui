import type { Exercise, Step } from "@leetype/types/exercise"
import { ExerciseCorpusSchema } from "@leetype/types/exercise"

import {
  ADVERSARIAL_EXERCISE_ID,
  DIAGNOSTIC_EXERCISE_IDS,
  HOSTILE_PROMPT_STEP,
  LEETCODE_3302_EXERCISE_ID,
  SEED_EXERCISE_ID,
  SEED_EXERCISES,
} from "./seed"

/**
 * Where exercises come from: a deliberately dumb shim.
 *
 * ```text
 * source → AST → concept extraction → evidence graph → difficulty estimation
 *        → minimal competency decomposition → forcing-question wording → steps
 * ```
 *
 * This module occupies the last arrow only: it hands back steps, written by
 * a person rather than derived. **The acceptance test for a real pipeline is
 * that it emits what this emits**: the same `Exercise` shape, validated by
 * the same schema, through this function. A different shape is a change to
 * `types/exercise.ts` argued on its merits.
 *
 * The rule the pipeline inherits: **no judgment is allowed unless it can
 * produce its own justification** ("depends on borrowing" → show the edge).
 * `provenance` and `concepts` are where justification will attach.
 *
 * The seed data is private to this directory and only this module imports
 * it, so replacing it is a change in one place.
 */

/**
 * Everything a future selector will need, plus the one field this shim reads
 * (`preferId`). `completed` is accepted and ignored so replacing the body
 * needs no signature change; ignoring it is the implementation, not the
 * contract.
 *
 * `preferId` is required: a caller wanting a specific fixture names it, and
 * one wanting the learner's choice asks `ExercisePicker`.
 */
export type SelectionState = {
  /** Exercises the player has already finished, most recent last. */
  completed?: ReadonlyArray<string>
  /** The exercise to hand back — stories, tests, deep links, and the picker's own choice. */
  preferId: string
}

/**
 * The seed set, validated at module load like a host-supplied corpus, so a
 * drifting step fails here rather than later as an undefined typing block.
 */
const CORPUS: ReadonlyArray<Exercise> =
  ExerciseCorpusSchema.parse(SEED_EXERCISES)

/**
 * The exercise `preferId` names. Synchronous on purpose: no network, cache
 * or promise. Throws on an unknown id rather than substituting a default, so
 * a stale deep link or typo fails at the seam.
 */
export function nextExercise(state: SelectionState): Exercise {
  const exercise = CORPUS.find((candidate) => candidate.id === state.preferId)
  if (exercise === undefined) {
    throw new Error(
      `nextExercise: "${state.preferId}" is not an id in the validated corpus.`
    )
  }
  return exercise
}

/**
 * Fixtures for stories and tests. One fixture set, not one per consumer —
 * these are ids into the same corpus `nextExercise` serves, so a story
 * mounts what a player would actually see.
 */
export const FIXTURE_EXERCISE_ID = SEED_EXERCISE_ID
export const FIXTURE_ADVERSARIAL_EXERCISE_ID = ADVERSARIAL_EXERCISE_ID

/** The five diagnostic instances (LTY-FAMILIES A3), for stories and tests. */
export const FIXTURE_DIAGNOSTIC_EXERCISE_IDS = DIAGNOSTIC_EXERCISE_IDS

/**
 * A step over the prose budget, for proving the panel's pagination fallback.
 * Never served by `nextExercise` or validated (see `./seed.ts`).
 */
export const FIXTURE_HOSTILE_PROMPT_STEP: Step = HOSTILE_PROMPT_STEP

/** The 24-rung engineering-judgment curriculum for LeetCode 3302, for stories and tests. */
export const FIXTURE_LEETCODE_3302_EXERCISE_ID = LEETCODE_3302_EXERCISE_ID

/**
 * Every exercise in the validated corpus, for lints over *all* of it (a lint
 * built from `nextExercise` calls would miss new exercises). Not a runtime
 * selection API.
 */
export const ALL_FIXTURE_EXERCISES: ReadonlyArray<Exercise> = CORPUS

/**
 * The exercises eligible for a user-facing session: every seed exercise but
 * the adversarial fixture. `ExercisePicker` renders them as tiles.
 */
export const SESSION_EXERCISE_IDS: ReadonlyArray<string> = CORPUS.filter(
  (exercise) => exercise.id !== ADVERSARIAL_EXERCISE_ID
).map((exercise) => exercise.id)
