/**
 * Feedback on an episode (SFEED6, #2745): the pure note (`./model`), its
 * words (`./words`), and the phone's copy (`./store`) behind one snapshot a
 * screen subscribes to. Writing is synchronous, so nothing here waits.
 *
 * Phone-only in use (Studio's pages are the APK's), and pure enough for every
 * build: the viewer's build keeps its notes in its in-memory storage.
 */
import type { Note } from "./model"
import { keepNote, readNotes } from "./store"

export * from "./model"
export * from "./words"
export { MAX as MAX_NOTES } from "./store"

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
  /** Keeps `note`; says whether the phone stored it. */
  keep(note: Note): boolean {
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
