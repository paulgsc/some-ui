/**
 * Where margin notes (`lib/leetype/notes`, canon Rem. 3.7) are kept: one
 * `localStorage` key, the ledger store's posture (`lib/leetype/ledger/store`)
 * and the same reasons.
 *
 * - Thm. 7.2: every failure reads as no notes. Missing, unparseable,
 *   wrong-version and evicted are one branch; a note that fails its schema
 *   is dropped alone, so one bad entry costs one note.
 * - Prop. 7.2: a failed write is swallowed. Losing a note costs that note.
 * - Rem. 7.3: nothing here leaves the device.
 * - Rem. 3.7: bounded on every write and every read (`boundNotes`), so the
 *   key never holds more than thirty notes of at most thirty days.
 *
 * `localStorage`, not `sessionStorage`: a note is read by the next round
 * the learner generates, which may be days later.
 */

import type { RoundNote } from "@leetype/lib/leetype/notes"
import { boundNotes, RoundNoteSchema } from "@leetype/lib/leetype/notes"
import { z } from "zod"

export const NOTES_KEY = "leetype:notes"
const VERSION = 1

/** The part of `Storage` this store touches, so tests can pass a fake. */
type NoteStorage = Pick<Storage, "getItem" | "setItem">

export type NoteStore = {
  /** The kept notes at `now`, newest first; empty on any failure. */
  list(now: number): Array<RoundNote>
  /** Adds `note`, or replaces the one with its id. Failures are silent. */
  put(note: RoundNote, now: number): void
  /** Removes the note with `id`, if kept. Failures are silent. */
  remove(id: string, now: number): void
}

/** `window.localStorage`, or null wherever touching it throws. */
function localStorageOrNull(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage
  } catch {
    return null
  }
}

/** The key's envelope; each note is checked on its own, below. */
const NotesFileSchema = z.object({
  v: z.literal(VERSION),
  notes: z.array(z.unknown()),
})

function parseNotes(raw: unknown): Array<RoundNote> {
  const file = NotesFileSchema.safeParse(raw)
  if (!file.success) return []
  return file.data.notes.flatMap((note) => {
    const parsed = RoundNoteSchema.safeParse(note)
    return parsed.success ? [parsed.data] : []
  })
}

export function createNoteStore(
  storage: NoteStorage | null = localStorageOrNull()
): NoteStore {
  const read = (now: number): Array<RoundNote> => {
    try {
      const raw = storage?.getItem(NOTES_KEY)
      if (!raw) return []
      return boundNotes(parseNotes(JSON.parse(raw)), now)
    } catch {
      return []
    }
  }
  const write = (notes: ReadonlyArray<RoundNote>, now: number): void => {
    try {
      storage?.setItem(
        NOTES_KEY,
        JSON.stringify({ v: VERSION, notes: boundNotes(notes, now) })
      )
    } catch {
      // Quota or privacy mode: the notes already kept are still true, and
      // this one is lost (Prop. 7.2).
    }
  }
  return {
    list: read,
    put: (note, now): void =>
      write([note, ...read(now).filter(({ id }) => id !== note.id)], now),
    remove: (id, now): void =>
      write(
        read(now).filter((note) => note.id !== id),
        now
      ),
  }
}
