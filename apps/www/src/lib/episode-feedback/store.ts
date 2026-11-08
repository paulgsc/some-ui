/**
 * The phone's copy of every note left on an episode (SFEED6, #2745), oldest
 * first, in `localStorage` through core-utils' `openKept`/`writeKept`: a value
 * it can't read whole is copied aside before anything is written over it.
 *
 * Append-only (CLAUDE.md, "Never lose the record"): a note is never
 * rewritten or dropped here, and once `MAX` are kept a new one is refused
 * rather than making room. Each waits here until home keeps notes (#2745's
 * second step).
 */
import type { Kept } from "@some-ui/core-utils"
import {
  localStorageOrNull,
  openKept,
  salvageList,
  writeKept,
} from "@some-ui/core-utils"

import type { Note } from "./model"
import { NoteSchema } from "./model"

const KEY = "some-ui:episode-feedback"

/** Notes are a few hundred bytes: a thousand is well under the phone's room. */
export const MAX = 1000

const isNote = (value: unknown): value is Note =>
  NoteSchema.safeParse(value).success

const read = salvageList(isNote)

const open = (): Kept<Array<Note>> =>
  // Looked up on each call: the viewer's in-memory copy or a test's may
  // replace it.
  openKept(localStorageOrNull(), KEY, read, [])

/** Every kept note, oldest first. */
export const readNotes = (): ReadonlyArray<Note> => open().value

/** Keeps `note` after the others. Says whether the phone stored it. */
export function keepNote(note: Note): boolean {
  const kept = open()
  if (!kept.writable || kept.value.length >= MAX) return false
  if (kept.value.some((other) => other.id === note.id)) return true
  return writeKept(localStorageOrNull(), KEY, [...kept.value, note], read)
}
