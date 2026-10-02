/**
 * The learner shelf, as LeetType sees it: a round the learner made, kept on
 * their account because they asked (paulgsc/server#387; adaptive-learning
 * canon Rem. 7.3). The port, the keep and the screens are shared with
 * TOPIK's lessons (`@some-ui/shared`, `lib/shelf`, which says what every
 * call is held to); what is LeetType's is the key a round is kept under and
 * how a kept body is read back. The body kept is the round
 * (`serializeRound`), never a commitment, an outcome or a count of rounds
 * played, and it is read back through the same intake a pasted round goes
 * through (`intakeRound`, the corpus lint) before it is played.
 */

import { intakeRound } from "@leetype/lib/leetype/generation/intake"
import type { Round } from "@leetype/types/authored-round"
import type { ShelfWords } from "@some-ui/shared"
import { plainShelfKey } from "@some-ui/shared"

export const ROUND_SHELF_WORDS: ShelfWords = {
  noun: "round",
  source: "a round you made",
  unreadable: "it no longer passes the round checks",
  replayFrom: "Make your own",
}

/**
 * The shelf key for a round: its id, held to the shelf's key rule
 * (`plainShelfKey`). `RoundSchema` asks only for a non-empty id, and a model
 * may write any.
 */
export const shelfKeyOf = (roundId: string): string =>
  plainShelfKey(roundId, "round")

/** A kept body as a round to play, or null when the paste's check refuses it. */
export function keptRoundOf(body: unknown): Round | null {
  const intake = intakeRound(JSON.stringify(body))
  return intake.ok ? intake.round : null
}
