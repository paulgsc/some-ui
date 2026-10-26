/**
 * What the phone keeps about each read-aloud sentence: when it was first and
 * last shown, how many times it was shown, and how many times it was read to
 * the end (adaptive-learning canon Prop. 6.4, Rem. 7.5). It is one row per
 * sentence, so it is as large as the sentences the phone has been given and
 * not as long as the learner has read, and it is never sent anywhere
 * (Rem. 7.3). A sentence is its line's id and its Korean (`tallyKey`): a line
 * written again under the same id is another sentence, so it is not marked
 * seen on what its predecessor showed.
 *
 * - *Shown* is a sentence's first showing in a set, the same point as the
 *   sitting's list (Rem. 4.9). A return or an introduction adds nothing
 *   (Prop. 6.4 (ii)).
 * - *Read to the end* is the practice record's own rule: the rep counted.
 * - A stuck report is never kept here (Prop. 6.4 (iii)): it changes no row,
 *   count or date by itself, so the same reps leave the same rows.
 *
 * Nothing here trims a row; the learner clearing the tally on purpose is the
 * one way a row leaves.
 */

import type { Salvaged } from "@some-ui/core-utils"
import { fnv1a } from "@some-ui/core-utils"
import type { PaceBook } from "@topik/lib/topik/read-aloud/records"
import { own, paceOf } from "@topik/lib/topik/read-aloud/records"
import type { SetItem } from "@topik/lib/topik/read-aloud/set-builder"
import type { QueueEntry } from "@topik/lib/topik/read-aloud/set-machine"
import { z } from "zod"

export type TallyRow = {
  /** When the sentence was first shown (ISO). */
  first: string
  /** When it was last shown (ISO). */
  last: string
  shown: number
  /** Times a rep of it ran every step to the end, at most `shown`. */
  read: number
}

/** The rows by `tallyKey`. */
export type Tally = Record<string, TallyRow>

/**
 * `last` is the device's clock at the latest showing, so it may lie before
 * `first` after the clock is set back; the row is no less true for it.
 */
const RowSchema = z
  .object({
    first: z.iso.datetime(),
    last: z.iso.datetime(),
    shown: z.number().int().min(1),
    read: z.number().int().min(0),
  })
  .refine((row) => row.read <= row.shown)

const TallySchema = z.object({
  version: z.literal(1),
  rows: z.record(z.string(), z.unknown()),
})

export const emptyTally = (): Tally => ({})

/** The sentence a row is about: its line's id and a hash of its Korean. */
export const tallyKey = ({
  lineId,
  text,
}: Pick<SetItem, "lineId" | "text">): string =>
  `${lineId}:${fnv1a(text).toString(36)}`

export const rowOf = (tally: Tally, key: string): TallyRow | null =>
  own(tally, key) ?? null

/** The tally after the sentence `key`'s rep began for the first time in its set. */
export function noteShown(tally: Tally, key: string, at: string): Tally {
  const row = rowOf(tally, key)
  return {
    ...tally,
    [key]: row
      ? { ...row, last: at, shown: row.shown + 1 }
      : { first: at, last: at, shown: 1, read: 0 },
  }
}

/**
 * The tally after a rep of the sentence `key` ran to the end. A sentence with
 * no row was cleared while its rep was held, and the rep then adds nothing: a
 * row would claim a showing the tally never saw. One already read as often as
 * it was shown adds nothing either: `readTally` would leave the row out.
 */
export function noteRead(tally: Tally, key: string): Tally {
  const row = rowOf(tally, key)
  if (!row || row.read >= row.shown) return tally
  return { ...tally, [key]: { ...row, read: row.read + 1 } }
}

/** What a rep's mark says: whether the screen has shown it before. */
export type Mark = "new" | "seen"

/**
 * The mark of the entry on screen, or null for an introduction, whose own
 * label says it is new. `tally` holds the entry's showing already, so a
 * sentence is new when that showing is its first; a return was shown earlier
 * in its set; a word is new when the pace book has never run it to the end
 * (`PaceEntry.seen`), which holds no new data.
 */
export function markOf(
  { item, role }: QueueEntry,
  tally: Tally,
  paces: PaceBook
): Mark | null {
  if (role === "introduction") return null
  if (role === "return") return "seen"
  if (item.kind === "word") {
    return paceOf(paces, item.wordId).seen > 0 ? "seen" : "new"
  }
  return (rowOf(tally, tallyKey(item))?.shown ?? 0) > 1 ? "seen" : "new"
}

/** How many sentences the tally holds a row for. */
export const tallySize = (tally: Tally): number => Object.keys(tally).length

/** When the tally's earliest row began (ISO), or null when it is empty. */
export function tallySince(tally: Tally): string | null {
  const firsts = Object.values(tally).map((row) => row.first)
  return firsts.length === 0
    ? null
    : firsts.reduce((a, b) => (Date.parse(a) <= Date.parse(b) ? a : b))
}

/** What is kept for the tally; null when it is empty, which clears what was kept. */
export function storedTally(tally: Tally): { version: 1; rows: Tally } | null {
  return tallySize(tally) === 0 ? null : { version: 1, rows: tally }
}

/**
 * The rows of a stored tally that parse (`whole` when all did), or null for
 * a value that is not one; `null` itself is the empty tally `storedTally`
 * keeps. Each row stands on its own, so one that does not parse is left out
 * alone, as a pace entry is; the key is a key and nothing else, so none can
 * reach a prototype.
 */
export function readTally(raw: unknown): Salvaged<Tally> | null {
  if (raw === null) return { value: emptyTally(), whole: true }
  const parsed = TallySchema.safeParse(raw)
  if (!parsed.success) return null
  const rows = Object.entries(parsed.data.rows)
  const tally = Object.fromEntries(
    rows.flatMap(([key, row]) => {
      const checked = RowSchema.safeParse(row)
      return checked.success ? [[key, checked.data] as const] : []
    })
  )
  return { value: tally, whole: tallySize(tally) === rows.length }
}
