import {
  EVIDENCE_ROW_BUDGET,
  evidenceRowsOf,
} from "@leetype/components/typing-game/prompt-panel/rows"
import type { Block, Exercise, Step } from "@leetype/types/exercise"
import {
  ConstructionStepSchema,
  DiagnosticStepSchema,
  promptBlocksOf,
  typingBlockOf,
} from "@leetype/types/exercise"
import { assertNever } from "some-ui-utils"

/**
 * The corpus lint (LTY-FAMILIES A5): "no judgment is allowed unless it can
 * produce its own justification," turned into a CI failure rather than a
 * sentence in a doc comment (`docs/leetype/README.md`,
 * `lib/leetype/exercises/index.ts`).
 *
 * `rationale` and `obligation` are optional on the generic `StepSchema`
 * (see `types/exercise.ts`'s own doc comments on those fields) so that a
 * diagnostic or construction step survives the *generic*
 * `ExerciseCorpusSchema.parse` the shim runs at module load — which means
 * that parse alone never re-checks a diagnostic step against
 * `DiagnosticStepSchema` or a construction step against
 * `ConstructionStepSchema`. This module is what actually re-checks them,
 * plus the checks in the issue's own list that no schema — strict or
 * generic — can express at all: whether `rationale`'s two fields argue
 * different things, whether `obligation` is a restatement of its witness,
 * and the `concepts`-non-empty tightening.
 *
 * A diff overlay's rendered line kinds are *not* one of those checks
 * (LTY-PATCH, canonicalized): they used to be a separately-authored
 * `lineKinds` array this file re-verified against the engine's real
 * rendered source, because nothing else kept the two in agreement. Now
 * that a step's typing block derives both its `source` and its rendered
 * line kinds from the same authored `diff.segments`
 * (`typingSourceOfDiffSegments`/`renderedDiffLineKinds`, `types/exercise.ts`),
 * there is no second, independently-authored structure left for a lint to
 * catch drifting — `TypingBlockSchema`'s own step-level refine
 * (`diffSourceMatchesSegments`) already rejects a hand-edited `source` that
 * disagrees with its segments at parse time, before this file ever runs.
 *
 * Mechanical, and only mechanical, per the issue's own framing: this does
 * not evaluate whether a rationale or an obligation is *good*, only
 * whether the shape and the most literal form of restatement are absent.
 * It runs over `ALL_FIXTURE_EXERCISES` as data — no `PromptPanel`,
 * `CodeDisplay` or any other renderer import — so it stays exactly as
 * cheap as the other CI guardrail scripts it joins
 * (`scripts/check-wasm-bindgen-boundary.sh`,
 * `scripts/check-mutation-boundary.sh`, `docs/canon/scripts/check-citations.sh`).
 *
 * # LTY-SEED G5 (#1110): what the generator's first worked run did *not*
 * add here, and why
 *
 * G4 (#1109, `docs/leetype/leetype-exercise-generator-log.md`) ran the
 * generator prompt against two concepts and found no self-check item that
 * was both mechanizable and not already covered — every schema-checkable
 * shape (patch alignment, repair budget and contiguity, trace presence,
 * evidence-row budget, `transferFrom`'s referential and concept-overlap
 * check) is already enforced above or in `DiagnosticStepSchema`/
 * `ConstructionStepSchema`, and both real findings that run produced were
 * *prose* imprecision (an `obligation` overclaiming general equivalence; a
 * `trace` observation naming the wrong quantity) — fixed as wording
 * changes to the prompt itself, not as anything a data-only lint over
 * `ALL_FIXTURE_EXERCISES` could have caught. Adding no new check function
 * is this story's honest outcome, not a skipped step — mirroring G4's own
 * "rejecting everything is a successful outcome."
 *
 * Three items considered and deliberately left as review-only, so the
 * boundary is recorded rather than silently forgotten:
 *
 * - **Concept-id near-duplication between two different, both-registered
 *   `CONCEPT_IDS` entries** (e.g. `loop-progress` vs. a hypothetical
 *   `loop-progress-check`). `concepts.test.ts` already catches an
 *   unregistered string (a typo, or a coined id nobody added to
 *   `CONCEPT_IDS`); what nothing catches is two *legitimately registered*
 *   ids that mean the same thing. Left out because a fuzzy string-match
 *   check needs a threshold that is easy to write just outside of, and
 *   would false-positive on real, deliberately-similar-sounding concepts
 *   already in this corpus (`loopProgress`/`windowShrinking` are both "a
 *   measure must move toward termination," phrased differently because
 *   they probe different code shapes) — exactly the kind of judgment
 *   #1009's own framing says this file must not pretend it can make.
 * - **Whether a `trace` observation's number names the exact quantity it
 *   claims to**, rather than a different, related quantity that happens to
 *   also be correctly computed — the real failure G4's run landed (a
 *   correct count of distinct subproblems, mislabeled as a call count).
 *   Left out because verifying it means executing or hand-tracing
 *   arbitrary Rust for the specific quantity a free-text `label` names —
 *   a natural-language claim against a number, which is exactly the kind
 *   of open-ended judgment this file's own "mechanical, and only
 *   mechanical" framing (above) draws the line against, not a shape a
 *   parser over `ALL_FIXTURE_EXERCISES` could check.
 * - **Whether a diagnostic step's `-` side actually compiles.** The
 *   strongest possible check on "valid prior attempt," and the one this
 *   file's own character forbids: every check above runs with no Rust
 *   toolchain, `cargo`, or wasm build required, the same way
 *   `scripts/check-wasm-bindgen-boundary.sh` and
 *   `scripts/check-mutation-boundary.sh` do. Requiring `cargo` here would
 *   be a different, much heavier CI shape than every sibling guardrail
 *   script — a decision for its own PR if a future run's log shows this
 *   check would actually have caught something, not one this file backs
 *   into by accretion.
 */

function locate(exercise: Exercise, step: Step): string {
  return `exercise "${exercise.id}", step "${step.id}"`
}

/** Every step in the corpus, keyed by id — what `transferFrom` cross-references, since a declared pair may span exercises. */
function indexStepsById(
  exercises: ReadonlyArray<Exercise>
): ReadonlyMap<string, Step> {
  const byId = new Map<string, Step>()
  for (const exercise of exercises) {
    for (const step of exercise.steps) {
      byId.set(step.id, step)
    }
  }
  return byId
}

/**
 * No two steps in the corpus share an id — a precondition `indexStepsById`
 * depends on and does not itself check: a `Map` silently lets a later step
 * shadow an earlier one with the same id, which would check a `transferFrom`
 * reference against the wrong step instead of catching the real mismatch
 * (review finding on #1073). `ExerciseCorpusSchema` only enforces uniqueness
 * *within* one exercise's `steps` array, never across the whole corpus, so
 * this is the one thing schema-level validation cannot catch.
 */
function checkNoDuplicateStepIds(
  exercises: ReadonlyArray<Exercise>
): Array<string> {
  const firstSeenIn = new Map<string, string>()
  const violations: Array<string> = []
  for (const exercise of exercises) {
    for (const step of exercise.steps) {
      const seenIn = firstSeenIn.get(step.id)
      if (seenIn === undefined) {
        firstSeenIn.set(step.id, exercise.id)
      } else {
        violations.push(
          `step id "${step.id}" is used by both exercise "${seenIn}" and exercise "${exercise.id}" — step ids must be unique across the whole corpus, not just within one exercise.`
        )
      }
    }
  }
  return violations
}

/**
 * `transferFrom`'s two mechanical checks (LTY-SEAM S3, #1017): the
 * referenced step exists in this corpus, and the two steps share at least
 * one concept id — a declared transfer pair has to be probing the same
 * abstraction, or the pairing is a typo rather than a judgement. Whether
 * the transfer itself is a *good* one stays judgement, argued in the
 * steps' own `goal`s, not checkable here — same posture as `rationale`
 * and `obligation` below.
 */
function checkTransferFrom(
  exercise: Exercise,
  step: Step,
  stepsById: ReadonlyMap<string, Step>
): Array<string> {
  if (step.transferFrom === undefined) return []
  const where = locate(exercise, step)

  if (step.transferFrom === step.id) {
    return [
      `${where}: transferFrom references itself — a transfer pair needs two steps.`,
    ]
  }

  const source = stepsById.get(step.transferFrom)
  if (source === undefined) {
    return [
      `${where}: transferFrom "${step.transferFrom}" is not a step id in this corpus.`,
    ]
  }

  const sharesConcept = step.concepts.some((concept) =>
    source.concepts.includes(concept)
  )
  if (!sharesConcept) {
    return [
      `${where}: transferFrom "${step.transferFrom}" shares no concept id with this step — a declared transfer pair must probe the same abstraction.`,
    ]
  }

  return []
}

/** Strips LTY-FRAME's `‹…›` context spans — see `typedPortionOf` in `types/exercise.ts`. */
function typedPortionOf(source: string): string {
  return source.replace(/‹[^›]*›/g, "")
}

/**
 * No two candidates in `rationaleChoices` may share a full prefix
 * (LTY-WHY W2, #1102): if one candidate's text is a prefix of another's,
 * W3's `narrow()` can never disambiguate the shorter one from the longer
 * one before the shorter one is already "complete" — a real bug in the
 * matcher's own contract, not a cosmetic authoring nit. Pairwise, every
 * pair — not just adjacent ones or the first match, the shape most likely
 * to slip past a check that only compares neighbors in authoring order —
 * which is free: `O(n²)` over a set capped at `RATIONALE_CHOICES_MAX`.
 *
 * Equal candidates are caught by the same check: either string trivially
 * starts with the other, which is correct — two identical candidates are
 * exactly the degenerate case of "one is a prefix of the other."
 */
function checkRationaleChoicesNoSharedPrefix(
  exercise: Exercise,
  step: Step
): Array<string> {
  const choices = step.rationaleChoices
  if (choices === undefined) return []
  const where = locate(exercise, step)
  const violations: Array<string> = []
  for (let i = 0; i < choices.length; i++) {
    for (let j = i + 1; j < choices.length; j++) {
      const a = choices[i]
      const b = choices[j]
      if (a === undefined || b === undefined) continue // unreachable: i, j < choices.length
      if (a.text.startsWith(b.text) || b.text.startsWith(a.text)) {
        violations.push(
          `${where}: rationaleChoices candidates "${a.text}" and "${b.text}" share a full ` +
            "prefix. narrow() can never disambiguate the shorter one before it is already " +
            '"complete" — rewrite one so neither candidate is a prefix of the other.'
        )
      }
    }
  }
  return violations
}

function normalizeForSubstringCheck(text: string): string {
  return text.toLowerCase().trim()
}

/** True if either string, case-insensitively, contains the whole of the other. */
function eitherContainsTheOther(a: string, b: string): boolean {
  const normA = normalizeForSubstringCheck(a)
  const normB = normalizeForSubstringCheck(b)
  return (
    normA.length > 0 &&
    normB.length > 0 &&
    (normA.includes(normB) || normB.includes(normA))
  )
}

function normalizeForRestatementCheck(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

/**
 * True if `obligation` literally contains the witness's typed code (token
 * for token, punctuation aside) — "an obligation that is the witness in
 * prose," per the issue's own phrasing. Mechanical on purpose: it catches
 * the witness quoted back verbatim, not a paraphrase that says the same
 * thing in different words — judging *that* is exactly the "for quality"
 * evaluation this lint does not attempt.
 */
function isRestatementOfWitness(
  obligation: string,
  witnessSource: string
): boolean {
  const normObligation = normalizeForRestatementCheck(obligation)
  const normWitness = normalizeForRestatementCheck(
    typedPortionOf(witnessSource)
  )
  return normWitness.length > 0 && normObligation.includes(normWitness)
}

const MEASUREMENT_TERM = /\b(timed out|timeout|slow|fast|took)\b|\b\d+\s?ms\b/i
// Two patterns, not one, because "O(" only means Big-O as a standalone,
// capitalized token: a case-insensitive `O\(` with no boundary also matches
// the tail of an ordinary call like `foo(` (review finding on #1240,
// chatgpt-codex-connector) — a false positive `quadratic`/`linear`/
// `logarithmic` can't produce, so only the symbol needs the extra care.
const CLASS_TERM_WORD = /\b(quadratic|linear|logarithmic)\b/i
const CLASS_TERM_SYMBOL = /Θ|\bO\(/
const SENTENCE_SPLIT = /(?<=[.!?])\s+/

/**
 * Reviewed escape for `checkNoMeasurementEntailmentClaim` (LTY-EXEC X4,
 * Cor. 4.1): a sentence the heuristic below flags that a human has
 * confirmed does not actually infer a class from a measurement (the
 * corpus lint's own acceptance criteria's own example: "it timed out; the
 * cost graph is what says why"). Add an entry only when that is true of
 * the specific sentence — this list is not a way to silence a real one.
 */
const MEASUREMENT_CLAIM_EXEMPTIONS: ReadonlyArray<{
  readonly sentence: string
  readonly reason: string
}> = []

function sentencesOf(text: string): ReadonlyArray<string> {
  return text
    .split(SENTENCE_SPLIT)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0)
}

function isExemptSentence(
  sentence: string,
  exemptions: ReadonlyArray<{ readonly sentence: string }>
): boolean {
  return exemptions.some((exemption) => sentence.includes(exemption.sentence))
}

/**
 * Cor. 4.1's two forbidden inferences ("it timed out, therefore it is
 * Θ(n²)"; "it ran in 4ms, therefore it is Θ(n)"), as a **heuristic** over
 * authored prose (LTY-EXEC X4). The type-level half is X1's `RunResult`
 * (`lib/leetype/run-result`), which no function computing a cost, a class,
 * a proposition or a ledger transition accepts as a parameter; this is the
 * half that catches the same inference made in words, in a corpus sentence
 * that reaches a learner directly and that no type system checks.
 *
 * A sentence flagging both a measurement term and a class term is not
 * thereby *proven* to commit either forbidden inference — only worth a
 * human's attention, which is the honest character a keyword
 * co-occurrence check can have. `exemptions` (the module's own
 * `MEASUREMENT_CLAIM_EXEMPTIONS` by default) is the reviewed escape for a
 * confirmed false positive.
 */
export function checkNoMeasurementEntailmentClaim(
  text: string,
  where: string,
  exemptions: ReadonlyArray<{
    readonly sentence: string
    readonly reason: string
  }> = MEASUREMENT_CLAIM_EXEMPTIONS
): Array<string> {
  const violations: Array<string> = []
  for (const sentence of sentencesOf(text)) {
    if (
      MEASUREMENT_TERM.test(sentence) &&
      (CLASS_TERM_WORD.test(sentence) || CLASS_TERM_SYMBOL.test(sentence)) &&
      !isExemptSentence(sentence, exemptions)
    ) {
      violations.push(
        `${where}: "${sentence}" reads a complexity class off a measurement — Cor. 4.1 ` +
          "(complexity-witness-canon.typ) forbids inferring a class from a run's timing. If " +
          "this sentence does not actually make that inference, add it to " +
          "MEASUREMENT_CLAIM_EXEMPTIONS with a reason."
      )
    }
  }
  return violations
}

/** Every authored prose field of one step, each paired with where it was found (LTY-EXEC X4). */
function proseFieldsOf(
  exercise: Exercise,
  step: Step
): Array<{ where: string; text: string }> {
  const where = locate(exercise, step)
  const fields: Array<{ where: string; text: string }> = [
    { where: `${where} (goal)`, text: step.goal },
  ]

  if (step.rationale !== undefined) {
    fields.push(
      { where: `${where} (rationale.cause)`, text: step.rationale.cause },
      {
        where: `${where} (rationale.whyRepairDiscriminates)`,
        text: step.rationale.whyRepairDiscriminates,
      }
    )
  }

  if (step.obligation !== undefined) {
    fields.push({ where: `${where} (obligation)`, text: step.obligation })
  }

  for (const choice of step.rationaleChoices ?? []) {
    fields.push({ where: `${where} (rationaleChoices)`, text: choice.text })
  }

  for (const block of step.blocks) {
    fields.push(...proseFieldsOfBlock(where, block))
  }

  return fields
}

/** The authored prose carried by one block, keyed by kind — `typing` carries none (it is the witness, not the argument). */
function proseFieldsOfBlock(
  where: string,
  block: Block
): Array<{ where: string; text: string }> {
  switch (block.kind) {
    case "prompt": {
      return block.lines.map((line) => ({
        where: `${where} (prompt block)`,
        text: line,
      }))
    }
    case "transition": {
      const fields = [
        { where: `${where} (transition before)`, text: block.before },
        { where: `${where} (transition after)`, text: block.after },
      ]
      if (block.label !== undefined) {
        fields.push({ where: `${where} (transition label)`, text: block.label })
      }
      return fields
    }
    case "trace": {
      const fields = block.observations.flatMap((observation) => [
        {
          where: `${where} (trace observation label)`,
          text: observation.label,
        },
        {
          where: `${where} (trace observation value)`,
          text: observation.value,
        },
      ])
      if (block.headline !== undefined) {
        fields.push({
          where: `${where} (trace headline)`,
          text: block.headline,
        })
      }
      return fields
    }
    case "region": {
      return [{ where: `${where} (region label)`, text: block.label }]
    }
    case "typing": {
      return []
    }
    default: {
      return assertNever(block)
    }
  }
}

/** Every violation found in one step. Empty means the step is clean. */
function lintStep(
  exercise: Exercise,
  step: Step,
  stepsById: ReadonlyMap<string, Step>
): Array<string> {
  const violations: Array<string> = []
  const where = locate(exercise, step)

  if (step.rationale !== undefined) {
    const result = DiagnosticStepSchema.safeParse(step)
    if (!result.success) {
      for (const issue of result.error.issues) {
        violations.push(`${where}: ${issue.message}`)
      }
    }
    if (
      eitherContainsTheOther(
        step.rationale.cause,
        step.rationale.whyRepairDiscriminates
      )
    ) {
      violations.push(
        `${where}: rationale.cause and rationale.whyRepairDiscriminates say the same ` +
          "thing — one contains the other. Argue two different constraints (what broke, and " +
          "why this repair is the one that fixes it), or the rationale is not auditable " +
          "evidence, just a repeated label."
      )
    }
  }

  if (step.obligation !== undefined) {
    const result = ConstructionStepSchema.safeParse(step)
    if (!result.success) {
      for (const issue of result.error.issues) {
        violations.push(`${where}: ${issue.message}`)
      }
    }
    const witness = typingBlockOf(step)
    if (
      witness !== undefined &&
      isRestatementOfWitness(step.obligation, witness.source)
    ) {
      violations.push(
        `${where}: obligation ("${step.obligation}") quotes the witness's own code back as ` +
          "prose. State the conceptual claim the witness discharges, not what the code already " +
          "says — a restated witness is the description card returning in a new field."
      )
    }
  }

  const evidenceRowCount = evidenceRowsOf(promptBlocksOf(step)).length
  if (evidenceRowCount > EVIDENCE_ROW_BUDGET) {
    violations.push(
      `${where}: ${evidenceRowCount} evidence rows, over PromptPanel's budget of ` +
        `${EVIDENCE_ROW_BUDGET}. Split the step, or this is more prose than the panel's ` +
        "pagination-free path was built to hold."
    )
  }

  if (step.concepts.length === 0) {
    violations.push(
      `${where}: concepts is empty. LTY-ROUTE's graph needs something to attach to — add at ` +
        "least one competency label."
    )
  }

  violations.push(...checkTransferFrom(exercise, step, stepsById))
  violations.push(...checkRationaleChoicesNoSharedPrefix(exercise, step))

  for (const field of proseFieldsOf(exercise, step)) {
    violations.push(
      ...checkNoMeasurementEntailmentClaim(field.text, field.where)
    )
  }

  return violations
}

/**
 * Every violation across the whole corpus. Empty means the corpus is
 * clean. Deterministic order (exercise order, then step order) so a CI
 * failure's diff is stable rather than shuffled between runs.
 */
export function lintCorpus(exercises: ReadonlyArray<Exercise>): Array<string> {
  const stepsById = indexStepsById(exercises)
  const violations: Array<string> = [...checkNoDuplicateStepIds(exercises)]
  for (const exercise of exercises) {
    for (const step of exercise.steps) {
      violations.push(...lintStep(exercise, step, stepsById))
    }
  }
  return violations
}
