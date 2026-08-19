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
import { ROLE_TYPEABLE } from "@leetype/types/leetype"

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
 * the `concepts`-non-empty tightening, and (LTY-PATCH P6, #1081) whether a
 * `patch` overlay's `lineKinds` actually aligns with the rendered source.
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
 * The one exception, and it is deliberately optional rather than baked in:
 * the `patch.lineKinds` alignment check below can use the engine's real
 * `rendered_source`/`classify_source` (`crates/leetype_wasm/src/lib.rs`)
 * for an exact check, but only when a caller hands one in — this file
 * itself stays engine-free, importing nothing from the wasm crate. The
 * default, used by every `*.test.ts` (which can never load the real
 * binary — see `vitest.config.ts`'s own comment on why), falls back to the
 * same `‹…›`-stripping approximation `typedPortionOf` already uses
 * elsewhere. `scripts/check-corpus-lint.ts`, a plain Node/`tsx` process
 * the vitest alias never touches, hands in the real, stronger check.
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
 * How the `patch.lineKinds` alignment check (LTY-PATCH P6, #1081) reads
 * the engine's rendered form of an authored source. `rolesOf` is optional
 * because the fallback approximation cannot derive it (a plain regex
 * cannot classify `Role::Typeable` vs `Role::Context` the way
 * `Program::compile` does) — when absent, the check still verifies line
 * *count* alignment, just not each line's `add`-vs-not-`add` classification.
 */
export type PatchAlignmentCheck = {
  /** The rendered form of an authored source — `Layout.displaySource`, or an approximation of it. */
  renderedSourceOf: (source: string) => string
  /** Per-rendered-character role, indexed the same as `renderedSourceOf`'s output. Absent under the fallback approximation. */
  rolesOf?: (source: string) => Uint8Array
}

/**
 * The default, engine-free `PatchAlignmentCheck`: strips only the `‹…›`
 * delimiter *characters*, keeping their content — same posture as
 * `typedPortionOf` above, and for the identical reason. Every `*.test.ts`
 * gets this by construction, since it can never load the real wasm binary.
 */
const APPROXIMATE_PATCH_ALIGNMENT_CHECK: PatchAlignmentCheck = {
  renderedSourceOf: (source) => source.replace(/[‹›]/g, ""),
}

/**
 * `patch.lineKinds` (LTY-PATCH P2, #1077) indexes lines of the engine's
 * *rendered* source, not the authored one — the schema-level bound
 * (`patchLineKindsFitSource`, `types/exercise.ts`) only checks that
 * `lineKinds` isn't longer than the authored line count could ever
 * support, deliberately conservative because computing the real rendered
 * form there would mean importing the wasm engine into a file whose whole
 * job is staying engine-free. This is where the exact check actually
 * lands, per that story's own deferral.
 *
 * Two things are checkable, and the story draws the line at exactly these
 * two: whether `lineKinds` has the right number of entries (a count that
 * can only be gotten from the real rendered source, not derived from the
 * authored one), and whether an `add`-marked line actually contains a
 * typeable character while a `context`/`del`-marked line does not — the
 * mixed-line rule (`docs/leetype/README.md`'s LTY-PATCH section) stated as
 * a check. `del` and `context` are not distinguishable this way on
 * purpose: to the engine they are the identical thing (LTY-PATCH P1,
 * #1076), so which one an author meant is exactly the judgment this lint
 * cannot and does not arbitrate.
 */
function checkPatchAlignment(
  exercise: Exercise,
  step: Step,
  check: PatchAlignmentCheck
): Array<string> {
  const typing = typingBlockOf(step)
  const patch = typing?.patch
  if (typing === undefined || patch === undefined) return []
  const where = locate(exercise, step)

  const rendered = check.renderedSourceOf(typing.source)
  const renderedLines = rendered.split("\n")
  const { lineKinds } = patch

  if (lineKinds.length !== renderedLines.length) {
    return [
      `${where}: patch.lineKinds has ${lineKinds.length} entries but the rendered source has ` +
        `${renderedLines.length} line(s) — lineKinds must align exactly with the engine's ` +
        "rendered form (Layout.displaySource), not merely fit inside the authored source's " +
        "line count the schema bounds it by.",
    ]
  }

  const roles = check.rolesOf?.(typing.source)
  if (roles === undefined) return [] // no role classification available — line-count alignment is all the fallback can check

  const violations: Array<string> = []
  let cursor = 0
  renderedLines.forEach((line, index) => {
    // `roles` is indexed by Rust `char` — one entry per Unicode scalar
    // value, not per UTF-16 code unit. `line.length` counts UTF-16 units,
    // so a surrogate-pair character (anything outside the BMP) would
    // overcount by one and drift `cursor` for every line after it.
    // `Array.from(line)` iterates by code point, matching that indexing.
    const lineChars = Array.from(line)
    const hasTypeableChar = lineChars.some(
      (_, offset) => roles[cursor + offset] === ROLE_TYPEABLE
    )
    const kind = lineKinds[index]
    if (kind === undefined) return // unreachable: lengths were checked equal above
    if (kind === "add" && !hasTypeableChar) {
      violations.push(
        `${where}: line ${index} is marked "add" but the engine renders no typeable ` +
          "character on it — nothing here actually needs typing, so it reads as context."
      )
    }
    if (kind !== "add" && hasTypeableChar) {
      violations.push(
        `${where}: line ${index} is marked "${kind}" but the engine renders a typeable ` +
          'character on it — a line with anything to type reads as "add", per the mixed-line rule.'
      )
    }
    cursor += lineChars.length + 1 // +1 for the '\n' consumed between lines
  })
  return violations
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

/** Every violation found in one step. Empty means the step is clean. */
function lintStep(
  exercise: Exercise,
  step: Step,
  stepsById: ReadonlyMap<string, Step>,
  patchAlignmentCheck: PatchAlignmentCheck
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
  violations.push(...checkPatchAlignment(exercise, step, patchAlignmentCheck))
  violations.push(...checkRationaleChoicesNoSharedPrefix(exercise, step))

  return violations
}

/**
 * Every violation across the whole corpus. Empty means the corpus is
 * clean. Deterministic order (exercise order, then step order) so a CI
 * failure's diff is stable rather than shuffled between runs.
 *
 * `patchAlignmentCheck` defaults to the engine-free approximation — see
 * `PatchAlignmentCheck`'s own doc comment for why, and
 * `scripts/check-corpus-lint.ts` for where the real, wasm-backed one gets
 * handed in instead.
 */
export function lintCorpus(
  exercises: ReadonlyArray<Exercise>,
  patchAlignmentCheck: PatchAlignmentCheck = APPROXIMATE_PATCH_ALIGNMENT_CHECK
): Array<string> {
  const stepsById = indexStepsById(exercises)
  const violations: Array<string> = [...checkNoDuplicateStepIds(exercises)]
  for (const exercise of exercises) {
    for (const step of exercise.steps) {
      violations.push(
        ...lintStep(exercise, step, stepsById, patchAlignmentCheck)
      )
    }
  }
  return violations
}
