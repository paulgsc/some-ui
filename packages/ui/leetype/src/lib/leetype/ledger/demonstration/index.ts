/**
 * Demonstration (LTY-LEDGER L3): canon Def. 10.2, Thm. 10.1, Cor. 10.1,
 * Prop. 10.1; lapse from `adaptive-learning-canon.typ` Def. 5.4, Thm. 5.3.
 *
 * `demonstrated(p, ledger, now)` evaluates Def. 10.2's conjunction over
 * whatever the ledger reads back and reports each conjunct on its own, so a
 * "what's left" view is a projection, never an opaque boolean.
 *
 * # The three conjuncts, concretely
 *
 * Everything below is read off observations `RoundSession` files through
 * `observationsOfCommitment` (`lib/leetype/ledger/observation`).
 *
 * 1. *Positive transfer*: `witness` observations with outcome `correct`
 *    (the learner named μ(d) for the diff they chose) on at least
 *    `TRANSFER_REWRITES` distinct `rewriteKey`s, each from a different
 *    round. The key is `rewriteKeyOf` over `(G_A, G_{A+d})`
 *    (`lib/leetype/rewrite`), so three rounds carrying one rewrite are one
 *    piece of evidence whatever their ids, programs or dimension names; and
 *    one round offering three rewrites of `p` is one round. The count is a
 *    maximum matching of rounds to keys (`roundsPairedWithRewrites`).
 * 2. *Negative discrimination* (Prop. 10.1): at least one *correct
 *    rejection* — a `distractor` observation with outcome `correct`: `p` was
 *    presented on the card, a different proposition was μ(d), and the
 *    learner committed to that one. This is Rem. 10.2's shape read at run
 *    time ("in the presented option set where μ(d) is something else"), and
 *    it is exactly the observation Prop. 10.1's always-select-`p` learner
 *    can never produce: offered `p` where `p` is wrong, they take it.
 *    Passing over `p`'s rewrite in `D` does not count: choosing a rewrite
 *    can be settled from cost alone. "Nearby" is whatever the card puts
 *    beside the true witness (a seeded register sample until Rem. 6.2's
 *    preferences land, #1331, #1332).
 * 3. *Retention*: the qualifying observations of (1) and (2) fall into at
 *    least two *spaced sessions*. A session boundary separates two
 *    observations when their `sessionId`s differ **and** they are at least
 *    `SPACED_RETRIEVAL_MIN_GAP_MS` apart; `RoundSession` mints a session id
 *    per mount and per Restart. The gap is part of the definition because
 *    Restart is a new session one tap later, and an answer given a minute
 *    after the last one is working memory, not retention.
 *
 * `demonstrated` cannot hold from a single session, by construction: one
 * session id is one spaced session, and (3) needs two.
 *
 * # Lapse (Def. 5.4, Thm. 5.3)
 *
 * A demonstration that held lapses back to `recognized` when its newest
 * qualifying observation is older than the window its stability supports.
 * Stability `λ` is Def. 5.4's: walking the entry's graded observations
 * (qualifying ones, and confident errors about `p` — a `witness` answered
 * `incorrect`, or a `distractor` where `p` itself was chosen) in spaced
 * sessions, a session with a success and no confident error raises `λ` by
 * one, and a session with a confident error lowers it by one (floor 0).
 * An abstention is neither (Prop. 9.1: a gap, not a failure). The window is
 * `RETENTION_WINDOW_BASE_MS × 2^(λ − 2)`, capped at
 * `RETENTION_WINDOW_MAX_MS`. Evaluated at read time from stored timestamps
 * and `now`; nothing is ever written to make it happen.
 */

import type { Ledger } from "@leetype/lib/leetype/ledger"
import type { Observation } from "@leetype/lib/leetype/ledger/observation"
import type { PropositionId } from "@leetype/lib/leetype/proposition-register/generated"

/**
 * Distinct rewrites Def. 10.2 (1) asks for, derived rather than picked.
 *
 * Thm. 10.1: under the null of a uniform guess over a card's `k` options a
 * correct selection has probability `1/k`, and at most 1 under competence,
 * so it multiplies the odds for competence by at most `k`. This design has
 * `k ≤ 5`, and the card today offers `k = 4` (`READING_OPTION_COUNT`).
 * Observations on *distinct* rewrites are what licenses treating them as
 * independent trials; the same rewrite again is the same question again.
 *
 * - one correct selection: at most 4 (5 at `k = 5`). Not sufficient.
 * - `T` transfers and the one rejection of (2), itself a correct card:
 *   at most `k^(T+1)`.
 * - Jeffreys' scale calls a likelihood ratio above 100 decisive. `T + 1 ≥
 *   log 100 / log 4 = 3.32` at the card's own `k = 4`, so `T = 3` is the
 *   smallest count at which the conjunction can carry decisive evidence at
 *   all: `4^4 = 256` (`5^4 = 625` at `k = 5`), where `T = 2` tops out at
 *   `4^3 = 64`.
 *
 * These are ceilings, reached only by a learner who is never wrong, which
 * is why the threshold is the smallest count whose ceiling clears 100 and
 * not a larger count that merely feels safer. Retention (3) is a further
 * condition on the same observations, not an extra factor in this bound.
 */
export const TRANSFER_REWRITES = 3

/** Def. 10.2 (2): one correct rejection. Prop. 10.1 makes it mandatory; the canon asks for one. */
export const DISCRIMINATION_REJECTIONS = 1

/** Def. 10.2 (3): "at least two ... separated by a session boundary". */
const RETENTION_SESSIONS = 2

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

/**
 * The least gap that makes two sessions spaced: 12 hours. SM-2's shortest
 * interval is one day, and half of it lets a morning and an evening
 * session count while back-to-back sittings do not — the session term is
 * ten minutes by default and Restart mints a new session at once, so
 * without a gap two "sessions" can be seconds apart.
 */
export const SPACED_RETRIEVAL_MIN_GAP_MS = 12 * HOUR_MS

/**
 * The window a demonstration holds at `λ = 2`, the stability of exactly
 * two successful spaced sessions (the least retention allows): 6 days,
 * SM-2's second interval, which is where that schedule places the second
 * successful retrieval's next review. Past it, a review is due and the
 * evidence no longer supports "demonstrated".
 */
export const RETENTION_WINDOW_BASE_MS = 6 * DAY_MS

/**
 * Each successful spaced session doubles the window; each one with a
 * confident error halves it. 2 sits inside SM-2's ease range (1.3 floor,
 * 2.5 default) and below its default, because `λ` counts sessions rather
 * than graded reviews and a session's success may include a guess.
 */
const RETENTION_WINDOW_GROWTH = 2

/**
 * No window beyond a year: a 16-observation ring (`RING_CAPACITY`) cannot
 * hold evidence that supports a claim across a longer absence, and the
 * sibling canon's Cor. 5.1 wants a returning learner re-measured.
 */
export const RETENTION_WINDOW_MAX_MS = 365 * DAY_MS

export type Demonstration = {
  /** Def. 10.2 (1). */
  readonly transfer: {
    readonly met: boolean
    /** Correct transfers paired with a distinct round *and* a distinct rewrite key. */
    readonly distinctRewrites: number
  }
  /** Def. 10.2 (2). */
  readonly discrimination: {
    readonly met: boolean
    readonly rejections: number
  }
  /** Def. 10.2 (3). */
  readonly retention: { readonly met: boolean; readonly spacedSessions: number }
  /**
   * Def. 5.4's decay at `now`. `lapsed` is true only when the conjunction
   * holds on the evidence and the window has closed; `expiresAt` is null
   * while there is no qualifying observation.
   */
  readonly decay: {
    readonly stability: number
    readonly expiresAt: number | null
    readonly lapsed: boolean
  }
  /** All three conjuncts, and not lapsed. */
  readonly holds: boolean
}

/**
 * Def. 10.2 (1) asks for `T` rounds *and* `T` structurally distinct
 * rewrites, so a transfer counts only when it can be paired with a round
 * and a rewrite key no other counted transfer uses: the size of a maximum
 * matching between the rounds and the rewrite keys the correct witness
 * observations connect. One round whose `D` holds three differently shaped
 * rewrites of `p` is one round, not three; three rounds
 * sharing one rewrite are one rewrite. Kuhn's augmenting paths; the ring
 * holds at most `RING_CAPACITY` observations, so this is a few hundred steps.
 */
function roundsPairedWithRewrites(
  transfers: ReadonlyArray<Observation>
): number {
  const keysOfRound = new Map<string, Set<string>>()
  for (const { roundId, rewriteKey } of transfers) {
    const keys = keysOfRound.get(roundId) ?? new Set<string>()
    keys.add(rewriteKey)
    keysOfRound.set(roundId, keys)
  }
  const roundOfKey = new Map<string, string>()
  const augment = (roundId: string, seen: Set<string>): boolean => {
    for (const key of keysOfRound.get(roundId) ?? []) {
      if (seen.has(key)) continue
      seen.add(key)
      const holder = roundOfKey.get(key)
      if (holder === undefined || augment(holder, seen)) {
        roundOfKey.set(key, roundId)
        return true
      }
    }
    return false
  }
  let paired = 0
  for (const roundId of keysOfRound.keys()) {
    if (augment(roundId, new Set())) paired += 1
  }
  return paired
}

function isTransfer(observation: Observation): boolean {
  return (
    observation.role === "witness" && observation.outcome.kind === "correct"
  )
}

function isRejection(observation: Observation): boolean {
  return (
    observation.role === "distractor" && observation.outcome.kind === "correct"
  )
}

/** A confident error about `p`: missed it as the witness, or chose it where it was wrong. */
function isConfidentError(p: PropositionId, observation: Observation): boolean {
  if (observation.outcome.kind !== "incorrect") return false
  return observation.role === "witness" || observation.outcome.chosen === p
}

/**
 * Groups timestamp-ordered observations into spaced sessions: a new one
 * starts where the session id changes after a gap of at least
 * `SPACED_RETRIEVAL_MIN_GAP_MS` from the previous observation.
 */
function spacedSessionsOf(
  observations: ReadonlyArray<Observation>
): ReadonlyArray<ReadonlyArray<Observation>> {
  const sessions: Array<Array<Observation>> = []
  for (const observation of observations) {
    const current = sessions.at(-1)
    const previous = current?.at(-1)
    if (
      current === undefined ||
      previous === undefined ||
      (observation.sessionId !== previous.sessionId &&
        observation.at - previous.at >= SPACED_RETRIEVAL_MIN_GAP_MS)
    ) {
      sessions.push([observation])
    } else {
      current.push(observation)
    }
  }
  return sessions
}

function stabilityOf(
  p: PropositionId,
  ring: ReadonlyArray<Observation>
): number {
  const graded = ring.filter(
    (observation) =>
      isTransfer(observation) ||
      isRejection(observation) ||
      isConfidentError(p, observation)
  )
  let stability = 0
  for (const session of spacedSessionsOf(graded)) {
    if (session.some((observation) => isConfidentError(p, observation))) {
      stability = Math.max(0, stability - 1)
    } else {
      stability += 1
    }
  }
  return stability
}

function retentionWindowMs(stability: number): number {
  return Math.min(
    RETENTION_WINDOW_BASE_MS * RETENTION_WINDOW_GROWTH ** (stability - 2),
    RETENTION_WINDOW_MAX_MS
  )
}

/** Def. 10.2 for `p`, at `now`, each conjunct reported on its own. */
export function demonstrated(
  p: PropositionId,
  ledger: Ledger,
  now: number
): Demonstration {
  const ring = ledger.entries[p]?.ring ?? []
  const transfers = ring.filter(isTransfer)
  const rejections = ring.filter(isRejection)
  const qualifying = ring.filter(
    (observation) => isTransfer(observation) || isRejection(observation)
  )

  const distinctRewrites = roundsPairedWithRewrites(transfers)
  const spacedSessions = spacedSessionsOf(qualifying).length
  const transfer = {
    met: distinctRewrites >= TRANSFER_REWRITES,
    distinctRewrites,
  }
  const discrimination = {
    met: rejections.length >= DISCRIMINATION_REJECTIONS,
    rejections: rejections.length,
  }
  const retention = {
    met: spacedSessions >= RETENTION_SESSIONS,
    spacedSessions,
  }

  const stability = stabilityOf(p, ring)
  const newest = qualifying.at(-1)
  const expiresAt =
    newest === undefined ? null : newest.at + retentionWindowMs(stability)
  const conjunction = transfer.met && discrimination.met && retention.met
  const lapsed = conjunction && expiresAt !== null && now > expiresAt

  return {
    transfer,
    discrimination,
    retention,
    decay: { stability, expiresAt, lapsed },
    holds: conjunction && !lapsed,
  }
}
