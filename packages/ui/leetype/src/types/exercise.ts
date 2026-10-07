import { z } from "zod"

import type { Language } from "./leetype"

/**
 * The exercise format: what the renderer draws, and what a generator must
 * emit.
 *
 * This is both the *view* contract (the types every component renders
 * against) and the *authoring* contract (the schema a seed set or generated
 * corpus satisfies). They are one type on purpose: the moment they diverge
 * the seed set stops rehearsing the pipeline and becomes a second format.
 *
 * Deliberately absent: the per-character maps the typing engine produces
 * (`roles`, `slotOfDisplay`, `slotStatus`, `visibility`, `cursorDisplay`).
 * They project the step *in flight*, not authored data; keeping them out is
 * what lets an exercise be a plain serializable value that zod can validate
 * and a pipeline can emit without knowing the engine exists. Likewise nothing
 * names a concept graph, prerequisite edge or difficulty: `concepts` is where
 * a concept graph will attach.
 */

/**
 * The longest a step's goal is allowed to be.
 *
 * The bound *is* the design: a step demonstrates one competency, so a goal
 * that needs more than a sentence means the step should be split.
 */
export const GOAL_MAX_CHARS = 140

/**
 * The longest a prompt block's prose is allowed to run: this many lines,
 * this many characters each. Also the ceiling on a *step's* combined prompt
 * prose (see the `StepSchema` refinement below).
 *
 * The bound *is* the design: a prompt block points at evidence rather than
 * explaining, so a step that overflows it wants a different evidence block.
 * The same number applies per block and per step on purpose: one long block
 * and several short ones stacked are the same failure (more prose than the
 * pagination-free panel holds), so one bound closes both.
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

const DIFF_SOURCE_MISMATCH_MESSAGE =
  "A typing block's source does not match the string its diff overlay's own segments " +
  "derive. source is generated from diff.segments (see typingSourceOfDiffSegments) — " +
  "author the segments and let the source follow, rather than hand-editing either one " +
  "independently, or the two will drift the way a step's source and a separately-authored " +
  "lineKinds array used to."

/**
 * A block the player reads rather than types.
 *
 * New read-side kinds (a hint, compiler output, a diagram) change this union
 * and `PromptPanel` only; the renderer and the engine never hear about them.
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
 * A before/after pair: the discriminating evidence for a value, type, state,
 * complexity or control-flow change. One kind, not five, because only the
 * formatting of X and Y differs.
 *
 * A transition wanting a third state is two transitions, or a `trace`.
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
 * reads. `startDisplay`/`endDisplay` are the span in display-index
 * coordinates (as `roles`/`slotOfDisplay`, `types/leetype.ts`), recorded but
 * not yet drawn: `CodeDisplay` ignores them (LTY-EVIDENCE E4), so
 * `PromptPanel` shows only `label`.
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
 * One authored fragment of a diff hunk (LTY-PATCH): a kind plus the literal
 * text it contributes. Both the engine's source string and the renderer's
 * per-line classification are *derived* from this one list
 * (`typingSourceOfDiffSegments`, `renderedDiffLineKinds`), so they cannot
 * drift apart.
 *
 * `text` may contain newlines (a context span often covers a prior line plus
 * part of the next), so a rendered line's kind is not one-to-one with a
 * segment: `renderedDiffLineKinds` scans every segment touching the line.
 */
export const DiffSegmentSchema = z.object({
  kind: z.enum(["context", "deletion", "addition"]),
  text: z.string().min(1),
})

/**
 * The diff hunk a `TypingBlock` optionally overlays on its ordinary
 * context/typeable rendering (LTY-PATCH). One hunk, one file, one step: a
 * step wanting two hunks is two steps. No `oldCount`/`newCount`, no
 * multi-file patches, no `diff --git` preamble; nothing ingests real
 * `git diff` output.
 *
 * `path`/`oldStart`/`newStart` render in the viewport's own header, never
 * through `ExerciseHeader` or `provenance`: `diff` says what hunk the player
 * sees, `provenance` where the competency came from.
 */
export const DiffHunkSchema = z.object({
  /** e.g. "src/lib/rate-limit.ts". Never rendered through provenance or ExerciseHeader. */
  path: z.string().min(1),
  /** The `-N` of a `@@ -N,n +M,m @@` hunk header. */
  oldStart: z.number().int().nonnegative(),
  /** The `+M` of a `@@ -N,n +M,m @@` hunk header. */
  newStart: z.number().int().nonnegative(),
  /** Ordered fragments; concatenating their text (context/deletion wrapped in `‹…›`) is the typing block's `source`. */
  segments: z.array(DiffSegmentSchema).min(1),
})

/**
 * Builds the engine-facing `source` string from a diff hunk's segments:
 * `addition` text passes through as the typeable stream, everything else is
 * wrapped in the `‹…›` context-span delimiters `program.rs` understands. The
 * single derivation of a diff step's `source`.
 */
export function typingSourceOfDiffSegments(
  segments: ReadonlyArray<DiffSegment>
): string {
  return segments
    .map((segment) =>
      segment.kind === "addition" ? segment.text : `‹${segment.text}›`
    )
    .join("")
}

/** A rendered line's diff role, in `CodeDisplay`'s own short vocabulary — see its `LineKind`. */
export type RenderedDiffLineKind = "context" | "del" | "add"

/**
 * Derives each rendered line's diff role from segments alone. A line is
 * `"add"` if *any* segment contributing to it is `addition`; otherwise
 * `"del"` if any is `deletion`; otherwise `"context"`.
 */
export function renderedDiffLineKinds(
  hunk: Pick<DiffHunk, "segments">
): ReadonlyArray<RenderedDiffLineKind> {
  const kinds: Array<RenderedDiffLineKind> = []
  let hasAddition = false
  let hasDeletion = false

  const flushLine = (): void => {
    kinds.push(hasAddition ? "add" : hasDeletion ? "del" : "context")
    hasAddition = false
    hasDeletion = false
  }

  for (const segment of hunk.segments) {
    for (const char of segment.text) {
      if (char === "\n") {
        flushLine()
        continue
      }
      if (segment.kind === "addition") hasAddition = true
      else if (segment.kind === "deletion") hasDeletion = true
    }
  }
  flushLine()

  return kinds
}

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
  /**
   * Optional diff-hunk overlay (LTY-PATCH). A step without one is a plain
   * frame; there is no "diff step" mode flag. Consistency with `source` is
   * checked at the step level (`diffSourceMatchesSegments`) because this
   * schema must stay a plain `ZodObject` to be a discriminated-union member,
   * which a `.refine()` wrapper (`ZodEffects`) cannot be.
   */
  diff: DiffHunkSchema.optional(),
})

/**
 * The three evidence kinds, closed. A fourth is a change to this union argued
 * on its own merits, not an instance easier to author as a new kind.
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
 * require it to render or play a step. After extraction the competencies are
 * the subject, not the module that happened to demonstrate them.
 */
export const ProvenanceSchema = z.object({
  /** Human-readable origin: a repo, a paper, a problem name. */
  source: z.string().min(1),
  /** A path, URL or citation, when there is one. */
  locator: z.string().min(1).optional(),
})

/**
 * Why a diagnostic step's repair is the correct one: authoring evidence for
 * `DiagnosticStepSchema`'s judgement-only constraints. Inert on the typing
 * path (nothing renders it or branches on it); checked mechanically, not for
 * quality, by the corpus lint (LTY-FAMILIES A5).
 *
 */
export const RationaleSchema = z.object({
  /** The one principal causal defect the failure signal points at. */
  cause: z.string().min(1),
  /** Why *this* repair, not a shorter one that would only silence the symptom. */
  whyRepairDiscriminates: z.string().min(1),
})

/**
 * One authored candidate for the reason-reaffirmation shim (LTY-WHY W2):
 * "why is this the right fix," posed as 2–5 short leetyped sentences. No
 * verdict, no mastery signal; see `docs/leetype/README.md` → LTY-WHY.
 *
 * `text` renders as a chip once a step's hunk completes; `canonical` is inert.
 */
export const RationaleChoiceSchema = z.object({
  text: z.string().min(1),
  /**
   * Which candidate an author believes is correct, recorded for an eventual
   * verifier. Nothing at runtime reads it: no candidate is ever colored,
   * labeled or treated differently because of it.
   */
  canonical: z.boolean().optional(),
})

/**
 * The ceiling on `rationaleChoices` (LTY-WHY W2). Conservative because no
 * corpus instance measured it; raise it from a real instance that needs
 * more, not in the abstract.
 */
export const RATIONALE_CHOICES_MAX = 5

/**
 * The longest a diagnostic step's repair may run, in *typed keystrokes*
 * (`typeableStreamLength` over `typedPortionOf(source)`, approximating the
 * engine's `typed_stream`): constraint 4's "seconds to copy once revealed,
 * not a minute," made a number. The frame around the repair is unbounded.
 *
 * Keystrokes, not raw characters, because a multi-line repair contains
 * newlines and indentation that are `Role::Skip`; counting them would reject
 * an indented repair for its formatting alone.
 *
 * This bounds volume only. Structure ("one principal causal defect") is
 * `diagnosticRepairIsOneLocus`: a diff-shaped repair's rendered `add` lines
 * must form one contiguous run; a repair without a diff must be one line.
 *
 * 50 is headroom above the hand-authored corpus (11–40 typed keystrokes,
 * `right -= 1;` to `map.entry(key).or_default().push(value);`). Raise it from
 * a real instance that needs more, not in the abstract.
 */ export const DIAGNOSTIC_REPAIR_MAX_CHARS = 50

const DIAGNOSTIC_REPAIR_TOO_LONG_MESSAGE =
  `A diagnostic step's repair runs past ${DIAGNOSTIC_REPAIR_MAX_CHARS} typed characters. ` +
  "The repair is meant to be copied in seconds once revealed, not authored as a second " +
  "exercise — narrow the fault, or this wants to be two diagnostic instances."

const DIAGNOSTIC_REPAIR_NOT_ONE_LOCUS_MESSAGE =
  "A diagnostic step's repair is not one contiguous locus. A diff-shaped repair's " +
  "addition segments must render as a single contiguous run of add lines — two " +
  "separate runs is two faults wearing one hunk, and wants two diagnostic instances. " +
  "A repair with no diff overlay has no rendered line kinds to prove contiguity " +
  "against, so it keeps the original rule: one line."

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
 * The shape invariants every step variant shares, as predicates rather than
 * duplicated `.refine()` bodies: each family schema `.extend()`s the object
 * shape and must re-apply them, since zod does not inherit refinements.
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
  // Each prompt block is bounded on its own; this bounds their sum.
  const promptLineCount = step.blocks
    .filter(
      (block): block is z.infer<typeof PromptBlockSchema> =>
        block.kind === "prompt"
    )
    .reduce((total, block) => total + block.lines.length, 0)
  return promptLineCount <= PROMPT_MAX_LINES
}

function regionsFitTypingSource(step: BlocksHolder): boolean {
  // Conservative: regions index the engine's *rendered* text, which this
  // engine-free file cannot compute. Rendering only strips `‹…›` delimiters,
  // so the rendered length never exceeds the raw source length.
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
 * The source/diff consistency check `TypingBlockSchema` cannot carry itself
 * (see its `diff` field). Once `diff` is present `source` is derived data,
 * so this is an equality check.
 */
function diffSourceMatchesSegments(step: BlocksHolder): boolean {
  const typing = step.blocks.find(
    (block): block is z.infer<typeof TypingBlockSchema> =>
      block.kind === "typing"
  )
  if (typing?.diff === undefined) return true // no diff, nothing to check
  return typing.source === typingSourceOfDiffSegments(typing.diff.segments)
}

/**
 * The typed portion of an authored typing-block source: everything outside
 * a `‹…›` context span. Budgets measure this, not `source.length`, since a
 * diagnostic frame legitimately spans lines of context around a short repair.
 *
 * Approximates the engine's `typed_stream` (`program.rs`) to keep this file
 * engine-free. Known gap: an unterminated `‹` is context to the engine but
 * counted as typed here; such a source fails other checks first.
 */
function typedPortionOf(source: string): string {
  return source.replace(/‹[^›]*›/g, "")
}

/** Whitespace `program.rs` ever classifies as layout — the alphabet `isLoneInteriorSpace` checks the boundary of. */
function isLayoutWhitespace(char: string | undefined): boolean {
  return (
    char === undefined ||
    char === " " ||
    char === "\n" ||
    char === "\t" ||
    char === "\r"
  )
}

/**
 * Approximates the engine's `typed_stream` length over a span: the keys the
 * player actually presses. Mirrors `program.rs`'s rule that a whitespace run
 * is typeable only when it is exactly one space bounded on both sides by
 * non-whitespace; newlines and indentation are `Role::Skip`.
 */
function typeableStreamLength(span: string): number {
  let count = 0
  for (let index = 0; index < span.length; index++) {
    const char = span[index]
    if (!isLayoutWhitespace(char)) {
      count += 1
      continue
    }
    // A lone interior space is typed; any other whitespace is Role::Skip.
    if (
      char === " " &&
      !isLayoutWhitespace(span[index - 1]) &&
      !isLayoutWhitespace(span[index + 1])
    ) {
      count += 1
    }
  }
  return count
}

/** Volume half of the diagnostic repair bound (LTY-PATCH P4) — see `DIAGNOSTIC_REPAIR_MAX_CHARS`'s doc comment. */
function diagnosticRepairWithinCharBudget(step: BlocksHolder): boolean {
  const repair = step.blocks.find(
    (block): block is z.infer<typeof TypingBlockSchema> =>
      block.kind === "typing"
  )
  if (repair === undefined) return true // reported by the one-typing-block refine
  return (
    typeableStreamLength(typedPortionOf(repair.source)) <=
    DIAGNOSTIC_REPAIR_MAX_CHARS
  )
}

/**
 * How many separate contiguous runs of `"add"` a diff hunk's rendered line
 * kinds hold — 0 for none, 1 for a well-formed single hunk, 2+ for two or
 * more faults wearing one hunk.
 */
function addRunCount(lineKinds: ReadonlyArray<RenderedDiffLineKind>): number {
  let runs = 0
  let inRun = false
  for (const kind of lineKinds) {
    if (kind === "add") {
      if (!inRun) runs += 1
      inRun = true
    } else {
      inRun = false
    }
  }
  return runs
}

/** Structure half of the diagnostic repair bound (LTY-PATCH) — see `DIAGNOSTIC_REPAIR_MAX_CHARS`'s doc comment. */
function diagnosticRepairIsOneLocus(step: BlocksHolder): boolean {
  const repair = step.blocks.find(
    (block): block is z.infer<typeof TypingBlockSchema> =>
      block.kind === "typing"
  )
  if (repair === undefined) return true
  if (repair.diff === undefined) {
    return !typedPortionOf(repair.source).includes("\n")
  }
  return addRunCount(renderedDiffLineKinds(repair.diff)) <= 1
}

/**
 * The atom of an exercise: *n* read blocks plus exactly one typing block.
 *
 * The schema enforces the cardinality because it keeps the sticky prompt
 * panel trivially correct: two typing blocks would make "which prompt is
 * sticky" a live question needing a scroll-spy. The cost: two typing blocks
 * under one shared prompt means repeating the prompt across two steps.
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
   * justification for a diagnostic step's repair. Declared on the generic
   * shape (optional) so the generic `ExerciseCorpusSchema.parse` keeps it
   * instead of stripping an unknown key; `DiagnosticStepSchema` requires it.
   */
  rationale: RationaleSchema.optional(),
  /**
   * Obligation→witness family (LTY-FAMILIES A2): the next concept-bearing
   * decision a construction step's witness discharges. Optional here for the
   * same reason as `rationale`; `ConstructionStepSchema` requires it.
   *
   * Authoring metadata: **never rendered on the typing path**, where it would
   * become a description card.
   */
  obligation: z.string().min(1).optional(),
  /**
   * The id of the step whose obligation this one transfers (LTY-SEAM S3):
   * this step probes the same abstraction in a new context. Inert like
   * `provenance`; nothing at runtime reads it.
   *
   * The corpus lint checks only that the id exists and shares at least one
   * `concepts` entry with this step; whether the transfer is good is the
   * author's judgement.
   */
  transferFrom: z.string().min(1).optional(),
  /**
   * The reason-reaffirmation shim's candidates (see `RationaleChoiceSchema`).
   * Declared on the generic shape for the same reason as `rationale`.
   *
   * `min(2)` because one candidate is not a choice; `max` keeps the accordion
   * small. "No candidate is a full prefix of another" is a cross-candidate
   * check, so it lives in the corpus lint (`corpus-lint.ts`).
   */
  rationaleChoices: z
    .array(RationaleChoiceSchema)
    .min(2)
    .max(RATIONALE_CHOICES_MAX)
    .optional(),
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
  .refine(diffSourceMatchesSegments, {
    message: DIFF_SOURCE_MISMATCH_MESSAGE,
    path: ["blocks"],
  })

/**
 * A step in the falsification→repair family: a visible attempted witness
 * (the buggy frame, carried as `‹context›` in the typing source), a visible
 * falsified expectation (a `trace` block), and the adaptively revealed delta
 * that repairs it (the step's one typing block). The bounded repair string is
 * at once the answer, the explanation, the interaction and the evidence.
 *
 * Extends `StepObjectSchema` with `rationale` required and re-applies the
 * shared refinements rather than composing `StepSchema`: zod does not inherit
 * refinements through `.extend()`, and a `.refine()` predicate does not narrow
 * a `ZodEffects`' output, so composing would leave `rationale` typed optional.
 * No difficulty, severity or threshold field: the family must not reinvent
 * them.
 *
 * # The six validity constraints, and where each is enforced
 *
 * 1. **One failure.** One principal causal defect. Judgement, argued in
 *    `rationale.cause`; the mechanical corner is `diagnosticRepairIsOneLocus`
 *    (a diff repair's `add` lines form one contiguous run).
 * 2. **One discriminating repair.** The repair distinguishes the intended
 *    misconception rather than silencing the symptom. Judgement, argued in
 *    `rationale.whyRepairDiscriminates`.
 * 3. **Minimal causal surface.** The frame omits everything unrelated to the
 *    fault. Judgement; no shape-level signal exists.
 * 4. **Bounded answer.** Seconds to copy once revealed. Checked by
 *    `diagnosticRepairWithinCharBudget` (`DIAGNOSTIC_REPAIR_MAX_CHARS`).
 * 5. **Deterministic signal.** `expected 3, received 4`, never "something
 *    went wrong." Partly checked: a `trace` block must be present; whether it
 *    reads as deterministic is judgement.
 * 6. **Revealable in isolation.** Structurally guaranteed by LTY-FRAME: the
 *    typing block always renders in place inside its frame.
 */ const DiagnosticStepObjectSchema = StepObjectSchema.extend({
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
  .refine(diffSourceMatchesSegments, {
    message: DIFF_SOURCE_MISMATCH_MESSAGE,
    path: ["blocks"],
  })
  .refine((step) => step.blocks.some((block) => block.kind === "trace"), {
    message: DIAGNOSTIC_MISSING_TRACE_MESSAGE,
    path: ["blocks"],
  })
  .refine(diagnosticRepairWithinCharBudget, {
    message: DIAGNOSTIC_REPAIR_TOO_LONG_MESSAGE,
    path: ["blocks"],
  })
  .refine(diagnosticRepairIsOneLocus, {
    message: DIAGNOSTIC_REPAIR_NOT_ONE_LOCUS_MESSAGE,
    path: ["blocks"],
  })

/**
 * A step in the obligation→witness family: a constraint that rules out
 * irrelevant solution families, the next concept-bearing decision it forces
 * (`obligation`, authoring metadata), the smallest fragment that discharges
 * it (the step's typing block, the witness), and the state, invariant or
 * cost that follows (the consequence). Constraint and consequence are
 * ordinary rendered blocks; `obligation` is the one field this family adds.
 * Extends `StepObjectSchema` for the same reason `DiagnosticStepObjectSchema`
 * does.
 *
 * Authoring test: what conceptual claim becomes true *because this exact
 * fragment is present*? If the answer is "the learner knows a method name,"
 * the step is a bridge (LTY-ROUTE), not an obligation. Judgement, argued in
 * `obligation` and checked for quality by the corpus lint (LTY-FAMILIES A5).
 *
 * No `assumes`, `difficulty` or `level`: prerequisite edges belong in
 * LTY-ROUTE R2's obligation graph, where route linearization consumes them,
 * and difficulty is a property of how instances are ordered, not of one step.
 */ const ConstructionStepObjectSchema = StepObjectSchema.extend({
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
  .refine(diffSourceMatchesSegments, {
    message: DIFF_SOURCE_MISMATCH_MESSAGE,
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
export type DiffSegment = z.infer<typeof DiffSegmentSchema>
export type DiffHunk = z.infer<typeof DiffHunkSchema>
export type TypingBlock = z.infer<typeof TypingBlockSchema>
export type Block = z.infer<typeof BlockSchema>
/** Every block kind except `typing` — what `promptBlocksOf` hands back. */
export type ReadBlock = PromptBlock | EvidenceBlock
export type Provenance = z.infer<typeof ProvenanceSchema>
export type Rationale = z.infer<typeof RationaleSchema>
export type RationaleChoice = z.infer<typeof RationaleChoiceSchema>
export type Step = z.infer<typeof StepSchema>
export type DiagnosticStep = z.infer<typeof DiagnosticStepSchema>
export type ConstructionStep = z.infer<typeof ConstructionStepSchema>
export type Exercise = z.infer<typeof ExerciseSchema>

/**
 * The step's typing block.
 *
 * Total on purpose: if a corpus slipped past validation, `undefined` is a
 * blank viewport, whereas an exception during render is a blank screen.
 */
export function typingBlockOf(step: Step): TypingBlock | undefined {
  return step.blocks.find(
    (block): block is TypingBlock => block.kind === "typing"
  )
}

/**
 * Builds a diff-shaped `TypingBlock` from its segments alone, the way every
 * patch-shaped seed step should be authored: `source` is derived
 * (`typingSourceOfDiffSegments`), so it cannot disagree with `diff`.
 */
export function typingBlockFromDiff(input: {
  language: Language
  path: string
  oldStart: number
  newStart: number
  segments: ReadonlyArray<DiffSegment>
}): TypingBlock {
  return {
    kind: "typing",
    language: input.language,
    source: typingSourceOfDiffSegments(input.segments),
    diff: {
      path: input.path,
      oldStart: input.oldStart,
      newStart: input.newStart,
      segments: [...input.segments],
    },
  }
}

/**
 * Everything in the step the player reads rather than types, in order:
 * prose (`prompt`) and evidence (`transition`/`trace`/`region`) alike.
 */
export function promptBlocksOf(step: Step): Array<ReadBlock> {
  return step.blocks.filter(
    (block): block is ReadBlock => block.kind !== "typing"
  )
}

/**
 * The language of the step's typing block, for syntax highlighting. Falls
 * back to Rust, the curriculum's language, so a malformed step still renders
 * as code.
 */
export function languageOf(step: Step): Language {
  return typingBlockOf(step)?.language ?? "rust"
}
