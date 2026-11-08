/**
 * Feedback on an episode (SFEED6, #2745): the pure note (`./model`), its
 * words (`./words`), and the phone's copy (`./store`) behind one snapshot a
 * screen subscribes to. The first read may copy an unreadable stored value
 * aside (`openKept`), once, since the snapshot is kept until a note is.
 */
import type { Appended } from "@/lib/bounded-list"

import type { Note } from "./model"
import { keepNote, readNotes } from "./store"

export * from "./model"
export * from "./words"

type Listener = () => void

const listeners = new Set<Listener>()
let snapshot: ReadonlyArray<Note> | null = null

export const episodeFeedback = {
  subscribe(listener: Listener): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
  /** Every kept note, oldest first; the same array until one is kept. */
  getSnapshot(): ReadonlyArray<Note> {
    snapshot ??= readNotes()
    return snapshot
  },
  /** Keeps `note`; says what that came to. */
  keep(note: Note): Appended {
    const stored = keepNote(note)
    snapshot = null
    for (const listener of listeners) listener()
    return stored
  },
}

/** The notes left on one episode, in the order they were kept. */
export const notesOn = (
  notes: ReadonlyArray<Note>,
  feed: Note["feed"],
  episode: string
): ReadonlyArray<Note> =>
  notes.filter((note) => note.feed === feed && note.episode === episode)
