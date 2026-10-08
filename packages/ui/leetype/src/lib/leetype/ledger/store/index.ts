/**
 * Where the ledger (`lib/leetype/ledger`) is kept: one
 * `localStorage` key, the same try/catch posture as `lib/leetype/
 * pasted-round`, and `adaptive-learning-canon.typ` §7 as the reason.
 *
 * - Thm. 7.2: every failure reads as `EMPTY_LEDGER`. Missing, unparseable,
 *   wrong-version, cleared and evicted are one branch, indistinguishable
 *   from a first visit, and the empty ledger is fully playable: the sampler
 *   draws uniformly from it and no round depends on it.
 * - Prop. 7.2: a failed write is swallowed. The session keeps its ledger in
 *   memory and plays on; what is lost is adaptation on a later visit, and
 *   only because Thm. 7.2 holds is that admissible.
 * - Thm. 7.3: validated on read (`parseLedger`); an unknown version is
 *   discarded, which is the total migration version 1 needs.
 * - Ax. 7.1 (iii): not synced, not sent. Rem. 7.3: nothing here leaves the
 *   device.
 *
 * `localStorage`, not `sessionStorage`: retention (Def. 10.2 (3)) is
 * evidence across sessions, so a store that dies with the tab could never
 * hold it. This is the competence record `lib/leetype/baseline-store`'s
 * note says a `localStorage` key must never quietly become; it is that
 * record on purpose, under the canon that governs one (Rem. 10.1).
 */

import type { Ledger } from "@leetype/lib/leetype/ledger"
import { EMPTY_LEDGER, parseLedger } from "@leetype/lib/leetype/ledger"
import { localStorageOrNull } from "@some-ui/core-utils"

export const LEDGER_KEY = "leetype:ledger"

/** The part of `Storage` this store touches, so tests can pass a fake. */
type LedgerStorage = Pick<Storage, "getItem" | "setItem">

export type LedgerStore = {
  /** The persisted ledger, or `EMPTY_LEDGER` on any failure (Thm. 7.2). */
  get(): Ledger
  /** Replaces the persisted ledger; failures are silent (Prop. 7.2). */
  set(ledger: Ledger): void
}

export function createLedgerStore(
  storage: LedgerStorage | null = localStorageOrNull()
): LedgerStore {
  return {
    get: (): Ledger => {
      try {
        const raw = storage?.getItem(LEDGER_KEY)
        if (!raw) return EMPTY_LEDGER
        return parseLedger(JSON.parse(raw))
      } catch {
        return EMPTY_LEDGER
      }
    },
    set: (ledger): void => {
      try {
        storage?.setItem(LEDGER_KEY, JSON.stringify(ledger))
      } catch {
        // Quota or privacy mode. The previous value, if any, is older
        // evidence and still true, so it stays; this session's ledger lives
        // on in memory (Prop. 7.2).
      }
    },
  }
}
