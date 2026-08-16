import {
  EVIDENCE_ROW_BUDGET,
  evidenceRowsOf,
} from "@leetype/components/typing-game/prompt-panel/rows"
import type { Exercise, Step } from "@leetype/types/exercise"
import {
  ConstructionStepSchema,
  DiagnosticStepSchema,
  promptBlocksOf,
  typingBlockOf,
} from "@leetype/types/exercise"

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
 * Mechanical, and only mechanical, per the issue's own framing: this does
 * not evaluate whether a rationale or an obligation is *good*, only
 * whether the shape and the most literal form of restatement are absent.
 * It runs over `ALL_FIXTURE_EXERCISES` as data — no `PromptPanel`,
 * `CodeDisplay` or any other renderer import — so it stays exactly as
 * cheap as the other CI guardrail scripts it joins
 * (`scripts/check-wasm-bindgen-boundary.sh`,
 * `scripts/check-mutation-boundary.sh`, `docs/canon/scripts/check-citations.sh`).
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
