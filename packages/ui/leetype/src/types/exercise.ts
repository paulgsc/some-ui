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
 * The longest a prompt block's prose is allowed to run: this many lines,
 * this many characters each. Also the ceiling on a *step's* combined prompt
 * prose — see the `StepSchema` refinement below.
 *
 * The bound *is* the design, same posture as `GOAL_MAX_CHARS` just above.
 * A prompt block is a pointer at evidence, not the exposition that used to
 * carry the step: "a diagnostic step must remain actionable if the learner
 * reads only the failure label, the observed value and the highlighted
 * line." Two short lines is generous for that. A step whose prose keeps
 * overflowing this is not a step with a formatting problem — it is a step
 * that wanted a different kind of evidence block than plain prose, once one
 * exists.
 *
 * Applying the same number at both the block and the step level is
 * deliberate rather than an accident of reuse: a single over-budget block
 * and three on-budget blocks stacked sideways are the same failure — more
 * prose than the panel's pagination-free path was built to hold — so one
 * bound closes both doors instead of two independently-tunable ones drifting
 * apart.
 */
export const PROMPT_MAX_LINES = 2
export const PROMPT_LINE_MAX_CHARS = 120

const PROMPT_TOO_MANY_LINES_MESSAGE =
  `A prompt block holds more than ${PROMPT_MAX_LINES} lines. Split the step, ` +
  "or this is evidence rather than exposition and wants a different block kind."

const PROMPT_LINE_TOO_LONG_MESSAGE =
  `A prompt line runs past ${PROMPT_LINE_MAX_CHARS} characters. A prompt line ` +
  "is a pointer, not a paragraph — tighten the sentence, or split the step."

const STEP_PROMPT_BUDGET_MESSAGE =
  `A step's prompt blocks hold more than ${PROMPT_MAX_LINES} lines combined. ` +
  "Several on-budget blocks stacked sideways are still more prose than the panel's " +
  "pagination-free path was built to hold — split the step, or reach for a different " +
  "kind of evidence block."

const REGION_SPAN_MESSAGE =
  "A region's endDisplay reaches past the step's typing source. The rendered frame " +
  "can only be the same length or shorter (a context span's delimiters are stripped, " +
  "never added to), so a span past the raw source length is never valid."

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
  lines: z
    .array(
      z.string().min(1).max(PROMPT_LINE_MAX_CHARS, PROMPT_LINE_TOO_LONG_MESSAGE)
    )
    .min(1)
    .max(PROMPT_MAX_LINES, PROMPT_TOO_MANY_LINES_MESSAGE),
})

/**
 * A before/after pair — the discriminating evidence for a value, type,
 * state, complexity or control-flow change. Absorbs five of the seven
 * affordances the original design discussion enumerated: all five are
 * "this was X, it becomes Y" with only the formatting of X and Y differing,
 * which is a rendering concern and not a reason for five renderer cases.
 *
 * Data, not markup: a transition wanting a third state is two transitions,
 * or it is a `trace`.
 */
export const TransitionBlockSchema = z.object({
  kind: z.literal("transition"),
  /** What changed, e.g. "lookups". Optional — the pair can speak for itself. */
  label: z.string().min(1).optional(),
  before: z.string().min(1),
  after: z.string().min(1),
})

/** One labelled scalar observation inside a `trace` block. */
export const TraceObservationSchema = z.object({
  label: z.string().min(1),
  value: z.string().min(1),
})

/**
 * An ordered list of labelled scalar observations — `iterations: 10,000`,
 * `cursor: 0 → 0`. The failure signal for the diagnostic family: what a run
 * actually produced, in the order that explains it.
 */
export const TraceBlockSchema = z.object({
  kind: z.literal("trace"),
  /** The failure class or headline, e.g. `TIMEOUT`. Optional — a trace can be pure observation. */
  headline: z.string().min(1).optional(),
  observations: z.array(TraceObservationSchema).min(1),
})

/**
 * A span annotation over the step's typing block: a highlighted locus, a
 * finalized prefix, an unresolved interval. `label` is what the player
 * reads. `startDisplay`/`endDisplay` are the span, in the same
 * display-index coordinate system as `roles`/`slotOfDisplay` (see
 * `types/leetype.ts`) — carried now so a future renderer can draw the span
 * against the frame, not required to for this epic: `CodeDisplay`'s props
 * are unchanged (LTY-EVIDENCE E4), so today `label` alone is what
 * `PromptPanel` shows, the same "worth recording, never load-bearing"
 * posture `ProvenanceSchema` already takes below.
 */
export const RegionBlockSchema = z
  .object({
    kind: z.literal("region"),
    label: z.string().min(1),
    startDisplay: z.number().int().nonnegative(),
    endDisplay: z.number().int().positive(),
  })
  .refine((region) => region.endDisplay > region.startDisplay, {
    message:
      "A region's end must come after its start — an empty span highlights nothing.",
    path: ["endDisplay"],
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

/**
 * The three evidence kinds, closed. If a fourth turns out to be genuinely
 * necessary, that is a change to this union argued on its own merits — not
 * an instance that was easier to author as a fourth kind.
 */
export const EvidenceBlockSchema = z.discriminatedUnion("kind", [
  TransitionBlockSchema,
  TraceBlockSchema,
  RegionBlockSchema,
])

export const BlockSchema = z.discriminatedUnion("kind", [
  PromptBlockSchema,
  TransitionBlockSchema,
  TraceBlockSchema,
  RegionBlockSchema,
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
  .refine(
    (step) => {
      // Each `prompt` block is bounded on its own (`PromptBlockSchema`), but
      // nothing stopped a step from holding several on-budget blocks that
      // are still, combined, more prose than the panel's pagination-free
      // path was built to hold. This closes that gap at the step level.
      const promptLineCount = step.blocks
        .filter(
          (block): block is z.infer<typeof PromptBlockSchema> =>
            block.kind === "prompt"
        )
        .reduce((total, block) => total + block.lines.length, 0)
      return promptLineCount <= PROMPT_MAX_LINES
    },
    {
      message: STEP_PROMPT_BUDGET_MESSAGE,
      path: ["blocks"],
    }
  )
  .refine(
    (step) => {
      // A conservative bound, not an exact one: `startDisplay`/`endDisplay`
      // index the engine's *rendered* text (`Layout.displaySource`), which
      // this schema cannot compute — doing so would mean importing the wasm
      // engine into a file whose entire point is staying a plain,
      // engine-free serializable value (see the file's own doc comment).
      // What is knowable without the engine: a context span's `‹…›`
      // delimiters are only ever stripped, never added to, so the rendered
      // length can never exceed the raw authored source length. A region
      // reaching past *that* is unambiguously wrong regardless of what the
      // engine does with context spans.
      const typing = step.blocks.find(
        (block): block is z.infer<typeof TypingBlockSchema> =>
          block.kind === "typing"
      )
      if (!typing) return true // the "exactly one typing block" refine already reports this
      const regions = step.blocks.filter(
        (block): block is z.infer<typeof RegionBlockSchema> =>
          block.kind === "region"
      )
      return regions.every(
        (region) => region.endDisplay <= typing.source.length
      )
    },
    {
      message: REGION_SPAN_MESSAGE,
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
export type TransitionBlock = z.infer<typeof TransitionBlockSchema>
export type TraceObservation = z.infer<typeof TraceObservationSchema>
export type TraceBlock = z.infer<typeof TraceBlockSchema>
export type RegionBlock = z.infer<typeof RegionBlockSchema>
export type EvidenceBlock = z.infer<typeof EvidenceBlockSchema>
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

/**
 * Everything in the step the player reads rather than types, in order.
 *
 * Still scoped to `prompt` blocks: `PromptPanel` does not yet render
 * `transition`/`trace`/`region` (LTY-EVIDENCE E3), and widening this to
 * include them ahead of that would hand the panel evidence its current
 * `blocks.flatMap((block) => block.lines)` cannot express — a silent drop
 * dressed up as support. E3 widens both together.
 */
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
