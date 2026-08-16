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
 * Why a diagnostic step's repair is the correct one — authoring/audit
 * evidence for `DiagnosticStepSchema`'s judgement-only constraints (see its
 * doc comment), inert during play like `concepts` and `provenance` above:
 * nothing renders it, nothing branches on it. Checked mechanically, not for
 * quality, by the corpus lint (LTY-FAMILIES A5).
 */
export const RationaleSchema = z.object({
  /** The one principal causal defect the failure signal points at. */
  cause: z.string().min(1),
  /** Why *this* repair, not a shorter one that would only silence the symptom. */
  whyRepairDiscriminates: z.string().min(1),
})

/**
 * The longest a diagnostic step's repair — the *typed* portion of its
 * typing block, i.e. `typedPortionOf(source)` below, not `source.length` —
 * is allowed to run: constraint 4's "seconds to copy once revealed, not a
 * minute," made a number. The frame around the repair (context, per
 * LTY-FRAME) is unbounded by this constant on purpose; only what the player
 * actually types is. One line, the same posture as `PROMPT_LINE_MAX_CHARS`:
 * a repair that needs a second line was too broad for the family and wanted
 * two steps.
 *
 * 50 rather than a round "looks generous" figure: the five hand-authored
 * instances span 11–41 typed characters (`right -= 1;` to
 * `map.entry(key).or_default().push(value);`), so this is headroom above
 * the corpus's own actual ceiling, not a number picked in the abstract.
 */
export const DIAGNOSTIC_REPAIR_MAX_CHARS = 50

const DIAGNOSTIC_REPAIR_TOO_LONG_MESSAGE =
  `A diagnostic step's repair runs past ${DIAGNOSTIC_REPAIR_MAX_CHARS} typed characters ` +
  "or spans more than one line. The repair is meant to be copied in seconds once " +
  "revealed, not authored as a second exercise — narrow the fault, or this wants " +
  "to be two diagnostic instances."

const DIAGNOSTIC_MISSING_TRACE_MESSAGE =
  "A diagnostic step must carry a trace block — the visible falsified expectation " +
  "the repair falsifies. Without one there is no failure for the player to diagnose, " +
  "only a blank to fill in — constraint 5's deterministic signal has nothing to attach to."

const CONSTRUCTION_MISSING_EVIDENCE_MESSAGE =
  "A construction step must carry at least one block besides its witness — a " +
  "visible constraint or consequence. obligation is authoring metadata and is never " +
  "rendered; without a constraint or consequence the player can actually see, the " +
  "step shows nothing but a blank to fill in."

/**
 * The three shape invariants every step variant shares, factored out to
 * predicate functions rather than duplicated `.refine()` bodies: both
 * `StepSchema` and `DiagnosticStepSchema` below apply all three, and a
 * family-specific schema extending the object shape (`DiagnosticStepSchema`
 * today, `ConstructionStepSchema` to follow) needs its own `.refine()` calls
 * anyway, since zod has no "inherit the refinements of the schema I
 * `.extend()`ed" operation. Sharing the predicates is what keeps the actual
 * logic — and its one authoritative message — in one place.
 */
type BlocksHolder = { blocks: Array<Block> }

function hasExactlyOneTypingBlock(step: BlocksHolder): boolean {
  return step.blocks.filter((block) => block.kind === "typing").length === 1
}

const ONE_TYPING_BLOCK_MESSAGE =
  "A step must hold exactly one typing block. Two typing blocks on one card makes " +
  "'which prompt is sticky right now' a live question and drags a scroll-spy into the " +
  "prompt panel; zero gives the player nothing to type. Split the step instead — a " +
  "multi-part proof is a sequence of steps, not a taller card."

function isWithinStepPromptBudget(step: BlocksHolder): boolean {
  // Each `prompt` block is bounded on its own (`PromptBlockSchema`), but
  // nothing stopped a step from holding several on-budget blocks that are
  // still, combined, more prose than the panel's pagination-free path was
  // built to hold. This closes that gap at the step level.
  const promptLineCount = step.blocks
    .filter(
      (block): block is z.infer<typeof PromptBlockSchema> =>
        block.kind === "prompt"
    )
    .reduce((total, block) => total + block.lines.length, 0)
  return promptLineCount <= PROMPT_MAX_LINES
}

function regionsFitTypingSource(step: BlocksHolder): boolean {
  // A conservative bound, not an exact one: `startDisplay`/`endDisplay`
  // index the engine's *rendered* text (`Layout.displaySource`), which this
  // schema cannot compute — doing so would mean importing the wasm engine
  // into a file whose entire point is staying a plain, engine-free
  // serializable value (see the file's own doc comment). What is knowable
  // without the engine: a context span's `‹…›` delimiters are only ever
  // stripped, never added to, so the rendered length can never exceed the
  // raw authored source length. A region reaching past *that* is
  // unambiguously wrong regardless of what the engine does with context
  // spans.
  const typing = step.blocks.find(
    (block): block is z.infer<typeof TypingBlockSchema> =>
      block.kind === "typing"
  )
  if (!typing) return true // the "exactly one typing block" refine already reports this
  const regions = step.blocks.filter(
    (block): block is z.infer<typeof RegionBlockSchema> =>
      block.kind === "region"
  )
  return regions.every((region) => region.endDisplay <= typing.source.length)
}

/**
 * The typed portion of an authored typing-block source: everything outside
 * a `‹…›` context span. A budget check has to measure this, not
 * `source.length` — a diagnostic step's frame legitimately spans several
 * lines of context around a short repair, and counting the frame would
 * reject exactly the shape the family is built on.
 *
 * An approximation of the engine's own `typed_stream` (`program.rs`), not a
 * port of it — same posture as `regionsFitTypingSource` above, and for the
 * same reason: importing the wasm engine here would compromise this file's
 * one job (staying a plain, engine-free serializable value). It does not
 * special-case an unterminated `‹` with no matching `›` (the engine treats
 * everything after it as context; this leaves it counted as typed) —
 * malformed enough that an author will notice from the schema's own
 * "exactly one typing block" and length failures before this gap matters.
 */
function typedPortionOf(source: string): string {
  return source.replace(/‹[^›]*›/g, "")
}

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
const StepObjectSchema = z.object({
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
  /**
   * Falsification→repair family (LTY-FAMILIES A1): the authoring
   * justification for a diagnostic step's repair. Optional here — and
   * declared here, rather than only on `DiagnosticStepObjectSchema` below —
   * so that parsing a diagnostic step through the *generic* `StepSchema`
   * (which is what `ExerciseSchema`/`ExerciseCorpusSchema` actually use,
   * including the `ExerciseCorpusSchema.parse` the shim runs at module
   * load) preserves the field instead of silently stripping it as an
   * unrecognized key. `DiagnosticStepSchema` overrides this to required.
   */
  rationale: RationaleSchema.optional(),
  /**
   * Obligation→witness family (LTY-FAMILIES A2): the next concept-bearing
   * decision a construction step's witness discharges. Optional here for
   * the same reason `rationale` is: declaring it on the generic object
   * shape, rather than only on `ConstructionStepObjectSchema`, is what lets
   * it survive the *generic* `ExerciseCorpusSchema.parse` the shim runs at
   * module load instead of being silently stripped as an unrecognized key.
   * `ConstructionStepSchema` overrides this to required.
   *
   * Authoring metadata, like `rationale` — **never rendered to the
   * learner**. The temptation to display it is exactly the description
   * card this whole shift retired, returning through a new field.
   */
  obligation: z.string().min(1).optional(),
  /**
   * The id of the step whose obligation this one transfers (LTY-SEAM S3,
   * #1017) — the corpus's declaration that this step probes recognition of
   * the same abstraction a different step introduced, in a new context.
   * Alongside `concepts` and in the same register `provenance` already
   * holds: worth recording, because the pairing is a judgement made once,
   * at authoring time, and expensive to reconstruct later; never
   * load-bearing, because nothing in the runtime path reads it (see
   * `exercise.test.ts`'s "keeps transferFrom optional and never needs it
   * to render", the same pin `provenance` gets).
   *
   * Checked only by the corpus lint (`corpus-lint.ts`), and only
   * mechanically: the referenced id must exist in the corpus and must
   * share at least one `concepts` entry with this step. The lint does not,
   * and cannot, judge whether a transfer is a *good* one — that judgement
   * is the author's, argued nowhere but in the choice of pairing itself.
   */
  transferFrom: z.string().min(1).optional(),
})

export const StepSchema = StepObjectSchema.refine(hasExactlyOneTypingBlock, {
  message: ONE_TYPING_BLOCK_MESSAGE,
  path: ["blocks"],
})
  .refine(isWithinStepPromptBudget, {
    message: STEP_PROMPT_BUDGET_MESSAGE,
    path: ["blocks"],
  })
  .refine(regionsFitTypingSource, {
    message: REGION_SPAN_MESSAGE,
    path: ["blocks"],
  })

/**
 * A step in the falsification→repair family: a visible attempted witness
 * (the frame — typically the buggy code, carried as `‹context›` inside the
 * typing block's source; see LTY-FRAME's `ROLE_CONTEXT`), a visible
 * falsified expectation (a `trace` block, LTY-EVIDENCE E2), and the
 * adaptively revealed Rust delta that repairs it (the step's one typing
 * block). The player never produces an unbounded natural-language
 * diagnosis — the bounded repair string simultaneously is the answer, the
 * explanation, the interaction and the evidence.
 *
 * Extends `StepObjectSchema` (`rationale` required, rather than the
 * optional field `StepSchema` carries) and reapplies the same three shape
 * invariants, rather than composing `StepSchema` itself: zod has no
 * "inherit the refinements of the schema I `.extend()`ed" operation, and a
 * `.refine()`'s type-predicate does not narrow a `ZodEffects`' inferred
 * output in this zod version, so building on `StepSchema` directly would
 * leave `DiagnosticStep.rationale` typed as optional despite being
 * runtime-required. A consumer that had already checked
 * `DiagnosticStepSchema.safeParse(...).success` would still need a redundant
 * `undefined` check to use `rationale` — exactly the gap requiring it in the
 * object shape closes. The instance still validates through
 * `ExerciseCorpusSchema` (which parses via `StepSchema`, and `rationale` is
 * a strict superset of what that expects) and plays through the existing
 * runner exactly like any other step, because `rationale` is inert
 * everywhere except here and in the corpus lint. This schema adds no field
 * naming difficulty, severity or a diagnostic-specific threshold — those
 * are exactly the fields the epic forbids this family from reinventing.
 *
 * # The six validity constraints, and where each is enforced
 *
 * 1. **One failure.** One principal causal defect. Judgement — argued in
 *    `rationale.cause`, not independently checkable from the shape alone.
 * 2. **One discriminating repair.** The repair distinguishes the intended
 *    misconception rather than merely silencing the symptom. Judgement —
 *    argued in `rationale.whyRepairDiscriminates`.
 * 3. **Minimal causal surface.** The frame omits everything unrelated to
 *    the fault. Judgement — there is no shape-level signal for "everything
 *    in this context span is relevant."
 * 4. **Bounded answer.** Seconds to copy once revealed, not a minute.
 *    Checked below (`DIAGNOSTIC_REPAIR_MAX_CHARS`, single line, measured
 *    over the typed portion only) — the one constraint of the six with an
 *    actual shape to check.
 * 5. **Deterministic signal.** `expected 3, received 4`, never "something
 *    went wrong." Partly checked: a `trace` block must be present (below),
 *    but whether its `observations` actually read as deterministic is
 *    judgement, argued in `rationale.cause`.
 * 6. **Revealable in isolation.** Revealing the repair without showing
 *    where it belongs is malformed. Structurally guaranteed by LTY-FRAME:
 *    a step's typing block is always rendered in place inside its frame,
 *    whatever surrounds it, so there is no shape a diagnostic step could
 *    take that violates this.
 */
const DiagnosticStepObjectSchema = StepObjectSchema.extend({
  rationale: RationaleSchema,
})

export const DiagnosticStepSchema = DiagnosticStepObjectSchema.refine(
  hasExactlyOneTypingBlock,
  { message: ONE_TYPING_BLOCK_MESSAGE, path: ["blocks"] }
)
  .refine(isWithinStepPromptBudget, {
    message: STEP_PROMPT_BUDGET_MESSAGE,
    path: ["blocks"],
  })
  .refine(regionsFitTypingSource, {
    message: REGION_SPAN_MESSAGE,
    path: ["blocks"],
  })
  .refine((step) => step.blocks.some((block) => block.kind === "trace"), {
    message: DIAGNOSTIC_MISSING_TRACE_MESSAGE,
    path: ["blocks"],
  })
  .refine(
    (step) => {
      const repair = typingBlockOf(step)
      // The "exactly one typing block" refine above already reports a
      // missing repair; nothing to bound here.
      if (repair === undefined) return true
      const typed = typedPortionOf(repair.source)
      return (
        typed.length <= DIAGNOSTIC_REPAIR_MAX_CHARS && !typed.includes("\n")
      )
    },
    {
      message: DIAGNOSTIC_REPAIR_TOO_LONG_MESSAGE,
      path: ["blocks"],
    }
  )

/**
 * A step in the obligation→witness family: a constraint that rules out
 * irrelevant solution families, the next concept-bearing decision it
 * forces (`obligation` — authoring metadata, never rendered), the smallest
 * Rust fragment that discharges it (the step's one typing block, the
 * witness), and the state, invariant or cost that follows (the
 * consequence). Constraint and consequence are ordinary rendered blocks —
 * `transition`/`trace`/`region`/`prompt` — nothing new; `obligation` is the
 * one field this family actually adds.
 *
 * Extends `StepObjectSchema` the same way `DiagnosticStepObjectSchema`
 * does, for the identical reason: `obligation` needs to be required in the
 * object shape itself, not narrowed by a `.refine()` type predicate zod
 * does not propagate through a `ZodEffects`' inferred output.
 *
 * # The authoring test, which is the acceptance criterion
 *
 * What conceptual claim becomes true *because this exact fragment is
 * present*? If the honest answer is "the learner knows a method name," the
 * step is a bridge (LTY-ROUTE), not an obligation — not checkable in zod,
 * argued in `obligation` itself and checked for quality by the corpus lint
 * (LTY-FAMILIES A5), the same posture `rationale` is held to.
 *
 * # What does not ship in this variant
 *
 * No `assumes: StepId[]`, no `difficulty`, no `level`. `types/exercise.ts`
 * already deleted a prerequisite edge from `Challenge` with the reasoning
 * that order is the linearization and an edge nothing branches on is a
 * claim without a consumer; reintroducing one here because a future
 * compiler might read it would undo that argument without answering it —
 * the edge belongs upstream, in LTY-ROUTE R2's obligation graph, where
 * route linearization actually consumes it. Difficulty is a property of
 * how instances are *ordered* (decreasing structural support), not a field
 * on one, so it has no home on a single step either.
 */
const ConstructionStepObjectSchema = StepObjectSchema.extend({
  obligation: z.string().min(1),
})

export const ConstructionStepSchema = ConstructionStepObjectSchema.refine(
  hasExactlyOneTypingBlock,
  { message: ONE_TYPING_BLOCK_MESSAGE, path: ["blocks"] }
)
  .refine(isWithinStepPromptBudget, {
    message: STEP_PROMPT_BUDGET_MESSAGE,
    path: ["blocks"],
  })
  .refine(regionsFitTypingSource, {
    message: REGION_SPAN_MESSAGE,
    path: ["blocks"],
  })
  .refine((step) => step.blocks.length >= 2, {
    message: CONSTRUCTION_MISSING_EVIDENCE_MESSAGE,
    path: ["blocks"],
  })

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
/** Every block kind except `typing` — what `promptBlocksOf` hands back. */
export type ReadBlock = PromptBlock | EvidenceBlock
export type Provenance = z.infer<typeof ProvenanceSchema>
export type Rationale = z.infer<typeof RationaleSchema>
export type Step = z.infer<typeof StepSchema>
export type DiagnosticStep = z.infer<typeof DiagnosticStepSchema>
export type ConstructionStep = z.infer<typeof ConstructionStepSchema>
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
 * Everything in the step the player reads rather than types, in order —
 * plain prose (`prompt`) and evidence (`transition`/`trace`/`region`)
 * alike. The name predates the evidence kinds but the doc comment it always
 * carried — "everything read rather than typed" — never stopped being
 * accurate, so it keeps its name rather than gaining a second one that
 * means the same thing.
 */
export function promptBlocksOf(step: Step): Array<ReadBlock> {
  return step.blocks.filter(
    (block): block is ReadBlock => block.kind !== "typing"
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
