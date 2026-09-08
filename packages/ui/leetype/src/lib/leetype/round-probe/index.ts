import { shuffledBySeed } from "@leetype/lib/leetype/deterministic-random"
import {
  isPropositionId,
  PROPOSITION_CLASSIFICATION,
} from "@leetype/lib/leetype/proposition-register/classification"
import type { PropositionId } from "@leetype/lib/leetype/proposition-register/generated"
import { PROPOSITION_REGISTER } from "@leetype/lib/leetype/proposition-register/generated"
import type { PropositionRegisterEntry } from "@leetype/lib/leetype/proposition-register/parse-canon"
import { READING_OPTION_COUNT } from "@leetype/lib/leetype/reading-probe"
import type { DiffSet, DiffSetMember } from "@leetype/types/round"

/**
 * B2 (LTY-PROBE, #1219) — `docs/canon/complexity-witness-canon.typ` Rem.
 * 6.2, Thm. 6.1, Prop. 6.1, Def. 1.6.
 *
 * The round-shaped counterpart to `lib/leetype/reading-probe`'s
 * `claimPoolOf`/`readingProbeOf`, additive rather than a rewrite of it:
 * this module is a new, independent caller of the same small, reusable
 * pieces (`shuffledBySeed`, `READING_OPTION_COUNT`) that never imports the
 * step corpus and nothing existing imports yet, the same posture every
 * other Step 5 story on this relay has held. `reading-probe/index.ts`
 * itself is untouched — B2 is not one of `#1236`'s three named migration
 * points (C5, C1, H1), so a live rewire is explicitly not this story's
 * job.
 *
 * # What actually generalizes, and what does not
 *
 * `readingProbeOf`'s pool was *other steps' own authored claims* — sentences
 * true only because somebody wrote them for that specific step. Here the
 * pool is `P`, the proposition register itself (Rem. 6.2): sentences that
 * are true generally, in the register, independent of any one round.
 * That is the entire generalization the issue asks for — "the option pool
 * becomes register propositions instead of other steps' claims" — and it
 * is why this module owns its own ranking rather than importing
 * `readingProbeOf`'s: a claim's rank keys off `family`/`concepts`, fields a
 * `Claim` carries and a `PropositionRegisterEntry` does not.
 *
 * # The answer is μ(d), not a step's claim
 *
 * Thm. 6.1: given `D` and authored `μ`, the verdict on a selected pair
 * `(d, p)` is the identity `p = μ(d)`. This module poses the *proposition*
 * half of that pair as a discrimination card exactly like the step
 * surface's own: `D`'s one admissible member (Ax. 1.1/Prop. 2.1 —
 * `DiffSetSchema` guarantees exactly one) is the round's own selected
 * diff, `admissibleMemberOf` reads it, and its `propositionId` is the
 * answer. Which *diff* the learner picks among `D` (the other half of
 * Thm. 6.1's pair) is B3's own verdict-rendering job (#1220), not this
 * one's — `RoundProbe` below only ever carries the proposition side.
 *
 * # No `justification` field
 *
 * `ReadingProbe.justification` is a *second* authored sentence
 * (`rationale.whyRepairDiscriminates`) distinct from the answer's own
 * `text`, offered as extra corroboration once a step's answer is
 * identified. Thm. 6.1's own proof gives rounds no second sentence: "its
 * justification is the authored statement of `μ(d)` itself" — which is
 * exactly the answer option's own `text`, already present in `options`.
 * A field that would only ever duplicate `options.find(answerId).text` is
 * not a generalization, it is a redundant copy, so `RoundProbe` omits it.
 */

/** One register proposition, offered as a card option. `id` is a `CW-P` id, stable across the whole register. */
export type PropositionOption = {
  id: PropositionId
  text: string
}

function propositionOptionOf(
  entry: PropositionRegisterEntry
): PropositionOption {
  if (!isPropositionId(entry.id)) {
    throw new Error(
      `propositionOptionOf: "${entry.id}" is not a registered CW-P id — the register is malformed.`
    )
  }
  return { id: entry.id, text: entry.title }
}

/**
 * The whole option pool: every *active* register entry (Rem. 7.1/7.3 — a
 * retired entry is still citable but is no longer taught, so offering one
 * as a live choice would pose a question the register itself no longer
 * stands behind). Unlike `claimPoolOf`, which draws from whichever steps a
 * caller hands it, "the option pool is the register" is B2's own
 * acceptance criterion stated literally — there is no narrower corpus
 * slice to pass in, so this takes the register itself (parameterized only
 * for tests that want a smaller synthetic one).
 */
export function propositionPoolOf(
  register: Readonly<
    Record<PropositionId, PropositionRegisterEntry>
  > = PROPOSITION_REGISTER
): ReadonlyArray<PropositionOption> {
  return Object.values(register)
    .filter((entry) => entry.status === "active")
    .map(propositionOptionOf)
}

/**
 * `D`'s one admissible member (Ax. 1.1, Def. 3.1, Prop. 2.1) — the round's
 * own selected diff, and the source of the answer half of Thm. 6.1's
 * `(d, p)`. `DiffSetSchema`'s own refine already rejects any `DiffSet`
 * with zero or two authored-admissible members at parse time, so a
 * schema-valid `diffSet` always has exactly one; this throws rather than
 * returning `undefined` because a caller reaching this with malformed data
 * has a bug to fix, not a case to degrade through — the same posture
 * `parsePropositionRegister` takes on a malformed canon entry.
 */
function admissibleMemberOf(diffSet: DiffSet): DiffSetMember {
  const admissible = diffSet.filter((member) => member.admissible)
  if (admissible.length !== 1) {
    throw new Error(
      `admissibleMemberOf: diffSet has ${admissible.length} admissible member(s) — Def. 3.1/Prop. 2.1 requires exactly one, and DiffSetSchema should have rejected this diffSet before it reached here.`
    )
  }
  return admissible[0]!
}

/**
 * A round, posed as a proposition-discrimination card.
 *
 * No `family`/`prompt` fields: those exist on `ReadingProbe` because a
 * step's claim comes from one of three differently-worded authored fields
 * (`rationale.cause`/`obligation`/`goal`) and the card's prompt has to
 * match which one. A round's answer is always "which proposition does this
 * diff witness" — one question, not three — so there is nothing for a
 * `family` field to distinguish and nothing for a `prompt` field to vary.
 */
export type RoundProbe = {
  answerId: PropositionId
  options: ReadonlyArray<PropositionOption>
}

/**
 * Builds one round's card from its diff set, the register, and a seed.
 * `pool` defaults to the whole live register (`propositionPoolOf()` — "the
 * option pool is the register" is B2's own acceptance criterion) and is
 * only ever overridden by a test that wants a small, controlled candidate
 * set to isolate one tier of the preference order below, the same reason
 * `readingProbeOf` takes `pool` as a parameter rather than reading a
 * module-level constant.
 *
 * # Preference ordering — stated in full, per this package's own bar
 *
 * A distractor is *another register proposition*, preferring one sharing
 * an input dimension with `μ(d)` (Def. 1.2, Rem. 6.2), then one sharing
 * `μ(d)`'s own structural family (Def. 2.1's grammar —
 * `lib/leetype/proposition-register/classification.ts`), then seed order.
 * Dimension outranks family here, the reverse of `readingProbeOf`'s own
 * family-then-concept order — the issue's own acceptance criterion states
 * it in this order, and it is the more specific signal of the two: two
 * propositions sharing a dimension but not a family are usually a nearer
 * miss (CW-P5 and CW-P13 both turn on the same `m`-shaped hash structure)
 * than two sharing a family but not a dimension (CW-P2 and CW-P12 are both
 * `"loop"` but reason about different quantities).
 *
 * # Prop. 6.1 is not checked here
 *
 * "No two presented options are both true of the selected diff" needs a
 * truth relation between a proposition and a diff that no data structure
 * in this workspace carries yet (`#1284`, filed off R5/#1208's own review:
 * two straight rounds showed every mechanical approximation over `D`
 * alone unsound). This function builds the option-pool structure `#1284`
 * says is the real prerequisite for a sound check; wiring that check
 * against it is `#1284`'s own remaining work, not this story's.
 *
 * # Totality
 *
 * Total for every schema-valid `diffSet`: `admissibleMemberOf` never
 * fails against one (see its own doc comment), and `propositionPoolOf`
 * always has at least the answer itself to fall back to, mirroring
 * `claimOf`'s own totality property for the step surface.
 */
export function roundProbeOf(
  diffSet: DiffSet,
  seed: number,
  optionCount: number = READING_OPTION_COUNT,
  pool: ReadonlyArray<PropositionOption> = propositionPoolOf()
): RoundProbe {
  const answerId = admissibleMemberOf(diffSet).propositionId
  const answerClassification = PROPOSITION_CLASSIFICATION[answerId]
  const answerDimensions = new Set(answerClassification.dimensions)

  const candidates = pool.filter((option) => option.id !== answerId)

  const sharesDimension = (option: PropositionOption): boolean =>
    PROPOSITION_CLASSIFICATION[option.id].dimensions.some((dimension) =>
      answerDimensions.has(dimension)
    )
  const sharesFamily = (option: PropositionOption): boolean =>
    PROPOSITION_CLASSIFICATION[option.id].family === answerClassification.family

  const rank = (option: PropositionOption): number =>
    (sharesDimension(option) ? 0 : 2) + (sharesFamily(option) ? 0 : 1)

  const distractors = shuffledBySeed(candidates, seed)
    .map((option, index) => ({ option, index }))
    .sort((a, b) => rank(a.option) - rank(b.option) || a.index - b.index)
    .slice(0, Math.max(optionCount - 1, 0))
    .map((entry) => entry.option)

  const answerOption = propositionOptionOf(PROPOSITION_REGISTER[answerId])
  const options = shuffledBySeed(
    [answerOption, ...distractors],
    seed ^ 0x27d4eb2f
  )

  return { answerId, options }
}
