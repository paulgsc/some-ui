/**
 * LeetType's spoken answers on the phone (canon v1.2, Def. 9.5;
 * `@some-ui/leetype`'s `SpokenTakes`): a desk of takes (`lib/takes-desk`),
 * at most forty, each at most sixty seconds, and beside each answer a note
 * of what it answered: the prompt, the rubric, the points ticked, and the
 * text when it was typed. Both go home (HF5, #2180): each take as a voice
 * note and each note as a study note (`lib/home-link/voice-copy` and the
 * drain's `./notes`), and the study-context export carries a copy of both.
 * Each list keeps forty: past it, a new one makes room by letting go the
 * oldest home holds, and is refused while home holds none. Phone-only
 * (`build.paths.ts`).
 */
import type {
  SpokenTakeNote,
  SpokenTakes,
  SpokenTakeSnapshot,
} from "@some-ui/leetype"
import type { LensTakeSnapshot } from "@some-ui/topik"

import { boundedList } from "@/lib/bounded-list"
import { makesRoom, takesDesk } from "@/lib/takes-desk"

export type { Take as LeetypeTake } from "@/lib/takes-desk"

const MAX = 40
/** A spoken answer runs up to sixty seconds (Def. 9.5). */
const MAX_MS = 60_000

const desk = takesDesk({
  key: "some-ui:leetype-takes",
  dbName: "some-ui.leetype-takes",
  limits: { max: MAX, maxMs: MAX_MS },
})

/** A settled answer's note, by its own id. */
export type LeetypeTakeNote = SpokenTakeNote & {
  readonly id: string
  readonly notedAt: number
}

const isStrings = (value: unknown): value is Array<string> =>
  Array.isArray(value) && value.every((item) => typeof item === "string")

const isNote = (value: unknown): value is LeetypeTakeNote => {
  if (typeof value !== "object" || value === null) return false
  const take: unknown = Reflect.get(value, "take")
  const typed: unknown = Reflect.get(value, "typed")
  return (
    typeof Reflect.get(value, "id") === "string" &&
    typeof Reflect.get(value, "notedAt") === "number" &&
    (take === null || typeof take === "string") &&
    typeof Reflect.get(value, "file") === "string" &&
    typeof Reflect.get(value, "screen") === "string" &&
    typeof Reflect.get(value, "prompt") === "string" &&
    isStrings(Reflect.get(value, "rubric")) &&
    isStrings(Reflect.get(value, "ticks")) &&
    (typed === null || typeof typed === "string")
  )
}

const notes = boundedList("some-ui:leetype-take-notes", MAX, isNote)

// Home holds none until the voice lane says otherwise (`leetypeNotesHeldByHome`).
let notesHeld: () => (id: string) => boolean = () => () => false
/** Those reading the port or the notes, told when the notes or their room change. */
const notesListeners = new Set<() => void>()
/** Moves with each change to the notes or their room. */
let notesRevision = 0
const notesMoved = (): void => {
  notesRevision += 1
  for (const listener of notesListeners) listener()
}

/** The oldest note home holds, which a new one may replace at the cap. */
const roomFor = (): LeetypeTakeNote | null =>
  makesRoom(notes.read(), MAX, notesHeld(), (note) => note.notedAt)

const notesFull = (): boolean =>
  notes.read().length >= MAX && roomFor() === null

/**
 * The port's snapshot, made again only when the desk's changes or the notes
 * fill. A take needs room on both, so `full` when either is; a typed answer
 * needs only a note, so `notesFull` alone stops it. The two part whenever a
 * take is kept with no note: one that answered nothing (the learner moved
 * on, or the surface closed mid-take), or one an export kept because it
 * could not read its audio while letting its note go.
 */
function adapted(): () => SpokenTakeSnapshot {
  let from: LensTakeSnapshot | null = null
  let fromFull = false
  let made: SpokenTakeSnapshot | null = null
  return () => {
    const now = desk.phone().getSnapshot()
    const full = notesFull()
    if (made === null || now !== from || full !== fromFull) {
      from = now
      fromFull = full
      made = {
        recording: now.take.kind === "opening" || now.take.kind === "recording",
        said: now.said,
        last: now.last,
        full: now.full || full,
        notesFull: full,
      }
    }
    return made
  }
}

let port: SpokenTakes | null = null

export function phoneSpokenTakes(): SpokenTakes {
  port ??= {
    getSnapshot: adapted(),
    subscribe: (listener): (() => void) => {
      notesListeners.add(listener)
      const stop = desk.phone().subscribe(listener)
      return (): void => {
        notesListeners.delete(listener)
        stop()
      }
    },
    start: ({ file, screen }): void => desk.phone().start(`${file}#${screen}`),
    stop: (): void => desk.phone().stop(),
    reset: (): void => desk.phone().reset(),
    note: (note): boolean => {
      // Refused when full, never evicting one home does not hold.
      if (notesFull()) return false
      const room = roomFor()
      if (room !== null && !notes.remove(({ id }) => id === room.id)) {
        return false
      }
      const kept = notes.put(
        { ...note, id: crypto.randomUUID(), notedAt: Date.now() },
        () => false
      )
      notesMoved()
      return kept
    },
  }
  return port
}

export const sweepLeetypeTakes = desk.sweep

/** The takes' desk, for the copy home (`lib/home-link/voice-copy`). */
export const leetypeTakesDesk = desk

/** The notes as kept, for the drain (`lib/home-link`). */
export const leetypeNotes = (): ReadonlyArray<LeetypeTakeNote> => notes.read()

/**
 * For `useSyncExternalStore` and the drain's lane (`lib/home-link/practice`):
 * moves each time a note is kept or let go, or their room changes.
 */
export const leetypeNotesMoved = {
  getSnapshot: (): number => notesRevision,
  subscribe(listener: () => void): () => void {
    notesListeners.add(listener)
    return (): void => {
      notesListeners.delete(listener)
    }
  },
}

/**
 * How to read what home holds of the notes, read back: those may make room
 * at forty. `next` is asked once per look at the notes. A screen reading the
 * port hears it, so one that showed the notes full can take an answer again.
 */
export function leetypeNotesHeldByHome(
  next: () => (id: string) => boolean
): void {
  notesHeld = next
  notesMoved()
}

/** The notes and the takes with their audio, for the study-context export. */
export async function leetypeTakesForExport(): Promise<{
  notes: Array<LeetypeTakeNote>
  takes: Awaited<ReturnType<typeof desk.forExport>>
}> {
  return { notes: notes.read(), takes: await desk.forExport() }
}
