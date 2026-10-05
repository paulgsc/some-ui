/**
 * Observations (LTY-LEDGER L2): canon Prop. 9.1, Rem. 9.1, Ax. 9.2;
 * `adaptive-learning-canon.typ` Ax. 3.1, Ax. 5.1.
 *
 * What one commitment on a round's proposition card is evidence of, recorded
 * as one of three outcomes and never as a boolean (Prop. 9.1). Rem. 9.1 is
 * the reason this module has no `isCorrect`, no `score` and no helper that
 * maps an outcome to two values: the only signal that tells a misconception
 * (`incorrect`, with *which* proposition was chosen) from a gap (`abstain`)
 * is exactly what a two-valued field would fold away, and the sampler
 * (`lib/leetype/round-sampler`, Prop. 9.1's three different next rounds) is
 * the reader that needs it. A consumer that wants "was it right" switches on
 * `outcome.kind` and handles all three.
 *
 * # Only pre-reveal commitments reach here (Ax. 9.2)
 *
 * `RoundChoices` fires `onCommit` before its own verdict paints, and the
 * rewrite cards show no μ and no admissibility before that, so the pair it
 * commits is unassisted. The learner's own pasted round is never recorded:
 * its JSON carried every member's μ, so its card was answered with the key
 * in hand (see `RoundSession`).
 */

import type { PropositionId } from "@leetype/lib/leetype/proposition-register/generated"
import type { Commitment } from "@leetype/types/commitment"
import { PropositionIdSchema } from "@leetype/types/round"
import { assertNever } from "some-ui-utils"
import { z } from "zod"

/**
 * Prop. 9.1's three observations. `incorrect` carries the proposition the
 * learner chose: *which* wrong proposition is the content of the
 * misconception, and it is what a discriminating counter-instance is
 * built from.
 *
 * Shaped for X3's predictions as well: a prediction is a commitment
 * from a closed set with an abstention, over options that are register
 * entries, so it lands in these same three cases with `chosen` the entry its
 * chosen option asserts. It will add a `source`, not an outcome.
 */
const OutcomeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("correct") }),
  z.object({ kind: z.literal("incorrect"), chosen: PropositionIdSchema }),
  z.object({ kind: z.literal("abstain") }),
])
type Outcome = z.infer<typeof OutcomeSchema>

/**
 * How the ledger entry an observation is filed under relates to the card:
 *
 * - `witness`: the entry is μ(d), the card's answer.
 * - `distractor`: the entry was presented on the card as an option and was
 *   not μ(d). Under this role `correct` is a correct *rejection* of the
 *   entry (L3's negative discrimination), and `incorrect` with `chosen`
 *   equal to the entry is the entry selected where it was wrong
 *   (Prop. 10.1's failure mode).
 */
const ObservationRoleSchema = z.enum(["witness", "distractor"])

/**
 * One observation, as the ledger's evidence ring holds it (Def. 5.5).
 *
 * - `propositionId`: μ(d), the answer of the card the commitment was on.
 * - `rewriteKey`: `rewriteKeyOf` of `(G_A, G_{A+d})` for the chosen diff,
 *   so structural distinctness (Def. 10.2 (1)) is read off the rewrite,
 *   never off `roundId`.
 * - `sessionId`: the `RoundSession` session it was recorded in; one half of
 *   L3's session boundary.
 * - `at`: epoch milliseconds. Ax. 5.1 of the sibling canon requires every
 *   observation to carry its own timestamp and the fold to run in
 *   timestamp order; decay (Thm. 5.3) is a function of it.
 */
export const ObservationSchema = z.object({
  outcome: OutcomeSchema,
  propositionId: PropositionIdSchema,
  role: ObservationRoleSchema,
  roundId: z.string().min(1),
  rewriteKey: z.string().min(1),
  sessionId: z.string().min(1),
  at: z.number().int().nonnegative(),
})
export type Observation = z.infer<typeof ObservationSchema>

/** An observation and the ledger entry it is filed under. */
export type FiledObservation = {
  readonly about: PropositionId
  readonly observation: Observation
}

/** One commitment on a round's proposition card, as `RoundSession` has it. */
type CardCommitment = {
  /** μ(d) for the chosen diff: `RoundProbe.answerId`. */
  readonly answerId: PropositionId
  /** Every option the card presented, the answer among them. */
  readonly presented: ReadonlyArray<PropositionId>
  readonly commitment: Commitment
  readonly roundId: string
  readonly rewriteKey: string
  readonly sessionId: string
  readonly at: number
}

function isPresented(
  id: string,
  presented: ReadonlyArray<PropositionId>
): id is PropositionId {
  return presented.some((option) => option === id)
}

function outcomeOf(
  commitment: Commitment,
  answerId: PropositionId,
  presented: ReadonlyArray<PropositionId>
): Outcome {
  switch (commitment.kind) {
    case "abstain": {
      return { kind: "abstain" }
    }
    case "choice": {
      if (commitment.id === answerId) return { kind: "correct" }
      if (!isPresented(commitment.id, presented)) {
        throw new Error(
          `observationsOfCommitment: "${commitment.id}" was not an option on this card.`
        )
      }
      return { kind: "incorrect", chosen: commitment.id }
    }
    default: {
      return assertNever(commitment)
    }
  }
}

/**
 * The observations one card commitment files: one under μ(d) as `witness`,
 * and one under every other presented option as `distractor`, all with the
 * same outcome. Filing under the distractors is what makes a correct
 * rejection (L3) and "chose p where p was wrong" readable per entry; it is
 * also what `exposed` means (Def. 10.1: the entry has been presented). The
 * rewrite cards' own μ are never shown, so a proposition that was only the
 * μ of an unchosen diff was not presented and files nothing.
 *
 * Throws on a choice that was not on the card: that is a caller bug, and a
 * silently misfiled observation is worse than a loud one.
 */
export function observationsOfCommitment(
  card: CardCommitment
): ReadonlyArray<FiledObservation> {
  const outcome = outcomeOf(card.commitment, card.answerId, card.presented)
  const observation = (
    role: z.infer<typeof ObservationRoleSchema>
  ): Observation => ({
    outcome,
    propositionId: card.answerId,
    role,
    roundId: card.roundId,
    rewriteKey: card.rewriteKey,
    sessionId: card.sessionId,
    at: card.at,
  })
  return [
    { about: card.answerId, observation: observation("witness") },
    ...[...new Set(card.presented)]
      .filter((id) => id !== card.answerId)
      .map((id) => ({ about: id, observation: observation("distractor") })),
  ]
}
