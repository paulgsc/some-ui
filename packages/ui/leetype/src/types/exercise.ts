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

const DIFF_SOURCE_MISMATCH_MESSAGE =
  "A typing block's source does not match the string its diff overlay's own segments " +
  "derive. source is generated from diff.segments (see typingSourceOfDiffSegments) — " +
  "author the segments and let the source follow, rather than hand-editing either one " +
  "independently, or the two will drift the way a step's source and a separately-authored " +
  "lineKinds array used to."

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
 * One authored fragment of a diff hunk (LTY-PATCH, canonicalized): a kind
 * plus the literal text it contributes. Replaces the earlier `patch` shape
 * — a hand-authored `source` string plus a separately-authored `lineKinds`
 * array indexing its *rendered* lines — which could drift against each
 * other because nothing but a lint re-derived one from the other after the
 * fact. A segment's `kind` and `text` travel together, so both the typing
 * engine's source string and the renderer's per-line classification are
 * *derived* from this one list (`typingSourceOfDiffSegments`,
 * `renderedDiffLineKinds` below) rather than independently authored.
 *
 * `text` may contain embedded newlines: a context span commonly spans a
 * full prior line plus part of the next (the same shape the old `‹…›`
 * markup allowed), and a rendered *line*'s kind is not one-to-one with a
 * segment — `renderedDiffLineKinds` derives it by scanning every segment
 * that contributed a character to that line.
 */
export const DiffSegmentSchema = z.object({
  kind: z.enum(["context", "deletion", "addition"]),
  text: z.string().min(1),
})

/**
 * The diff hunk a `TypingBlock` optionally overlays on its ordinary
 * context/typeable rendering (LTY-PATCH). One hunk, one file, one step — a
 * step wanting two hunks is two steps, the same cost "exactly one typing
 * block per step" already accepted. No `oldCount`/`newCount`, no multi-file
 * patches, no `diff --git` preamble: authors write the segments, nothing in
 * the workspace ingests real `git diff` output yet.
 *
 * `path`/`oldStart`/`newStart` render in the viewport's own header (P3),
 * never through `ExerciseHeader` and never through `provenance`: `diff`
 * says what hunk the player is looking at, `provenance` says where the
 * competency was distilled from, and stays inert either way.
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
 * `addition` text passes through as the typeable stream, everything else
 * is wrapped in the `‹…›` context-span delimiters `program.rs` already
 * understands. The single place both `TypingBlock.source` and (via
 * `typingBlockFromDiff`) every patch-shaped seed step derive their source
 * from, so a hand-maintained `source` can never disagree with its own
 * segments the way a separately-authored `lineKinds` array used to.
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
 * Derives, from segments alone, exactly the per-rendered-line classification
 * the old hand-authored `lineKinds` array used to carry — mechanically,
 * so it cannot drift from the source the same segments also generate.
 * Mirrors the mixed-line rule the corpus lint used to check against the
 * real engine: a rendered line is `"add"` if *any* segment contributing to
 * it is `addition`; otherwise `"del"` if any contributing segment is
 * `deletion`; otherwise `"context"`.
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
   * frame and renders exactly as it did before this field existed — there
   * is no mode flag anywhere that says a step "is a diff step". Consistency
   * between this and `source` is checked at the step level (see
   * `diffSourceMatchesSegments` below) rather than here: `TypingBlockSchema`
   * has to stay a plain `ZodObject` to remain a valid member of
   * `BlockSchema`'s discriminated union, which a `.refine()` wrapper (a
   * `ZodEffects`) cannot be.
   */
  diff: DiffHunkSchema.optional(),
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
 * One authored candidate for the reason-reaffirmation shim (LTY-WHY W2,
 * #1102) — "why is this the right fix," posed as 2–5 short leetyped
 * sentences rather than a click. See `docs/leetype/README.md`'s LTY-WHY
 * section for the shim's posture: no verdict, no mastery signal, every
 * completed candidate accepted until a real semantic verifier exists.
 *
 * Unlike `rationale`/`obligation` above, this shape is not purely inert —
 * W4's widget renders each candidate's `text` as a chip once a step's hunk
 * completes. What stays inert is `canonical` alone.
 */
export const RationaleChoiceSchema = z.object({
  text: z.string().min(1),
  /**
   * Which candidate an author believes is correct. Worth recording for the
   * eventual verifier — a hidden reference it will gate against — never
   * load-bearing because nothing in this epic's runtime path reads it: no
   * component, hook, or lint branches on it, and no candidate is ever
   * colored, labeled, or treated differently because of it. Same posture
   * `rationale`/`obligation` hold today.
   */
  canonical: z.boolean().optional(),
})

/**
 * The ceiling on `rationaleChoices` below (LTY-WHY W2, #1102): the issue's
 * own proposed starting number, not derived from real authored instances
 * the way `DIAGNOSTIC_REPAIR_MAX_CHARS` was — no step in the corpus carries
 * `rationaleChoices` yet, so there is nothing to measure a ceiling against.
 * Kept at the conservative end of what the issue suggested rather than
 * picked generously, on the same discipline: raise it from a real authored
 * instance that actually needs more candidates, not in the abstract.
 */
export const RATIONALE_CHOICES_MAX = 5

/**
 * The longest a diagnostic step's repair — an approximation of the
 * engine's own `typed_stream` length over `typedPortionOf(source)` below
 * (`typeableStreamLength`), not `source.length` and not
 * `typedPortionOf(source).length` either — is allowed to run: constraint
 * 4's "seconds to copy once revealed, not a minute," made a number. The
 * frame around the repair (context, per LTY-FRAME) is unbounded by this
 * constant on purpose; only what the player actually types is.
 *
 * Measured as *keystrokes*, not raw characters, because a repair's typed
 * portion can itself contain layout the player never presses a key for —
 * newlines and per-line leading indentation, both `Role::Skip` in the
 * engine. That distinction was invisible for a single-line repair (nothing
 * to indent around), which is exactly why the gap surfaced only once
 * LTY-PATCH P4 allowed a repair to span lines: measuring raw characters
 * there would reject an indented multi-line repair the volume bound is not
 * actually meant to reject, purely because of its formatting.
 *
 * # LTY-PATCH P4 (#1079): this bound used to also police structure
 *
 * Originally "one line, ≤50 characters" — a single rule doing two jobs at
 * once, because until a hunk overlay existed the two happened to coincide:
 * constraint 4's *volume* claim ("seconds to copy, not a minute") and
 * constraint 1's *structure* claim ("one principal causal defect") wearing
 * a proxy. A patch separates them — three added lines can be one locus and
 * still be quick to type, and one very long single line can be neither —
 * so the single-line half of the old rule is gone, replaced by contiguity
 * (`diagnosticRepairIsOneLocus` below): a patch-shaped repair's rendered
 * `add` lines (derived from `diff.segments` — `renderedDiffLineKinds`) must
 * form at most one contiguous run — "one fault, one edit" becomes "one hunk
 * has one addition block." A repair with no diff overlay has no rendered
 * line kinds to prove contiguity against, so it keeps the original rule
 * verbatim: one line.
 *
 * This constant now bounds volume alone, for every diagnostic repair
 * whether patch-shaped or not — landed as option (b) of the three the
 * issue laid out:
 *
 * - **(a)**, rejected: keep this constant, drop the line rule for patch
 *   steps, *and* add a separate `+`-line-count cap. An extra knob every
 *   other constant in this file has had to earn; contiguity alone already
 *   does the structural job (b) wants without it.
 * - **(c)**, rejected: keep the single-line rule and declare multi-line
 *   repairs out of the diagnostic family entirely. Defensible as the status
 *   quo's own argument, but it would make the epic's motivating case (probe
 *   a solve that breaks, often a two- or three-line fix) mostly
 *   unreachable, and it draws the family boundary by a formatting rule
 *   rather than by what the step is actually doing.
 *
 * 50 rather than a round "looks generous" figure: the five original
 * hand-authored instances span 11–40 typed keystrokes (`right -= 1;` to
 * `map.entry(key).or_default().push(value);`), so this is headroom above
 * the corpus's own actual ceiling, not a number picked in the abstract.
 * LTY-PATCH's own multi-line instance (a three-line guard clause, 39 raw
 * characters but 25 typed keystrokes once its indentation and newlines are
 * excluded) fits inside that same headroom — no reason to raise the number
 * yet. Raise it the same way if a future instance actually needs more: from
 * a real instance, not in the abstract.
 */
export const DIAGNOSTIC_REPAIR_MAX_CHARS = 50

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
 * Where the source/diff consistency `TypingBlockSchema` itself cannot check
 * (see its own doc comment: a `.refine()` there would stop it being a valid
 * `BlockSchema` discriminated-union member) actually lands. `source` is
 * generated data once `diff` is present — `typingSourceOfDiffSegments`
 * concatenates the same segments the renderer derives its line kinds from
 * — so this is an equality check, not a bound: unlike the old
 * `patch.lineKinds`/`source` pairing, there is no way for a rendered-line
 * count to legitimately run short of the authored one, because there are no
 * two independently-authored structures left to disagree.
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
 * Approximates the length of the engine's own `typed_stream` over a
 * rendered span — not `span.length`, which counts layout the player never
 * presses a key for. Same posture as `typedPortionOf` above: a pure-string
 * approximation of `program.rs`'s classification rule ("a run of
 * whitespace is typeable only when it is exactly one space bounded on both
 * sides by non-whitespace"), kept approximate rather than importing the
 * wasm engine, for the same reason this whole file stays engine-free.
 *
 * Load-bearing for LTY-PATCH P4 (#1079): once a repair can span multiple
 * lines, its raw character count includes newlines and per-line leading
 * indentation that `Role::Skip` already excludes from what the player
 * actually types (`press()` refuses `\n`/`\r`/`\t` outright) — measuring
 * `span.length` there would reject a repair the volume bound is not
 * actually meant to reject, purely because of how it happens to be
 * indented.
 */
function typeableStreamLength(span: string): number {
  let count = 0
  for (let index = 0; index < span.length; index++) {
    const char = span[index]
    if (!isLayoutWhitespace(char)) {
      count += 1
      continue
    }
    // The one whitespace run that *is* typed: a lone space bounded by
    // non-whitespace on both sides. Everything else here — an indentation
    // run, a newline, a multi-space run — is Role::Skip.
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
  // The "exactly one typing block" refine already reports a missing
  // repair; nothing to bound here.
  if (repair === undefined) return true
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
  /**
   * The reason-reaffirmation shim's authored candidates (LTY-WHY W2,
   * #1102) — see `RationaleChoiceSchema`'s own doc comment for what
   * renders and what stays inert. Optional, and declared here rather than
   * only on a family-specific schema, for the same reason `rationale` and
   * `obligation` are: it has to survive the *generic*
   * `ExerciseCorpusSchema.parse` the shim runs at module load.
   *
   * `min(2)` because one candidate is not a choice; `max` is
   * `RATIONALE_CHOICES_MAX` because the accordion is a small UI element,
   * not a quiz page. No candidate may share a full prefix with another —
   * checked in the corpus lint (`lib/leetype/exercises/corpus-lint.ts`),
   * not here, because it is a cross-candidate property this schema has no
   * natural place to express as a `.refine()` on one array field without
   * duplicating the whole-step refinement machinery below for a check that
   * has nothing to do with block shape.
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
 *    `rationale.cause`, not independently checkable from the shape alone in
 *    general. LTY-PATCH P4 (#1079) adds one mechanical corner of it for a
 *    diff-shaped repair: `diagnosticRepairIsOneLocus` below requires the
 *    rendered `add` lines (derived from `diff.segments`) to form a single
 *    contiguous run — "one hunk has one addition block" is checkable even
 *    though "the cause is really singular" still is not.
 * 2. **One discriminating repair.** The repair distinguishes the intended
 *    misconception rather than merely silencing the symptom. Judgement —
 *    argued in `rationale.whyRepairDiscriminates`.
 * 3. **Minimal causal surface.** The frame omits everything unrelated to
 *    the fault. Judgement — there is no shape-level signal for "everything
 *    in this context span is relevant."
 * 4. **Bounded answer.** Seconds to copy once revealed, not a minute.
 *    Checked below (`DIAGNOSTIC_REPAIR_MAX_CHARS`, measured over the typed
 *    portion only) — the one constraint of the six with an actual shape to
 *    check. Bundled with constraint 1's structural claim until LTY-PATCH P4
 *    (#1079) separated them: `diagnosticRepairWithinCharBudget` bounds
 *    volume alone now, and `diagnosticRepairIsOneLocus` (constraint 1,
 *    above) bounds structure.
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
 * Builds a diff-shaped `TypingBlock` from its segments alone — the way every
 * patch-shaped seed step should be authored. `source` is generated
 * (`typingSourceOfDiffSegments`), never independently written, so a seed
 * module using this can no longer author a `source`/`diff` pair that
 * disagrees with itself the way a hand-written `source` plus a separately
 * hand-written `lineKinds` array used to.
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
