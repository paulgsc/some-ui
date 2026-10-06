/**
 * The ledger (LTY-LEDGER L1): canon Def. 10.1, Rem. 10.1. The learner's ledger over the proposition register: what
 * is persisted, and the fold that writes it.
 *
 * # Inherited, not re-derived (Rem. 10.1)
 *
 * How a belief is represented, decayed, persisted and reconstructed is the
 * sibling canon's (`adaptive-learning-canon.typ`). This module is its
 * minimal faithful form over the one object this canon adds, the register:
 *
 * - Thm. 5.1's triple. `profile` is `ρ_v` (Def. 5.2): version 1 is the
 *   uniform prior, every entry unseen, so a cold learner's sampling is
 *   uniform (Prop. 5.1). `recognizedAt` is the only deviation field
 *   (Def. 5.3), kept so that ring eviction can never take back a correct
 *   selection that happened (Def. 10.1's "at least once"). `ring` is the
 *   evidence ring (Def. 5.5).
 * - Def. 5.3: the map is sparse. `unseen` is the *absence* of an entry,
 *   never a stored value, so a learner who has played one round stores
 *   four entries, not sixteen.
 * - Thm. 5.3: nothing here decays anything. The persisted state holds
 *   timestamps; the four states are derived at read time from them and
 *   `now` (`lib/leetype/ledger/state`, `lib/leetype/ledger/demonstration`).
 *   There is no scheduled write and no write on open.
 * - Ax. 5.1: `recordObservations` folds in timestamp order and is
 *   idempotent over an identical observation, so replaying a commit is a
 *   no-op.
 * - Thm. 5.2: observations are stored, not absolute beliefs, so a revised
 *   profile re-anchors by re-reading them. Version 1 is the only profile;
 *   an unknown version is discarded (Thm. 7.3's terminal case) by the
 *   store (`lib/leetype/ledger/store`).
 * - Thm. 7.1: the footprint is at most `|register| × RING_CAPACITY`
 *   observations, whatever the number of rounds played.
 *
 * Keyed by `CW-P` id, never by round, exercise or concept string:
 * keying by round would make Def. 10.2's transfer, which is evidence
 * *across* rounds, unrepresentable.
 *
 * Def. 5.5 says no policy reads the ring directly. The sampler reads the
 * derived view (`ledgerStateOf`, `demonstrated`, `latestWitnessOutcome`),
 * which are the fold `U` (Def. 5.1) evaluated at read time.
 */

import type {
  FiledObservation,
  Observation,
} from "@leetype/lib/leetype/ledger/observation"
import { ObservationSchema } from "@leetype/lib/leetype/ledger/observation"
import { PROPOSITION_REGISTER } from "@leetype/lib/leetype/proposition-register/generated"
import type { PropositionId } from "@leetype/lib/leetype/proposition-register/generated"
import { z } from "zod"

/** Bumped when the persisted shape changes; the store discards any other (Thm. 7.3). */
export const LEDGER_SCHEMA_VERSION = 1

/** `ρ_v` (Def. 5.2): version 1 is the uniform prior, every entry unseen. */
export const LEDGER_PROFILE = "cw-uniform-1"

/**
 * Observations held per register entry (Def. 5.5), newest kept.
 *
 * 16 = 4 × 4. Def. 10.2's smallest demonstrating set is four observations
 * (three transfers and one rejection, see `lib/leetype/ledger/demonstration`),
 * and a card offers `k = 4` options (`READING_OPTION_COUNT`), so a ring of
 * 16 still holds that set when only one observation in `k` about the entry
 * qualifies — a learner answering no better than one card's chance still
 * keeps the evidence they did earn. In time: an entry is on roughly one card
 * in four (four options from a register of sixteen), a ten-minute session
 * plays a handful of rounds, so 16 observations span several sessions, and
 * retention needs two.
 *
 * Price (Thm. 7.1, Ax. 7.1 (v)): an observation serializes to about 220
 * bytes, so the worst case is 16 entries × 16 × 220 B ≈ 56 KB, about one
 * percent of a typical 5 MB origin quota, independent of rounds played.
 */
export const RING_CAPACITY = 16

const LedgerEntrySchema = z.object({
  recognizedAt: z.number().int().nonnegative().optional(),
  ring: z.array(ObservationSchema).max(RING_CAPACITY),
})
type LedgerEntry = z.infer<typeof LedgerEntrySchema>

/**
 * The persisted ledger. `entries` is sparse: a key that is absent is
 * `unseen` (Def. 10.1), and nothing else is.
 */
export type Ledger = {
  readonly schema: typeof LEDGER_SCHEMA_VERSION
  readonly profile: typeof LEDGER_PROFILE
  readonly entries: Readonly<Partial<Record<PropositionId, LedgerEntry>>>
}

/** Thm. 7.2's reconstruction: the ledger an evicted, cleared or first-visit store reads as. */
export const EMPTY_LEDGER: Ledger = {
  schema: LEDGER_SCHEMA_VERSION,
  profile: LEDGER_PROFILE,
  entries: {},
}

const LedgerEnvelopeSchema = z.object({
  schema: z.literal(LEDGER_SCHEMA_VERSION),
  profile: z.literal(LEDGER_PROFILE),
  entries: z.record(z.string(), z.unknown()),
})

function isPropositionId(value: string): value is PropositionId {
  return Object.hasOwn(PROPOSITION_REGISTER, value)
}

/**
 * Reads a ledger back from untrusted JSON. A wrong schema or profile
 * version reads as empty (Thm. 7.3's discard; version 1 has nothing older
 * to migrate). A single malformed entry, or one keyed by an id the register
 * no longer has, is dropped on its own, so one bad row costs that entry's
 * evidence and not the whole ledger. Never throws.
 */
export function parseLedger(value: unknown): Ledger {
  const envelope = LedgerEnvelopeSchema.safeParse(value)
  if (!envelope.success) return EMPTY_LEDGER
  const entries: Partial<Record<PropositionId, LedgerEntry>> = {}
  for (const [key, raw] of Object.entries(envelope.data.entries)) {
    if (!isPropositionId(key)) continue
    const entry = LedgerEntrySchema.safeParse(raw)
    if (entry.success && entry.data.ring.length > 0) entries[key] = entry.data
  }
  return { ...EMPTY_LEDGER, entries }
}

/**
 * Field by field, not by `JSON.stringify`: `mergeLedgers` compares an
 * observation built in memory with one parsed back from storage, and the
 * two need not list their keys in the same order.
 */
function sameObservation(a: Observation, b: Observation): boolean {
  return (
    a.at === b.at &&
    a.sessionId === b.sessionId &&
    a.roundId === b.roundId &&
    a.role === b.role &&
    a.propositionId === b.propositionId &&
    a.rewriteKey === b.rewriteKey &&
    a.outcome.kind === b.outcome.kind &&
    (a.outcome.kind === "incorrect" ? a.outcome.chosen : null) ===
      (b.outcome.kind === "incorrect" ? b.outcome.chosen : null)
  )
}

function withObservation(
  entry: LedgerEntry | undefined,
  observation: Observation
): LedgerEntry {
  const ring = entry?.ring ?? []
  if (ring.some((held) => sameObservation(held, observation))) {
    return entry ?? { ring }
  }
  // Timestamp order (Ax. 5.1): insert after every observation at or before
  // `at`, so equal timestamps keep arrival order; then keep the newest.
  const later = ring.findIndex((held) => held.at > observation.at)
  const insertAt = later === -1 ? ring.length : later
  const ordered = [
    ...ring.slice(0, insertAt),
    observation,
    ...ring.slice(insertAt),
  ].slice(-RING_CAPACITY)
  const recognizes =
    observation.role === "witness" && observation.outcome.kind === "correct"
  const recognizedAt =
    recognizes && (entry?.recognizedAt ?? Infinity) > observation.at
      ? observation.at
      : entry?.recognizedAt
  return recognizedAt === undefined
    ? { ring: ordered }
    : { recognizedAt, ring: ordered }
}

/**
 * The fold `U` (Def. 5.1) over a batch: files each observation into its
 * entry's ring in timestamp order, creating the entry on first sight. Pure;
 * the caller persists the result.
 */
export function recordObservations(
  ledger: Ledger,
  observations: ReadonlyArray<FiledObservation>
): Ledger {
  const entries = { ...ledger.entries }
  for (const { about, observation } of observations) {
    entries[about] = withObservation(entries[about], observation)
  }
  return { ...ledger, entries }
}

/**
 * Both ledgers' evidence in one: every observation either holds, folded in
 * timestamp order with duplicates dropped (Ax. 5.1), and the earlier
 * `recognizedAt` of the two, kept to the newest `RING_CAPACITY` per
 * entry as every ring is. So a tab can fold what another tab stored into
 * its own copy before writing without a whole-value `set` erasing it.
 * Order-free up to ties: two observations with the same
 * `at` keep arrival order, so only commits in the same millisecond from two
 * tabs can sit in a different order. A ledger that failed to
 * read is `EMPTY_LEDGER`, which merges as a no-op, so this tab's in-memory
 * evidence survives a storage that reads nothing (Prop. 7.2).
 */
export function mergeLedgers(into: Ledger, from: Ledger): Ledger {
  const entries = { ...into.entries }
  for (const [key, theirs] of Object.entries(from.entries)) {
    if (!isPropositionId(key)) continue
    let merged = entries[key]
    for (const observation of theirs.ring) {
      merged = withObservation(merged, observation)
    }
    const recognizedAt = Math.min(
      entries[key]?.recognizedAt ?? Infinity,
      theirs.recognizedAt ?? Infinity,
      merged?.recognizedAt ?? Infinity
    )
    if (merged !== undefined) {
      entries[key] =
        recognizedAt === Infinity ? merged : { ...merged, recognizedAt }
    }
  }
  return { ...into, entries }
}
