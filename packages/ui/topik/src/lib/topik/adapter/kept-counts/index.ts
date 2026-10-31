/**
 * How much of each bounded record Korean keeps on this device, read through
 * each record's own store, beside the bound it keeps (paulgsc/some-ui#2121,
 * SM2): what Settings shows of Korean's limits. Reads only.
 */

import type { KeyedStorage } from "@some-ui/core-utils"
import { localStorageOrNull } from "@some-ui/core-utils"
import {
  createLastDramaStore,
  LAST_DRAMA_TTL_MS,
} from "@topik/lib/topik/adapter/last-drama-store"
import { createReadAloudStore } from "@topik/lib/topik/adapter/read-aloud-store"
import { ADDED_SET_LIMIT } from "@topik/lib/topik/read-aloud/added-sets"
import { RECORD_DAYS } from "@topik/lib/topik/read-aloud/records"

type Bounded = { readonly kept: number; readonly limit: number }

export type TopikKeptCounts = {
  /** Word sets added, against the most kept: one past it is refused. */
  readonly wordSets: Bounded
  /** Days of the practice record kept day by day; the totals keep every day. */
  readonly practiceDays: Bounded
  /**
   * How long ago the last drama was played, against how long it is kept;
   * `null` when none is kept (none played, or it expired).
   */
  readonly lastDrama: {
    readonly ageMs: number | null
    readonly keptMs: number
  }
}

export function topikKeptCounts(
  storage: KeyedStorage | null = localStorageOrNull(),
  now: () => number = Date.now
): TopikKeptCounts {
  const readAloud = createReadAloudStore(storage)
  const last = createLastDramaStore(storage, now).get()
  return {
    wordSets: { kept: readAloud.sets().length, limit: ADDED_SET_LIMIT },
    practiceDays: {
      kept: readAloud.record().days.length,
      limit: RECORD_DAYS,
    },
    lastDrama: {
      ageMs: last === null ? null : Math.max(0, now() - last.at),
      keptMs: LAST_DRAMA_TTL_MS,
    },
  }
}
