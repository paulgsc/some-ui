import type { Exercise } from "@leetype/types/exercise"

/**
 * Which step probes a given concept id (LTY-SEED G2, #1107) — derived from
 * `Step.concepts` across the corpus, not hand-maintained. A hand-maintained
 * map drifts the moment a step's `concepts` array changes and nobody
 * remembers to update the map beside it (the same failure mode
 * `../concepts.ts`'s own doc comment names for scattered string literals).
 *
 * Answers this directory's organizing question — "what already probes
 * concept C, and what transfers to it" — without reading every module in
 * it. `transferFrom` (`../concepts.ts`, LTY-SEAM S3) already answers the
 * second half for declared pairs; this answers the first half for every
 * step, declared pair or not.
 *
 * Flat and derived only, same posture as `CONCEPT_IDS` itself: this is not
 * the concept graph, carries no edges between concepts, and makes no claim
 * to completeness — only over what the corpus actually uses today.
 */
export type ConceptProbe = {
  exerciseId: string
  stepId: string
}

export function conceptIndex(
  exercises: ReadonlyArray<Exercise>
): ReadonlyMap<string, ReadonlyArray<ConceptProbe>> {
  const index = new Map<string, Array<ConceptProbe>>()
  for (const exercise of exercises) {
    for (const step of exercise.steps) {
      for (const concept of step.concepts) {
        const probes = index.get(concept)
        const probe: ConceptProbe = { exerciseId: exercise.id, stepId: step.id }
        if (probes === undefined) {
          index.set(concept, [probe])
        } else {
          probes.push(probe)
        }
      }
    }
  }
  return index
}
