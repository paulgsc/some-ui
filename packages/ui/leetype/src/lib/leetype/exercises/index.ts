import type { Exercise, Step } from "@leetype/types/exercise"
import { ExerciseCorpusSchema } from "@leetype/types/exercise"

import {
  ADVERSARIAL_EXERCISE_ID,
  DIAGNOSTIC_EXERCISE_IDS,
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
 * Everything the future selector will need and this one ignores, plus the
 * one field it does read.
 *
 * The eventual pipeline picks the next probe by expected information gain
 * over a learner model. This shim reads only `preferId`. `completed` is
 * taken *now* — and ignored — so that the replacement is a body swap;
 * omitting it would make the replacement a signature change through every
 * caller.
 *
 * **Ignoring `completed` is the current implementation, not the contract.**
 *
 * `preferId` is required rather than optional: an implicit "no preference"
 * default used to silently resolve to the first corpus exercise
 * (`entryApi`), which is exactly the deterministic-first-item behavior this
 * shim's own callers (the session scheduler, deep links) exist to replace.
 * A caller that wants a specific fixture — a story, a test — names it; a
 * caller that wants "whatever the corpus offers next" asks the scheduler
 * (`./scheduling`), not this shim.
 */
export type SelectionState = {
  /** Exercises the player has already finished, most recent last. */
  completed?: ReadonlyArray<string>
  /** The exercise to hand back — stories, tests, deep links, and the session scheduler's own choice. */
  preferId: string
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
 * The exercise `preferId` names.
 *
 * Synchronous and boring on purpose: no network, no cache, no promise. The
 * whole point of the quarantine is that the interesting part is somewhere
 * else, and a shim that had to be awaited would have already started
 * pretending otherwise.
 *
 * Throws on an id nothing in the corpus matches, rather than silently
 * substituting a default exercise: the corpus already fails loudly at
 * module load if it does not validate (see `CORPUS` above), and a selection
 * seam that quietly served the wrong exercise for a stale deep link or a
 * typo'd fixture id would be the same "fail here, not three components
 * later" argument going unapplied at the one seam that actually takes a
 * caller-supplied id.
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
 * A step over `PromptBlockSchema`'s prose budget, for stories and tests
 * that need to prove the panel's pagination path still works as a
 * defensive floor. Never handed out by `nextExercise` and never validated
 * against `StepSchema` — see `./seed.ts` for why.
 */
export const FIXTURE_HOSTILE_PROMPT_STEP: Step = HOSTILE_PROMPT_STEP

/**
 * Every exercise in the validated corpus — for lints that need to check a
 * property across *all* of it, which `nextExercise` cannot express: it only
 * ever returns the one exercise its `preferId` names, so a
 * lint built out of individual `nextExercise` calls silently stops covering
 * the corpus the moment a new exercise is added and nothing calls for it by
 * id. Not a runtime selection API — a host asking what the player should
 * see next always goes through `nextExercise`, this export included.
 */
export const ALL_FIXTURE_EXERCISES: ReadonlyArray<Exercise> = CORPUS

/** The validated exercises eligible for a normal, user-facing session. */
export const SESSION_EXERCISE_IDS: ReadonlyArray<string> = CORPUS.filter(
  (exercise) => exercise.id !== ADVERSARIAL_EXERCISE_ID
).map((exercise) => exercise.id)

/**
 * Every step of every session-eligible exercise, flattened.
 *
 * The reading surface's distractor pool (LTY-MOBILE,
 * `lib/leetype/reading-probe`): a mobile card asks the player to pick the
 * claim this step makes out of claims the corpus makes about *other* steps,
 * so it needs the corpus as a whole rather than the one exercise in flight.
 *
 * Exported from the shim rather than reached for in `./seed` directly, for
 * the reason this module's own doc comment gives: the seed data stays private
 * so replacing it later is a body swap in one place. It is derived from the
 * same `SESSION_EXERCISE_IDS` filter, so the adversarial fixture's
 * deliberately hostile prose can never turn up as a distractor on a real
 * card.
 *
 * Not a selection API: a host asking what the player should see next still
 * goes through `nextExercise`.
 */
export const SESSION_STEPS: ReadonlyArray<Step> = CORPUS.filter(
  (exercise) => exercise.id !== ADVERSARIAL_EXERCISE_ID
).flatMap((exercise) => exercise.steps)
