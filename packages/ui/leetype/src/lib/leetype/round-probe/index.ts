import { shuffledBySeed } from "@leetype/lib/leetype/deterministic-random"
import type { PropositionId } from "@leetype/lib/leetype/proposition-register/generated"
import { PROPOSITION_REGISTER } from "@leetype/lib/leetype/proposition-register/generated"
import type { PropositionRegisterEntry } from "@leetype/lib/leetype/proposition-register/parse-canon"
import { READING_OPTION_COUNT } from "@leetype/lib/leetype/reading-probe"
import type { DiffSetMember } from "@leetype/types/round"

/**
 * A round posed as a proposition-discrimination card (LTY-PROBE B2): canon
 * Rem. 6.2, Thm. 6.1, Def. 1.6. Seeded by `shuffledBySeed`; offers
 * `READING_OPTION_COUNT` options.
 *
 * The option pool is `P`, the proposition register (Rem. 6.2): sentences
 * true in general, not other steps' authored claims. Two rounds sharing a
 * CW-P proposition therefore offer the same pool.
 *
 * The answer is μ(d) of the *selected* diff, which may be a distractor:
 * Thm. 6.1 / Def. 8.1 let `d` range over the whole presented `D`, so
 * `roundProbeOf` takes the specific member and reads its `propositionId`.
 *
 * # No preference ranking
 *
 * Rem. 6.2 prefers distractors sharing an input dimension, then a structural
 * family. Neither works as a static register-level table: a dimension is
 * one a proposition is *instantiated at in a round*, data this function
 * never sees (#1331); and most register entries are theorems *about* cost
 * graphs, not instances of `W(c)`/`Seq`/`Loop`, so a three-way family split
 * was arbitrary (#1332). Distractors are a uniform seeded sample, still a
 * function of register and seed only.
 *
 * # `justification` and `gloss`
 *
 * `justification` is the answer entry's canon §7 `statement` (Thm. 6.1's
 * "authored statement of `μ(d)` itself"), always present.
 * `gloss` is the round-specific half, *why this diff* instantiates the
 * claim, read from `selectedDiff.propositionGloss`; optional, and a missing
 * one stays visible rather than being generated.
 */

/**
 * One register proposition, offered as a card option. `id` is a `CW-P` id.
 *
 * `text` is the entry's short `title` ("Sequential composition adds"), not
 * the full `statement`: options are compared at a glance, and a paragraph
 * per row would make the card a reading task. The statement is
 * `RoundProbe.justification`, shown for the answer after commitment.
 */
export type PropositionOption = {
  id: PropositionId
  text: string
}

function isPropositionId(value: string): value is PropositionId {
  return Object.hasOwn(PROPOSITION_REGISTER, value)
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
 * The whole option pool: every *active* register entry (Rem. 7.1/7.3: a
 * retired entry is still citable but no longer taught). `register` is a
 * parameter only so tests can pass a synthetic one.
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
 * A round, posed as a proposition-discrimination card. A round always asks
 * the one question `ROUND_PROBE_PROMPT`. For `justification`/`gloss` see the
 * module doc comment.
 */
export type RoundProbe = {
  answerId: PropositionId
  options: ReadonlyArray<PropositionOption>
  justification: string
  gloss?: string
}

/** The one fixed question every round's discrimination card asks. */
export const ROUND_PROBE_PROMPT = "Which proposition does this diff witness?"

/**
 * Builds a card for one diff-set member, `d` in Thm. 6.1's pair `(d, p)`:
 * whichever member the learner is looking at, admissible or not. `pool`
 * defaults to the live register; tests override it. Distractors are a
 * uniform seeded sample of the pool minus the answer (see "No preference
 * ranking" above).
 *
 * Prop. 6.1 ("no two presented options are both true of the selected
 * diff") is not checked: it needs a proposition-to-diff truth relation no
 * data structure carries yet (#1284).
 *
 * A retired answer throws. `PropositionIdSchema` accepts retired ids so old
 * citations keep resolving, but a retired proposition is no longer taught
 * (Rem. 7.3), so it cannot be a live card's answer, matching the
 * distractor-side filter in `propositionPoolOf`. `register` is a parameter
 * so tests can supply a retired entry.
 *
 * Otherwise total: `propositionId` always resolves, and the pool always has
 * at least the answer. `gloss` is omitted, not defaulted, when unauthored.
 */
export function roundProbeOf(
  selectedDiff: DiffSetMember,
  seed: number,
  optionCount: number = READING_OPTION_COUNT,
  pool: ReadonlyArray<PropositionOption> = propositionPoolOf(),
  register: Readonly<
    Record<PropositionId, PropositionRegisterEntry>
  > = PROPOSITION_REGISTER
): RoundProbe {
  const answerId = selectedDiff.propositionId
  const answerEntry = register[answerId]
  if (answerEntry.status !== "active") {
    throw new Error(
      `roundProbeOf: "${answerId}" (${answerEntry.title}) is retired — Rem. 7.1/7.3: still a real citation, but the register no longer teaches it, so it cannot be a live card's answer.`
    )
  }

  const candidates = pool.filter((option) => option.id !== answerId)

  const distractors = shuffledBySeed(candidates, seed).slice(
    0,
    Math.max(optionCount - 1, 0)
  )

  const answerOption = propositionOptionOf(answerEntry)
  const options = shuffledBySeed(
    [answerOption, ...distractors],
    seed ^ 0x27d4eb2f
  )

  return {
    answerId,
    options,
    justification: answerEntry.statement,
    ...(selectedDiff.propositionGloss !== undefined
      ? { gloss: selectedDiff.propositionGloss }
      : {}),
  }
}
