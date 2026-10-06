/**
 * The round sampler (LTY-LEDGER L4): canon Thm. 9.1, Ax. 9.1, Prop. 9.1;
 * `adaptive-learning-canon.typ` Thm. 8.1, Prop. 5.1.
 *
 * `nextRound(ledger, corpus, seed, now)` chooses the next round. It is the
 * one place a learner's responses act on anything, and what they act on is
 * a distribution (Thm. 9.1): every round keeps a weight of at least
 * `RECENT_DAMPING × WEIGHT_FLOOR > 0`, so no ledger state makes any round
 * unreachable, and there is no unlock, no prerequisite gate and no "not
 * ready yet" to express one with. The caller plays whatever comes back and
 * reveals everything about it (Ax. 9.1).
 *
 * Pure and replayable: one `seed` is one draw (`unitIntervalBySeed`), and
 * the same `(ledger, corpus, seed, now)` gives the same round. Oracle-free
 * (Thm. 8.1): no network, no model, no key, and nothing on this path needs
 * the execution runtime. A learned policy would replace `roundWeights` and
 * nothing else.
 *
 * # What moves a round's weight (Prop. 9.1)
 *
 * A round *instantiates* `p` when some member of its `D` has μ = `p`
 * (Rem. 7.1). For each entry the ledger has seen, the
 * newest observation with `p` as the card's answer asks for its own next
 * round:
 *
 * - `incorrect`, chose `c` — a discriminating counter-instance: a round
 *   instantiating both `p` and `c`, where the two must be told apart, gets
 *   `+CONFUSION_BOTH`; one instantiating either gets `+CONFUSION_EITHER`.
 * - `abstain` — a cleaner instance of `p`: a round instantiating `p` gets
 *   up to `+CLEANER`, scaled by `1 / (1 + semanticDistance)` of its
 *   cleanest `p` rewrite (Def. 5.2: fewer edges moved is a plainer
 *   instance).
 * - `correct` — a nearby boundary case: a round instantiating `p` through a
 *   rewrite `p` has not yet been named on (`rewriteKeyOf`) gets
 *   `+BOUNDARY`. It is also what Def. 10.2's transfer needs, so debt and
 *   demonstration pull the same way.
 *
 * Every round instantiating an entry that is not currently demonstrated
 * (lapsed ones included) gets `+DEBT` once, so unresolved understanding is
 * an input to sampling ("debt, not blockage"). A cold ledger gives
 * every round exactly that, which is the uniform prior of `LEDGER_PROFILE`
 * (Prop. 5.1). Boosts sum and are capped at `BOOST_CAP`; the round played
 * last is damped so it rarely comes straight back.
 */

import { unitIntervalBySeed } from "@leetype/lib/leetype/deterministic-random"
import type { Ledger } from "@leetype/lib/leetype/ledger"
import type { EntryReading } from "@leetype/lib/leetype/ledger/state"
import { lastRoundId, readEntry } from "@leetype/lib/leetype/ledger/state"
import type { PropositionId } from "@leetype/lib/leetype/proposition-register/generated"
import { PROPOSITION_REGISTER } from "@leetype/lib/leetype/proposition-register/generated"
import {
  rewriteKeyOf,
  rewriteOf,
  semanticDistance,
} from "@leetype/lib/leetype/rewrite"
import type { Round } from "@leetype/types/authored-round"
import { assertNever } from "@some-ui/core-utils"

/** Every round's base weight: the part no response can remove. */
export const WEIGHT_FLOOR = 1

/**
 * The most all boosts together can add: a round weighs at most
 * `WEIGHT_FLOOR + BOOST_CAP = 8`. This, with the floor, is what bounds
 * reachability — see `REACH_FAILURE_BOUND` in the tests: a round not just
 * played has probability at least `1 / (1 + 8 (N − 1))` on every draw.
 * 7 lets the strongest single response (`CONFUSION_BOTH + DEBT = 5`) and a
 * second one stack before the cap flattens them, without letting a corpus
 * of five rounds push any one below one draw in 33.
 */
export const BOOST_CAP = 7

/** The round played last keeps a quarter of its weight: rarely straight back, never gone. */
export const RECENT_DAMPING = 1 / 4

const DEBT = 1
const CONFUSION_BOTH = 4
const CONFUSION_EITHER = 2
const CLEANER = 4
const BOUNDARY = 2

function isPropositionId(value: string): value is PropositionId {
  return Object.hasOwn(PROPOSITION_REGISTER, value)
}

type Instance = { readonly rewriteKey: string; readonly cleanliness: number }

/** μ over `D`, with each member's rewrite key and plainness. */
function instancesOf(
  round: Round
): ReadonlyMap<PropositionId, ReadonlyArray<Instance>> {
  const instances = new Map<PropositionId, Array<Instance>>()
  for (const option of round.diffOptions) {
    const id = option.member.propositionId
    const rewrite = rewriteOf(round.graph, option.graph)
    const instance = {
      rewriteKey: rewriteKeyOf(rewrite),
      cleanliness: 1 / (1 + semanticDistance(rewrite.before, rewrite.after)),
    }
    instances.set(id, [...(instances.get(id) ?? []), instance])
  }
  return instances
}

function boostOf(
  instances: ReadonlyMap<PropositionId, ReadonlyArray<Instance>>,
  readings: ReadonlyMap<PropositionId, EntryReading>
): number {
  let boost = [...instances.keys()].some(
    (id) => readings.get(id)?.state !== "demonstrated"
  )
    ? DEBT
    : 0
  for (const [p, reading] of readings) {
    const outcome = reading.latestWitness?.outcome
    if (outcome === undefined) continue
    const ofP = instances.get(p) ?? []
    switch (outcome.kind) {
      case "incorrect": {
        const hasP = ofP.length > 0
        const hasChosen = instances.has(outcome.chosen)
        if (hasP && hasChosen) boost += CONFUSION_BOTH
        else if (hasP || hasChosen) boost += CONFUSION_EITHER
        break
      }
      case "abstain": {
        const cleanest = Math.max(0, ...ofP.map((one) => one.cleanliness))
        boost += CLEANER * cleanest
        break
      }
      case "correct": {
        if (ofP.some((one) => !reading.recognizedRewrites.has(one.rewriteKey)))
          boost += BOUNDARY
        break
      }
      default: {
        return assertNever(outcome)
      }
    }
  }
  return Math.min(boost, BOOST_CAP)
}

/**
 * Each round's weight, index-aligned with `corpus`. Every one is at least
 * `RECENT_DAMPING × WEIGHT_FLOOR` and at most `WEIGHT_FLOOR + BOOST_CAP`.
 */
export function roundWeights(
  ledger: Ledger,
  corpus: ReadonlyArray<Round>,
  now: number
): ReadonlyArray<number> {
  const readings = new Map<PropositionId, EntryReading>()
  const readingOf = (id: PropositionId): EntryReading => {
    const held = readings.get(id)
    if (held !== undefined) return held
    const reading = readEntry(id, ledger, now)
    readings.set(id, reading)
    return reading
  }
  for (const id of Object.keys(ledger.entries)) {
    if (isPropositionId(id)) readingOf(id)
  }
  const profiles = corpus.map(instancesOf)
  for (const instances of profiles) {
    for (const id of instances.keys()) readingOf(id)
  }
  const last = corpus.length > 1 ? lastRoundId(ledger) : undefined
  return corpus.map((round, index) => {
    const weight = WEIGHT_FLOOR + boostOf(profiles[index]!, readings)
    return round.id === last ? weight * RECENT_DAMPING : weight
  })
}

/**
 * The next round: one weighted draw from `corpus` under `roundWeights`,
 * or `undefined` for an empty corpus. Pure; `seed` is the whole of its
 * randomness.
 */
export function nextRound(
  ledger: Ledger,
  corpus: ReadonlyArray<Round>,
  seed: number,
  now: number
): Round | undefined {
  const weights = roundWeights(ledger, corpus, now)
  const total = weights.reduce((sum, weight) => sum + weight, 0)
  let point = unitIntervalBySeed(seed) * total
  for (const [index, weight] of weights.entries()) {
    point -= weight
    if (point < 0) return corpus[index]
  }
  return corpus.at(-1)
}
