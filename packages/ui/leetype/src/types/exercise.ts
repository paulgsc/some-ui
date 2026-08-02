import { z } from "zod"

import type { Language } from "./leetype"

/**
 * The exercise format: what the renderer draws, and what the future
 * generator must emit.
 *
 * # Two contracts, one shape
 *
 * This file is both the *view* contract (#871 — the types every component in
 * the shell renders against) and the *authoring* contract (#884 — the schema
 * a hand-written seed set satisfies today and a generated corpus must
 * satisfy later). They were specified as two stories and they are one type,
 * because the moment they diverge the shim stops being a rehearsal for the
 * pipeline and becomes a second format to maintain.
 *
 * # What is deliberately not here
 *
 * The per-character maps the typing engine produces — `roles`,
 * `slotOfDisplay`, `slotStatus`, `visibility`, `cursorDisplay` — are
 * projections of the step *in flight*, not authored data. Keeping them out
 * is what lets an exercise be a plain serializable value: the shim can hand
 * one over, zod can validate it, and a future pipeline can emit one without
 * knowing the engine exists.
 *
 * Nothing here names a competency, a concept graph, a prerequisite edge or a
 * difficulty estimate beyond a bag of strings. That is not an omission —
 * `concepts` is where the future concept graph attaches, and pretending to
 * more structure now would be inventing the very judgment M20 defers.
 *
 * # Migrating from `Challenge` (#884, #866)
 *
 * `Challenge` was a whole problem plus a file path per language. `Exercise`
 * is a sequence of steps with inline sources. The mapping, recorded because
 * the old type is deleted and the correspondence is the only thing that
 * carries its reasoning forward:
 *
 * | `Challenge`                          | `Exercise`                          |
 * | ------------------------------------ | ----------------------------------- |
 * | `title`                              | `Exercise.title`                    |
 * | `description`                        | a `PromptBlock` on the first step    |
 * | `tags`                               | `Step.concepts`                     |
 * | `curriculum.insight`                 | `Step.goal` — same one-sentence bound |
 * | `curriculum.learningObjectives`      | `PromptBlock.lines`                 |
 * | `curriculum.conceptsIntroduced`      | `Step.concepts` on the step that introduces them |
 * | `curriculum.conceptsReinforced`      | `Step.concepts` on the step that reuses them |
 * | `curriculum.completionCriteria`      | **dropped** — the typing block *is* the criterion now; a step is finished when its proof is typed |
 * | `curriculum.step` / `totalSteps`     | position in `Exercise.steps`        |
 * | `curriculum.dependsOn`               | **dropped** — order is the linearization, and an edge nothing branches on is a claim without a consumer |
 * | `curriculum.stage`                   | **dropped** — a Bloom rung the new flow never renders |
 * | `curriculum.targetProblem`           | **dropped** — the exercise's own title says it |
 * | `codePaths`                          | `TypingBlock.source`, inline        |
 * | `difficulty`                         | **dropped** — difficulty is measured now, not declared |
 * | `levelRequired`                      | **dropped** — nothing is locked     |
 * | `mode`                               | **dropped** — nothing branched on it |
 *
 * The four dropped `curriculum` fields are the ones worth arguing about, so:
 * each was prose a surface displayed, every surface that displayed them is
 * gone, and none of them was ever read by code. Reinstating one is cheap
 * (a new prompt-side block kind) and should be driven by something wanting
 * to render it, not by the fact that it used to exist.
 */

/**
 * The longest a step's goal is allowed to be.
 *
 * The bound *is* the design, not a formatting preference. A step is a
 * minimal demonstration of one competency; if stating its goal takes more
 * than a sentence, the step was too broad and should have been split. This
 * is the same constraint the old `ChallengeCurriculum.insight` carried, kept
 * because it is the one authoring rule that reliably catches a bad step.
 */
export const GOAL_MAX_CHARS = 140

/**
 * A block the player reads rather than types.
 *
 * The union exists so that future kinds — a hint, compiler output, a
 * diagram, feedback on the last attempt — land on the prompt side without
 * the typing path growing a case. Adding one is a change to this union and
 * to `PromptPanel`; the renderer and the engine never hear about it.
 */
export const PromptBlockSchema = z.object({
  kind: z.literal("prompt"),
  /** Rendered as separate lines. One short paragraph, or a few bullets. */
  lines: z.array(z.string().min(1)).min(1),
})

/**
 * The block the player types. Exactly one per step.
 *
 * `source` is an inline string, never a path. A minimal proof is a few
 * lines: fetching a file per step, formatting it through Prettier and
 * windowing it at 150 lines is machinery for a problem this format does not
 * have.
 */
export const TypingBlockSchema = z.object({
  kind: z.literal("typing"),
  source: z.string().min(1),
  language: z.enum(["typescript", "rust", "cpp", "c"]),
})

export const BlockSchema = z.discriminatedUnion("kind", [
  PromptBlockSchema,
  TypingBlockSchema,
])

/**
 * Where a step was distilled from. Optional, and **inert**: nothing may
 * require it to render or play a step.
 *
 * Worth recording, because "this came from `pnpm`'s dependency resolver" is
 * interesting. Never load-bearing, because the whole claim of the design is
 * that after extraction the provenance is irrelevant — the competencies are
 * the subject, and the module that happened to demonstrate them is not.
 */
export const ProvenanceSchema = z.object({
  /** Human-readable origin: a repo, a paper, a problem name. */
  source: z.string().min(1),
  /** A path, URL or citation, when there is one. */
  locator: z.string().min(1).optional(),
})

/**
 * The atom of an exercise: *n* prompt-ish blocks plus exactly one typing
 * block.
 *
 * The cardinality is enforced by the schema rather than by convention
 * because it is the whole reason the sticky prompt panel stays trivially
 * correct. With two typing blocks on one card, "which prompt is sticky right
 * now" becomes a live question and the panel needs a scroll-spy — which is
 * the notebook layout the decision record rejected, arriving through the
 * back door.
 *
 * The cost, stated plainly: an exercise that genuinely wants two typing
 * blocks under one shared prompt repeats the prompt across two steps.
 */
export const StepSchema = z
  .object({
    id: z.string().min(1),
    /**
     * One sentence stating what the player is being asked to *achieve* —
     * "Insert a default value into a HashMap only if the key is absent", not
     * "type the following". A goal, not an instruction.
     */
    goal: z.string().min(1).max(GOAL_MAX_CHARS),
    blocks: z.array(BlockSchema).min(1),
    /**
     * Competency labels. A bag of strings nothing branches on: the honest
     * shape for the place a concept graph will eventually attach.
     */
    concepts: z.array(z.string().min(1)).default([]),
    provenance: ProvenanceSchema.optional(),
  })
  .refine(
    (step) =>
      step.blocks.filter((block) => block.kind === "typing").length === 1,
    {
      message:
        "A step must hold exactly one typing block. Two typing blocks on one card makes " +
        "'which prompt is sticky right now' a live question and drags a scroll-spy into the " +
        "prompt panel; zero gives the player nothing to type. Split the step instead — a " +
        "multi-part proof is a sequence of steps, not a taller card.",
      path: ["blocks"],
    }
  )

export const ExerciseSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  steps: z.array(StepSchema).min(1),
})

export const ExerciseCorpusSchema = z.array(ExerciseSchema).min(1)

export type PromptBlock = z.infer<typeof PromptBlockSchema>
export type TypingBlock = z.infer<typeof TypingBlockSchema>
export type Block = z.infer<typeof BlockSchema>
export type Provenance = z.infer<typeof ProvenanceSchema>
export type Step = z.infer<typeof StepSchema>
export type Exercise = z.infer<typeof ExerciseSchema>

/**
 * The step's typing block.
 *
 * Total, and deliberately so: the schema guarantees exactly one, but a
 * renderer must not be the thing that throws when a corpus turns out to have
 * slipped past validation. `undefined` is a blank viewport; an exception
 * during render is a blank screen.
 */
export function typingBlockOf(step: Step): TypingBlock | undefined {
  return step.blocks.find(
    (block): block is TypingBlock => block.kind === "typing"
  )
}

/** Everything in the step the player reads rather than types, in order. */
export function promptBlocksOf(step: Step): Array<PromptBlock> {
  return step.blocks.filter(
    (block): block is PromptBlock => block.kind === "prompt"
  )
}

/**
 * The language of the step's typing block, for the renderer's syntax
 * highlighting. Falls back to Rust — the language a decomposed curriculum is
 * authored in — rather than to nothing, so a malformed step still renders as
 * code.
 */
export function languageOf(step: Step): Language {
  return typingBlockOf(step)?.language ?? "rust"
}
