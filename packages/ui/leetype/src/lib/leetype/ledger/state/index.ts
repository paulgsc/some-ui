/**
 * L1's read side (LTY-LEDGER) — `docs/canon/complexity-witness-canon.typ`
 * Def. 10.1, Cor. 10.1; `adaptive-learning-canon.typ` Thm. 5.3, Def. 5.5.
 *
 * The four states are derived here, at read time, from the persisted ledger
 * and `now` (Thm. 5.3). Nothing stores a state: `unseen` is an absent entry,
 * and the other three are computed from the entry each time they are asked
 * for, so decay needs no process and no write.
 *
 * `readEntry` is the whole read model the sampler and the session's summary
 * see. Def. 5.5 keeps the evidence ring from any policy; this module is the
 * fold over it, and what it returns is belief, not raw evidence.
 */

import type { Ledger } from "@leetype/lib/leetype/ledger"
import type { Demonstration } from "@leetype/lib/leetype/ledger/demonstration"
import { demonstrated } from "@leetype/lib/leetype/ledger/demonstration"
import type { Observation } from "@leetype/lib/leetype/ledger/observation"
import { PROPOSITION_REGISTER } from "@leetype/lib/leetype/proposition-register/generated"
import type { PropositionId } from "@leetype/lib/leetype/proposition-register/generated"

/**
 * Def. 10.1, all of it: four states, in order, and no fifth. There is no
 * "mastered", no "needs review", no numeric level and no percentage
 * (Cor. 10.1); a lapsed demonstration reads as `recognized`, not as a fifth
 * state.
 */
export const LEDGER_STATES = [
  "unseen",
  "exposed",
  "recognized",
  "demonstrated",
] as const
export type LedgerState = (typeof LEDGER_STATES)[number]

/**
 * What the surface may say about each state, and nothing more (Cor. 10.1).
 * `recognized` says it is not `demonstrated`, so the two can never read as
 * one quantity. `unseen` has no copy: an entry the learner has not met is
 * not shown.
 */
export const LEDGER_STATE_COPY: Readonly<
  Record<Exclude<LedgerState, "unseen">, string>
> = {
  exposed: "Seen, not yet named correctly.",
  recognized: "Recognized: named correctly at least once. Not demonstrated.",
  demonstrated:
    "Demonstrated: named on different rewrites, rejected where it was wrong, and again in a later session.",
}

/** Def. 10.2's conjuncts, as the "what's left" line names them. */
const OPEN_CONJUNCT_COPY = {
  transfer: "named on different rewrites",
  discrimination: "rejected where it was the wrong answer",
  retention: "named again in a later session",
} as const

/**
 * Which of Def. 10.2's conjuncts are still open, in the canon's order: a
 * projection of `demonstrated`'s separate report, never a count or
 * a fraction. A lapsed demonstration's evidence still meets all three, so
 * what re-establishes it is a later session.
 */
export function whatIsLeft(
  demonstration: Demonstration
): ReadonlyArray<string> {
  if (demonstration.holds) return []
  if (demonstration.decay.lapsed) return [OPEN_CONJUNCT_COPY.retention]
  return (["transfer", "discrimination", "retention"] as const)
    .filter((conjunct) => !demonstration[conjunct].met)
    .map((conjunct) => OPEN_CONJUNCT_COPY[conjunct])
}

/** Everything the ledger says about one entry at `now`. */
export type EntryReading = {
  readonly state: LedgerState
  readonly demonstration: Demonstration
  /** The newest observation filed with `p` as the card's answer; Prop. 9.1's sampler input. */
  readonly latestWitness: Observation | undefined
  /** Rewrites on which `p` has been named correctly; what "a new rewrite of `p`" is measured against. */
  readonly recognizedRewrites: ReadonlySet<string>
}

export function readEntry(
  p: PropositionId,
  ledger: Ledger,
  now: number
): EntryReading {
  const entry = ledger.entries[p]
  const ring = entry?.ring ?? []
  const demonstration = demonstrated(p, ledger, now)
  const witnessed = ring.filter((observation) => observation.role === "witness")
  const recognizedRewrites = new Set(
    witnessed
      .filter((observation) => observation.outcome.kind === "correct")
      .map((observation) => observation.rewriteKey)
  )
  const state: LedgerState =
    entry === undefined
      ? "unseen"
      : demonstration.holds
        ? "demonstrated"
        : entry.recognizedAt !== undefined || recognizedRewrites.size > 0
          ? "recognized"
          : "exposed"
  return {
    state,
    demonstration,
    latestWitness: witnessed.at(-1),
    recognizedRewrites,
  }
}

/** Def. 10.1's state of `p` at `now`. */
export function ledgerStateOf(
  p: PropositionId,
  ledger: Ledger,
  now: number
): LedgerState {
  return readEntry(p, ledger, now).state
}

function isPropositionId(value: string): value is PropositionId {
  return Object.hasOwn(PROPOSITION_REGISTER, value)
}

/** Entries holding an observation from `sessionId`, in register order. */
export function touchedIn(
  ledger: Ledger,
  sessionId: string
): ReadonlyArray<PropositionId> {
  return Object.keys(PROPOSITION_REGISTER)
    .filter(isPropositionId)
    .filter(
      (id) =>
        ledger.entries[id]?.ring.some(
          (observation) => observation.sessionId === sessionId
        ) === true
    )
}

/** The round of the newest observation anywhere in the ledger, if any: the round just played. */
export function lastRoundId(ledger: Ledger): string | undefined {
  let newest: Observation | undefined
  for (const entry of Object.values(ledger.entries)) {
    const candidate = entry.ring.at(-1)
    if (
      candidate !== undefined &&
      (newest === undefined || candidate.at > newest.at)
    ) {
      newest = candidate
    }
  }
  return newest?.roundId
}
