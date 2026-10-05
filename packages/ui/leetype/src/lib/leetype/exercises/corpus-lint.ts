import {
  EVIDENCE_ROW_BUDGET,
  evidenceRowsOf,
} from "@leetype/components/typing-game/prompt-panel/rows"
import type { Citation } from "@leetype/lib/leetype/proposition-register/citation-check"
import {
  checkCitations,
  checkRegisterCoverage,
} from "@leetype/lib/leetype/proposition-register/citation-check"
import { PROPOSITION_REGISTER } from "@leetype/lib/leetype/proposition-register/generated"
import type { PropositionRegisterEntry } from "@leetype/lib/leetype/proposition-register/parse-canon"
import type { ConstraintSet } from "@leetype/types/constraint"
import { ConstraintSetSchema } from "@leetype/types/constraint"
import type { Block, Exercise, Step } from "@leetype/types/exercise"
import {
  ConstructionStepSchema,
  DiagnosticStepSchema,
  promptBlocksOf,
  typingBlockOf,
} from "@leetype/types/exercise"
import type { DiffSet } from "@leetype/types/round"
import { DiffSetSchema } from "@leetype/types/round"
import { assertNever } from "some-ui-utils"

/**
 * The corpus lint (LTY-FAMILIES A5): "no judgment is allowed unless it can
 * produce its own justification," as a CI failure.
 *
 * `rationale` and `obligation` are optional on the generic `StepSchema` so
 * they survive the generic `ExerciseCorpusSchema.parse`, which therefore
 * never re-checks a step against `DiagnosticStepSchema` or
 * `ConstructionStepSchema`. This module does, plus checks no schema can
 * express: whether `rationale`'s two fields argue different things, whether
 * `obligation` restates its witness, and non-empty `concepts`.
 *
 * Mechanical only: it does not judge whether a rationale or obligation is
 * *good*. It runs over `ALL_FIXTURE_EXERCISES` as data, with no renderer
 * import and no Rust toolchain, as cheap as the sibling guardrail scripts.
 *
 * Deliberately left to review (not mechanizable without false positives or
 * a toolchain):
 *
 * - Near-duplicate *registered* concept ids (`concepts.test.ts` catches only
 *   unregistered ones); a fuzzy threshold would flag deliberately similar
 *   concepts such as `loopProgress`/`windowShrinking`.
 * - Whether a `trace` observation's number names the exact quantity its
 *   label claims; that needs executing or hand-tracing the code.
 * - Whether a diagnostic step's `-` side compiles; that needs `cargo` in CI.
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
 * No two steps in the corpus share an id: `indexStepsById`'s `Map` would
 * otherwise let a later step shadow an earlier one and check `transferFrom`
 * against the wrong step. The schema checks uniqueness only within one
 * exercise.
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
 * `transferFrom`'s mechanical checks (LTY-SEAM S3): the referenced step
 * exists, and the two steps share at least one concept id (otherwise the
 * pairing is a typo, not a judgement).
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
 * No candidate in `rationaleChoices` may be a prefix of another (LTY-WHY
 * W2): `narrow()` could never tell the shorter one apart before it is
 * already "complete". Every pair is compared, not just neighbours; `O(n²)`
 * over at most `RATIONALE_CHOICES_MAX`. Equal candidates are the degenerate
 * case and are caught too.
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
 * for token, punctuation aside). Catches a verbatim quote, not a paraphrase.
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
// Two patterns: "O(" is Big-O only as a standalone, case-sensitive token;
// a case-insensitive `O\(` would also match the tail of a call like `foo(`.
const CLASS_TERM_WORD = /\b(quadratic|linear|logarithmic)\b/i
const CLASS_TERM_SYMBOL = /Θ|\bO\(/
const SENTENCE_SPLIT = /(?<=[.!?])\s+/

/**
 * Reviewed escape for `checkNoMeasurementEntailmentClaim` (LTY-EXEC X4,
 * Cor. 4.1): a flagged sentence a human confirmed does not infer a class
 * from a measurement (e.g. "it timed out; the cost graph is what says why").
 * Not a way to silence a real one.
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
 * authored prose (LTY-EXEC X4). The type-level half is `RunResult`
 * (`lib/leetype/run-result`), which no cost/class/proposition/ledger
 * function accepts; this catches the same inference made in words.
 *
 * A sentence with both a measurement term and a class term is only worth a
 * human's attention, not proven guilty. `exemptions` (default
 * `MEASUREMENT_CLAIM_EXEMPTIONS`) is the reviewed escape.
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

// `Θ(`/`Ω(` never end an ordinary identifier; `O(` needs `\b` (see
// `CLASS_TERM_SYMBOL`).
const ASSERTED_CLASS_LITERAL = /Θ\(|Ω\(|\bO\(/

/**
 * Reviewed escape for `checkNoAssertedComplexityClassLiteral` (Prop. 2.1):
 * a sentence directly quoting a `CW-P` proposition's canonical wording,
 * which uses `Θ(...)` as notation (e.g. `CW-P11`'s "cannot change Θ(T)").
 * Never for an author's own claim about a round.
 */
const ASSERTED_CLASS_LITERAL_EXEMPTIONS: ReadonlyArray<{
  readonly sentence: string
  readonly reason: string
}> = []

/**
 * Prop. 2.1 ("a round ... never authors the `Θ`-class directly"), made
 * mechanical: a bare `Θ(`, `O(` or `Ω(` in authored prose is an unjustified
 * judgement. Classes come from the cost graph (`lib/leetype/cost`,
 * `lib/leetype/admissibility`); `printClass` is the only producer. Pattern
 * match with a reviewed per-sentence escape, like the check above.
 */
export function checkNoAssertedComplexityClassLiteral(
  text: string,
  where: string,
  exemptions: ReadonlyArray<{
    readonly sentence: string
    readonly reason: string
  }> = ASSERTED_CLASS_LITERAL_EXEMPTIONS
): Array<string> {
  const violations: Array<string> = []
  for (const sentence of sentencesOf(text)) {
    if (
      ASSERTED_CLASS_LITERAL.test(sentence) &&
      !isExemptSentence(sentence, exemptions)
    ) {
      violations.push(
        `${where}: "${sentence}" asserts a complexity class as a literal — Prop. 2.1 ` +
          "(complexity-witness-canon.typ) forbids authoring a Θ/O/Ω-class directly; it must be " +
          "derived from a cost graph via evaluate/isAdmissible/printClass " +
          "(lib/leetype/admissibility, lib/leetype/cost) instead. If this sentence is quoting a " +
          "CW-P register proposition's own canonical wording rather than asserting a claim about " +
          "a specific round, add it to ASSERTED_CLASS_LITERAL_EXEMPTIONS with a reason."
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
    violations.push(
      ...checkNoAssertedComplexityClassLiteral(field.text, field.where)
    )
  }

  return violations
}

/**
 * Every violation across the whole corpus. Empty means clean. Deterministic
 * order (exercise, then step) so a CI failure's diff is stable.
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

/**
 * The round-corpus counterpart of the lint above (R5): a malformed round
 * fails with a message naming the invariant (canon Ax. 1.1, Rem. 1.1,
 * Rem. 7.1, Rem. 10.2, Prop. 6.1).
 *
 * The slice of Def. 1.7's round tuple `(A, C, B, D, mu, r)` these checks
 * touch: `C` and `D`, with `mu` folded into each `D` member as
 * `propositionId`. No check needs a cost graph or a budget.
 */
export type RoundCorpusEntry = {
  readonly id: string
  readonly constraints: ConstraintSet
  readonly diffSet: DiffSet
}

/**
 * The corpus-wide bound on presentable alternatives: Thm. 10.1's inclusive
 * `k <= 5` (five is a valid, maximal round). Separate from
 * `RATIONALE_CHOICES_MAX`, which bounds a different UI that happens to share
 * the number. `checkCardinality` compares with `<=`, not Ax. 1.1's strict
 * `< N`, because this is Thm. 10.1's ceiling, not that `N`.
 */
export const MAX_PRESENTABLE_DIFFS = 5

function locateRound(round: RoundCorpusEntry): string {
  return `round "${round.id}"`
}

/**
 * Ax. 1.1 / Rem. 1.1's inequality `0 < |C| <= |D| < N` over one round, with
 * `N` as `MAX_PRESENTABLE_DIFFS` (compared with `<=`; see there). Not a
 * schema refinement because it compares `C` against `D`.
 */
function checkCardinality(round: RoundCorpusEntry): Array<string> {
  const violations: Array<string> = []
  const where = locateRound(round)
  const constraintCount = round.constraints.length
  const diffCount = round.diffSet.length

  if (!(constraintCount > 0)) {
    violations.push(
      `${where}: |C| = ${constraintCount} — Ax. 1.1 requires at least one live constraint (0 < |C|); an empty C leaves Def. 3.1's admissibility with nothing to quantify over.`
    )
  }
  if (!(constraintCount <= diffCount)) {
    violations.push(
      `${where}: |C| = ${constraintCount} > |D| = ${diffCount} — Ax. 1.1/Rem. 1.1 requires |C| <= |D|; a constraint no candidate diff responds to means the round is either decorative or under-authored.`
    )
  }
  if (!(diffCount <= MAX_PRESENTABLE_DIFFS)) {
    violations.push(
      `${where}: |D| = ${diffCount} > N = ${MAX_PRESENTABLE_DIFFS} — Ax. 1.1 bounds the diff set to what can be read in full; an unbounded D turns selection into a search, the blocking regime Axiom P.1 forbids.`
    )
  }
  return violations
}

/**
 * Re-validates a round's `C` and `D` through their strict schemas, as
 * `lintStep` does for steps. "Exactly one member of D is admissible"
 * (Ax. 1.1) is enforced here, by `DiffSetSchema`'s own refine.
 */
function checkRoundSchemas(round: RoundCorpusEntry): Array<string> {
  const violations: Array<string> = []
  const where = locateRound(round)

  const constraintsResult = ConstraintSetSchema.safeParse(round.constraints)
  if (!constraintsResult.success) {
    for (const issue of constraintsResult.error.issues) {
      violations.push(`${where}: ${issue.message}`)
    }
  }

  const diffSetResult = DiffSetSchema.safeParse(round.diffSet)
  if (!diffSetResult.success) {
    for (const issue of diffSetResult.error.issues) {
      violations.push(`${where}: ${issue.message}`)
    }
  }

  return violations
}

/**
 * Prop. 6.1 ("injectivity is not required; discriminability is") is
 * deliberately unchecked. Flagging `D` members that share a `propositionId`
 * rejects data Def. 1.6 permits ("mu need not be injective"), and so does
 * restricting that to members sharing the admissible member's id: Def. 8.1's
 * admissibility and Thm. 6.1's verdict `p = mu(d)` are orthogonal. The real
 * check needs a presented option set of *propositions* (Thm. 6.1), which
 * `RoundCorpusEntry` does not carry; follow-up tracked from #1208.
 */

/** Every `CW-P` id a round cites, as a `Citation` locating it within that round's own D. */
function citationsOfRound(round: RoundCorpusEntry): Array<Citation> {
  return round.diffSet.map((member, index) => ({
    id: member.propositionId,
    file: round.id,
    line: index + 1,
  }))
}

/**
 * Prop. 10.1: the corpus owes each active proposition at least one round
 * where it is a distractor, i.e. some non-admissible member's
 * `propositionId` (Cor. 5.1). Positive transfer alone is not identifying
 * (Thm. 10.1). Distinct from `checkRegisterCoverage` (Rem. 7.1: any
 * appearance at all). Reports every uncovered entry.
 *
 * Rem. 10.2's fuller form (the proposition in a presented option set of a
 * round whose admissible member differs) needs data `RoundCorpusEntry` does
 * not carry; same follow-up as Prop. 6.1 above.
 */
function checkDistractorCoverage(
  rounds: ReadonlyArray<RoundCorpusEntry>,
  register: Readonly<Record<string, PropositionRegisterEntry>>
): Array<string> {
  const distractorIds = new Set<string>()
  for (const round of rounds) {
    for (const member of round.diffSet) {
      if (!member.admissible) {
        distractorIds.add(member.propositionId)
      }
    }
  }

  const violations: Array<string> = []
  for (const entry of Object.values(register)) {
    if (entry.status === "active" && !distractorIds.has(entry.id)) {
      violations.push(
        `${entry.id} (${entry.title}) is an active proposition register entry with no round ` +
          "where it is presented purely as a distractor (Rem. 10.2, Prop. 10.1) — positive " +
          "transfer alone is not identifying; the corpus owes at least one round where this " +
          "proposition loses to a different true witness."
      )
    }
  }
  return violations
}

/**
 * Prop. 2.1's "no round anywhere holds a Θ string" is unconditional, so this
 * scans every authored prose field on each member *and* every hunk segment:
 * a segment is code, but can carry a comment like `// this repair is
 * Θ(n log n)`.
 */
function checkRoundProseForClassLiterals(
  round: RoundCorpusEntry
): Array<string> {
  const violations: Array<string> = []
  round.diffSet.forEach((member, index) => {
    for (const [field, text] of [
      ["distractorStatement", member.distractorStatement],
      ["propositionGloss", member.propositionGloss],
    ] as const) {
      if (text !== undefined) {
        violations.push(
          ...checkNoAssertedComplexityClassLiteral(
            text,
            `${locateRound(round)}, diff-set member ${index} (${field})`
          )
        )
      }
    }
    member.hunk.segments.forEach((segment, segmentIndex) => {
      violations.push(
        ...checkNoAssertedComplexityClassLiteral(
          segment.text,
          `${locateRound(round)}, diff-set member ${index}, hunk segment ${segmentIndex}`
        )
      )
    })
  })
  return violations
}

/**
 * The per-round half of `lintRoundCorpus`: schemas, cardinality, no asserted
 * class literal, and citation resolution, without the register-wide coverage
 * checks. Used alone for authored rounds (`round-assembly`'s
 * `lintAuthoredRounds`), which do not yet cover the register.
 */
export function lintRoundEntries(
  rounds: ReadonlyArray<RoundCorpusEntry>
): Array<string> {
  const violations: Array<string> = []

  for (const round of rounds) {
    violations.push(...checkRoundSchemas(round))
    violations.push(...checkCardinality(round))
    violations.push(...checkRoundProseForClassLiterals(round))
  }

  const allCitations = rounds.flatMap((round) => citationsOfRound(round))
  violations.push(...checkCitations(allCitations, PROPOSITION_REGISTER))

  return violations
}

/**
 * Every violation across the whole round corpus (R5). Empty means clean.
 * Deterministic order: per-round checks in round order, then the two
 * corpus-wide coverage checks. Prop. 6.1 is not wired in (see above
 * `citationsOfRound`).
 */
export function lintRoundCorpus(
  rounds: ReadonlyArray<RoundCorpusEntry>
): Array<string> {
  const violations = lintRoundEntries(rounds)

  // Coverage counts μ on *any* member of D, admissible or not: Rem. 10.2
  // asks for "at least one round with it as μ(d)" with no condition on d,
  // and Thm. 6.1 scores p = μ(d) for whichever d is selected. An
  // admissible-only reading would make CW-P4, P8, P9, P11 and P16 (each "a
  // rewrite *cannot* restore admissibility") uninstantiable.
  const citedIds = new Set(
    rounds.flatMap((round) =>
      round.diffSet.map((member) => member.propositionId)
    )
  )
  violations.push(...checkRegisterCoverage(citedIds, PROPOSITION_REGISTER))
  violations.push(...checkDistractorCoverage(rounds, PROPOSITION_REGISTER))

  return violations
}
