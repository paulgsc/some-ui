/**
 * The grammar-lens record on the device (adaptive-learning canon Rem. 4.18,
 * Rem. 7.5): entries from `lens/record`, at most a thousand, an offline set
 * (HF5, #2180). Each goes home (www's drain, to home's Korean record as
 * `lens`), and nothing here lets an entry go before home holds it: no age,
 * and an export is a copy that lets none go (LG1). At the bound a new entry
 * makes room by letting go the oldest home holds as it is (`heldByHome`,
 * which the home link sets); while home holds none it is not kept, and
 * `full` says so, for the session to tell the learner. An entry written
 * again for the same item (its session, line and showing) replaces it: that
 * is the same item seen further, not more history. Kept only where the host
 * has the export to carry it (the phone app); nothing here reads it back but
 * that export and `full`.
 *
 * A failed write costs the next export that entry and nothing else
 * (Thm. 7.2), so it throws nothing (Prop. 7.2): a full quota, a private
 * window. `full` says so instead, as it does for a record it cannot read.
 * Everything read is parsed; an entry that does not parse (another build's)
 * is left out of the export and kept as stored, and a record this build
 * cannot read at all is not written over.
 */

import type { Kept, KeyedStorage } from "@some-ui/core-utils"
import {
  localStorageOrNull,
  openKept,
  readJson,
  writeKept,
} from "@some-ui/core-utils"
import type { LensRecordEntry } from "@topik/lib/topik/read-aloud/lens/record"
import type { MistakeId } from "@topik/lib/topik/read-aloud/mistakes"
import { isMistakeId } from "@topik/lib/topik/read-aloud/mistakes"
import { z } from "zod"

export const LENS_RECORD_KEY = "topik:lens-record"

/** Rem. 4.18's bound: about seven hundred kilobytes of `localStorage`. */
export const LENS_RECORD_MAX = 1000

type Held = (entry: LensRecordEntry) => boolean

// Home holds none until the home link says otherwise.
let heldNow: () => Held = () => () => false

/**
 * What home holds of the record, as it is, read back (www's home link): only
 * those may make room for a new entry at the bound. `next` is asked once per
 * look at the record, for a reading of what home holds then.
 */
export function lensRecordHeldByHome(next: () => Held): void {
  heldNow = next
}

export type LensRecordStore = {
  /**
   * Adds the entry, or replaces the one written for the same item; a new
   * entry is not kept once the record is full.
   */
  add: (entry: LensRecordEntry) => void
  /**
   * Whether a new entry would not be kept: the record is at its bound, or is
   * one this build cannot write to, or the last write failed.
   */
  full: () => boolean
}

/** The record as the export writes it: each session's racing flag beside. */
export type LensRecordExport = {
  entries: Array<LensRecordEntry>
  sessions: Array<{ session: string; racing: boolean }>
}

const Mistake = z.custom<MistakeId>(
  (value) => typeof value === "string" && isMistakeId(value)
)
// Strict: an entry with a field this build does not know (another build's)
// does not parse, so it is never exported short of that field, nor let go.
const EntrySchema: z.ZodType<LensRecordEntry> = z.strictObject({
  session: z.string(),
  line: z.string(),
  closedAt: z.string(),
  cue: z.enum(["glyph", "audio", "both"]).nullable(),
  shownAt: z.string(),
  shape: z.enum(["pick", "judge-misform", "judge-authored"]),
  answer: z.string().nullable(),
  right: z.boolean(),
  expired: z.boolean(),
  shown: z.array(Mistake),
  chosen: Mistake.nullable(),
  answerMs: z.number().nullable(),
  rushed: z.boolean().nullable(),
  racing: z.boolean(),
  stepDown: z
    .strictObject({
      asked: z.array(
        z.strictObject({
          rung: z.number(),
          kind: z.enum(["tense", "subject", "object", "split", "verb"]),
          word: z.string().nullable(),
          answer: z.string(),
          right: z.boolean(),
        })
      ),
      end: z.enum(["right", "ran-out", "skipped", "expired", "left"]),
      floor: z.number().nullable(),
    })
    .nullable(),
  situation: z
    .strictObject({
      chosen: z.string().nullable(),
      intended: z.boolean().nullable(),
    })
    .nullable(),
  // Absent in entries written before takes were offered.
  take: z
    .strictObject({
      count: z.number(),
      lastMs: z.number(),
      heardFirst: z.boolean(),
    })
    .nullable()
    .default(null),
})

const DocumentSchema = z.object({
  version: z.literal(1),
  entries: z.array(z.unknown()),
})

const readDocument = readJson((value): Array<unknown> | null => {
  const document = DocumentSchema.safeParse(value)
  return document.success ? document.data.entries : null
})

/**
 * Every entry as stored, parsed or not. A record this build does not read
 * (a newer version, a damaged write) is copied aside first (`openKept`);
 * `writable` false when that could not be done, and nothing is written.
 */
function readStored(storage: KeyedStorage | null): Kept<Array<unknown>> {
  return openKept(storage, LENS_RECORD_KEY, readDocument, [])
}

const parsed = (stored: unknown): LensRecordEntry | null => {
  const entry = EntrySchema.safeParse(stored)
  return entry.success ? entry.data : null
}

const sameItem = (a: LensRecordEntry, b: LensRecordEntry): boolean =>
  a.session === b.session && a.line === b.line && a.shownAt === b.shownAt

/** Writes `entries` as the record; false if the storage would not. */
function writeStored(
  storage: KeyedStorage | null,
  entries: Array<unknown>
): boolean {
  // Quota, privacy mode: the export goes without the change.
  return writeKept(
    storage,
    LENS_RECORD_KEY,
    { version: 1, entries },
    readDocument
  )
}

/**
 * The stored entry a new one may replace at the bound: the earliest closed
 * of those home holds as they are; null while home holds none. An entry
 * this build cannot read is never one.
 */
function oldestHeld(stored: ReadonlyArray<unknown>): unknown {
  const held = heldNow()
  let oldest: { stored: unknown; closedAt: string } | null = null
  for (const candidate of stored) {
    const entry = parsed(candidate)
    if (entry === null || !held(entry)) continue
    if (oldest === null || entry.closedAt < oldest.closedAt) {
      oldest = { stored: candidate, closedAt: entry.closedAt }
    }
  }
  return oldest === null ? null : oldest.stored
}

export function createLensRecordStore(
  storage: KeyedStorage | null = localStorageOrNull()
): LensRecordStore {
  // The last write the storage refused (quota, privacy mode), until one lands.
  let refused = false
  return {
    add: (entry): void => {
      const stored = readStored(storage)
      if (!stored.writable) return
      let kept = stored.value.filter((candidate) => {
        const earlier = parsed(candidate)
        return !earlier || !sameItem(earlier, entry)
      })
      if (kept.length >= LENS_RECORD_MAX) {
        const room = oldestHeld(kept)
        if (room === null) return
        kept = kept.filter((candidate) => candidate !== room)
      }
      refused = !writeStored(storage, [...kept, entry])
    },
    full: (): boolean => {
      const stored = readStored(storage)
      return (
        refused ||
        !stored.writable ||
        (stored.value.length >= LENS_RECORD_MAX &&
          oldestHeld(stored.value) === null)
      )
    },
  }
}

/** The record as kept, for the learner's own export (Rem. 4.18). */
export function lensRecordForExport(
  storage: KeyedStorage | null = localStorageOrNull()
): LensRecordExport {
  const entries = readStored(storage).value.flatMap((stored) => {
    const entry = parsed(stored)
    return entry ? [entry] : []
  })
  const sessions = [...new Set(entries.map((entry) => entry.session))]
  return {
    entries,
    sessions: sessions.map((session) => ({
      session,
      racing: entries.some(
        (entry) => entry.session === session && entry.racing
      ),
    })),
  }
}
