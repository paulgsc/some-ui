/**
 * The phone's copy of every note left on an episode (SFEED6, #2745), oldest
 * first and append-only (`appendList`): once `MAX` are kept, a new one is
 * refused rather than making room.
 */
import { appendList } from "@/lib/bounded-list"

import type { Note } from "./model"
import { NoteSchema } from "./model"

/** Notes are a few hundred bytes: a thousand is well under the phone's room. */
export const MAX = 1000

const notes = appendList(
  "some-ui:episode-feedback",
  MAX,
  (value: unknown): value is Note => NoteSchema.safeParse(value).success
)

/** Every kept note, oldest first. */
export const readNotes = (): ReadonlyArray<Note> => notes.read()

export const keepNote = notes.append
