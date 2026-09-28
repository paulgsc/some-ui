/**
 * What the read-aloud drill keeps between sittings: each word's pace, and
 * the practice record (adaptive-learning canon Cor. 4.6 (iii), Def. 6.6,
 * Prop. 6.4, Rem. 7.5).
 *
 * - The pace book holds one factor per word, keyed by the word's authored
 *   id. It is pacing and nothing more: read by nothing but the turn, never
 *   shown, and losing it costs the learner their pace and nothing else
 *   (Cor. 4.6 (iii)). It is bounded by the vocabulary (Rem. 7.5).
 * - The practice record holds, per recent day, the reps that ran to the end,
 *   the sets finished and the practice those reps are credited with, plus
 *   running totals of the same three. It names no item and carries no
 *   outcome (Def. 6.6), and it is bounded: sixty days and the totals
 *   (Rem. 7.5).
 *
 * Both are parsed, not trusted, on load: a malformed pace entry is dropped
 * on its own, and a malformed record is discarded whole, since a record
 * patched together from parts would show counts that never happened.
 */

import { PACE_MAX, PACE_MIN } from "@topik/lib/topik/read-aloud/timing"
import { z } from "zod"

// ═══════════════════════════════════════════════════════════════════════════
// PACE BOOK
// ═══════════════════════════════════════════════════════════════════════════

export type PaceEntry = {
  /** Scales the word's turn (Cor. 4.6 (iii)). */
  factor: number
  /** How many times the word has run as a rep. Zero means first sight. */
  seen: number
}

export type PaceBook = Record<string, PaceEntry>

const PaceEntrySchema = z.object({
  factor: z.number().min(PACE_MIN).max(PACE_MAX),
  seen: z.number().int().min(0),
})

/** A stored pace book, keeping every entry that parses. */
export function parsePaceBook(raw: unknown): PaceBook {
  const parsed = z.record(z.string(), z.unknown()).safeParse(raw)
  if (!parsed.success) return {}
  const book: PaceBook = {}
  for (const [wordId, entry] of Object.entries(parsed.data)) {
    const checked = PaceEntrySchema.safeParse(entry)
    if (checked.success) book[wordId] = checked.data
  }
  return book
}

/** The pace book limited to words the vocabulary still names (Rem. 7.5). */
export function prunePaceBook(
  book: PaceBook,
  wordIds: Iterable<string>
): PaceBook {
  const known = new Set(wordIds)
  return Object.fromEntries(
    Object.entries(book).filter(([wordId]) => known.has(wordId))
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// PRACTICE RECORD
// ═══════════════════════════════════════════════════════════════════════════

/** Days the record keeps; the totals keep everything (Rem. 7.5). */
export const RECORD_DAYS = 60

export type PracticeCounts = {
  /** Reps that ran every step to the end on screen (Prop. 6.4 (i)). */
  reps: number
  sets: number
  /** Nominal practice, credited per counted rep (Prop. 6.4 (iv)). */
  practiceMs: number
}

export type PracticeDay = PracticeCounts & {
  /** The learner's local date, `YYYY-MM-DD`. */
  day: string
}

export type PracticeRecord = {
  version: 1
  /** Oldest first, at most `RECORD_DAYS`. */
  days: Array<PracticeDay>
  totals: PracticeCounts
}

const CountsShape = {
  reps: z.number().int().min(0),
  sets: z.number().int().min(0),
  practiceMs: z.number().min(0),
}

const DAY = /^\d{4}-\d{2}-\d{2}$/

const PracticeRecordSchema = z.object({
  version: z.literal(1),
  days: z.array(z.object({ day: z.string().regex(DAY), ...CountsShape })),
  totals: z.object(CountsShape),
})

const ZERO: PracticeCounts = { reps: 0, sets: 0, practiceMs: 0 }

export const emptyRecord = (): PracticeRecord => ({
  version: 1,
  days: [],
  totals: { ...ZERO },
})

/** A local date as the record keys it. */
export function dayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${date.getFullYear()}-${month}-${day}`
}

/** Days in order, the oldest dropped beyond `RECORD_DAYS`. */
const bounded = (days: Array<PracticeDay>): Array<PracticeDay> =>
  [...days]
    .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0))
    .slice(-RECORD_DAYS)

function add(
  record: PracticeRecord,
  day: string,
  delta: PracticeCounts
): PracticeRecord {
  const plus = (counts: PracticeCounts): PracticeCounts => ({
    reps: counts.reps + delta.reps,
    sets: counts.sets + delta.sets,
    practiceMs: counts.practiceMs + delta.practiceMs,
  })
  const existing = record.days.find((entry) => entry.day === day)
  const days = existing
    ? record.days.map((entry) =>
        entry.day === day ? { day, ...plus(entry) } : entry
      )
    : [...record.days, { day, ...plus(ZERO) }]
  return { version: 1, days: bounded(days), totals: plus(record.totals) }
}

/** One counted rep and the nominal practice it is credited with. */
export const addRep = (
  record: PracticeRecord,
  day: string,
  creditMs: number
): PracticeRecord =>
  add(record, day, { reps: 1, sets: 0, practiceMs: creditMs })

/** One finished set. */
export const addSet = (record: PracticeRecord, day: string): PracticeRecord =>
  add(record, day, { reps: 0, sets: 1, practiceMs: 0 })

/** A stored record, or an empty one when it does not parse. */
export function parsePracticeRecord(raw: unknown): PracticeRecord {
  const parsed = PracticeRecordSchema.safeParse(raw)
  if (!parsed.success) return emptyRecord()
  const days = parsed.data.days
  if (new Set(days.map((entry) => entry.day)).size !== days.length) {
    return emptyRecord()
  }
  return { version: 1, days: bounded(days), totals: parsed.data.totals }
}
