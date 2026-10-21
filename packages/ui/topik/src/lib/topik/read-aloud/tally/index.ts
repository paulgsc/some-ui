/**
 * What the phone keeps about each read-aloud sentence: when it was first and
 * last shown, how many times it was shown, and how many times it was read to
 * the end (adaptive-learning canon Prop. 6.4, Rem. 7.5). It is one row per
 * sentence, so it is as large as the lines on the phone and not as long as the
 * learner has read, and it is never sent anywhere (Rem. 7.3).
 *
 * - *Shown* is a sentence's first showing in a set, the same point as the
 *   sitting's list (Rem. 4.9). A return or an introduction adds nothing
 *   (Prop. 6.4 (ii)).
 * - *Read to the end* is the practice record's own rule: the rep counted.
 * - A stuck report is never kept here (Prop. 6.4 (iii)): no row, count or date
 *   changes with one, so the tally ends the same with the reports withheld.
 *
 * Nothing here trims a row; the learner clearing the tally on purpose is the
 * one way a row leaves.
 */

import type { PaceBook } from "@topik/lib/topik/read-aloud/records"
import type { QueueEntry } from "@topik/lib/topik/read-aloud/set-machine"
import { own, paceOf } from "@topik/lib/topik/read-aloud/set-machine"
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

/** The rows by line id. */
export type Tally = Record<string, TallyRow>

const RowSchema = z
  .object({
    first: z.iso.datetime(),
    last: z.iso.datetime(),
    shown: z.number().int().min(1),
    read: z.number().int().min(0),
  })
  .refine(
    (row) =>
      row.read <= row.shown && Date.parse(row.first) <= Date.parse(row.last)
  )

const TallySchema = z.object({
  version: z.literal(1),
  rows: z.record(z.string(), z.unknown()),
})

export const emptyTally = (): Tally => ({})

export const rowOf = (tally: Tally, lineId: string): TallyRow | null =>
  own(tally, lineId) ?? null

/** The tally after `lineId`'s rep began for the first time in its set. */
export function noteShown(tally: Tally, lineId: string, at: string): Tally {
  const row = rowOf(tally, lineId)
  return {
    ...tally,
    [lineId]: row
      ? { ...row, last: at, shown: row.shown + 1 }
      : { first: at, last: at, shown: 1, read: 0 },
  }
}

/**
 * The tally after a rep of `lineId` ran to the end. A line with no row was
 * cleared while its rep was held, and the rep then adds nothing: a row would
 * claim a showing the tally never saw. A line already read as often as it was
 * shown adds nothing either, since `parseTally` would drop the row.
 */
export function noteRead(tally: Tally, lineId: string): Tally {
  const row = rowOf(tally, lineId)
  if (!row || row.read >= row.shown) return tally
  return { ...tally, [lineId]: { ...row, read: row.read + 1 } }
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
  return (rowOf(tally, item.lineId)?.shown ?? 0) > 1 ? "seen" : "new"
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
 * The rows of a stored tally that parse. Each row stands on its own, so one
 * that does not parse is dropped alone, as a pace entry is; the id is a key
 * and nothing else, so no id can reach a prototype.
 */
export function parseTally(raw: unknown): Tally {
  const parsed = TallySchema.safeParse(raw)
  if (!parsed.success) return emptyTally()
  return Object.fromEntries(
    Object.entries(parsed.data.rows).flatMap(([lineId, row]) => {
      const checked = RowSchema.safeParse(row)
      return checked.success ? [[lineId, checked.data] as const] : []
    })
  )
}
