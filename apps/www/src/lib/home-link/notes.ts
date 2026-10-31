/**
 * The study notes part of the one drain (`./drain`, LA15; HF5 #2180): the
 * text this phone keeps beside a soundbite (its record) and beside a
 * LeetType spoken answer (its note), each PUT once to home's study notes
 * (paulgsc/server `routes::study_notes`, docs/identity.md invariant 30) and
 * counted as home's only when home's answer names the very bytes sent, by
 * their SHA-256. A note never changes on the phone, so `sent.notes` holding
 * its key is home holding it. Their audio goes as voice notes
 * (`./voice-copy`).
 *
 * Phone to home only. What home holds is what may leave the phone to make
 * room at a store's cap (`notesHeld`, which `./voice-copy` hands the stores);
 * nothing here lets anything go.
 */
import type { HomeCall } from "@some-ui/core-utils"
import {
  isRecord,
  jsonOf,
  localStorageOrNull,
  sha256Hex,
} from "@some-ui/core-utils"
import type { Soundbite } from "@some-ui/soundbites"

import type { LeetypeTakeNote } from "@/lib/leetype-takes"

import { pairingOf } from "./index"
import type { EachSent, LogReport } from "./leetype-log"
import { sendEach } from "./leetype-log"
import type { Sent } from "./sent"
import { readSent } from "./sent"

/** What home's `PUT /study-notes/:kind/:id` takes as `kind`. */
export type NoteKind = "soundbite" | "leetype"

/** One note as home is told it: its body is the phone's own record. */
export type StudyNote = {
  readonly kind: NoteKind
  readonly id: string
  readonly body: unknown
}

/** `sent.notes`' key for a note. */
const noteKey = (kind: NoteKind, id: string): string => `${kind}:${id}`

/** Each soundbite's record and each answer's note, as home is told them. */
export function notesOf(
  bites: ReadonlyArray<Soundbite>,
  answers: ReadonlyArray<LeetypeTakeNote>
): Array<StudyNote> {
  return [
    ...bites.map((bite) => ({
      kind: "soundbite" as const,
      id: bite.id,
      body: bite,
    })),
    ...answers.map((note) => ({
      kind: "leetype" as const,
      id: note.id,
      body: note,
    })),
  ]
}

/** The notes home does not hold yet. */
export function notesToSend(
  notes: ReadonlyArray<StudyNote>,
  sent: Sent
): Array<StudyNote> {
  return notes.filter((note) => !(noteKey(note.kind, note.id) in sent.notes))
}

/**
 * Whether a key `sent.notes` remembers names a note still on the phone: one
 * of `notes`, or any soundbite's while their store is unread (`bitesRead`
 * false: their page not loaded in this run, or their list failed).
 */
export function notesOnPhone(
  notes: ReadonlyArray<StudyNote>,
  bitesRead: boolean
): (key: string) => boolean {
  const keys = new Set(notes.map((note) => noteKey(note.kind, note.id)))
  const bite = noteKey("soundbite", "")
  return (key) => keys.has(key) || (!bitesRead && key.startsWith(bite))
}

/** The SHA-256 home's answer names for the note it holds, if any. */
function heldSha(body: string): string | null {
  const answer = jsonOf(body)
  if (!isRecord(answer) || !isRecord(answer.note)) return null
  return typeof answer.note.sha256 === "string" ? answer.note.sha256 : null
}

/** How `sendEach` sends a note: counted held only once home names its bytes. */
const NOTE_SENT: EachSent<StudyNote> = {
  path: (note) => `/study-notes/${note.kind}/${encodeURIComponent(note.id)}`,
  body: (note) => note.body,
  heldAs: async (note, text, body) => {
    const sha = await sha256Hex(text)
    return heldSha(body) === sha ? [noteKey(note.kind, note.id), sha] : null
  },
}

/** Sends `going` (`sendEach`); `held` hears each key `sent.notes` should remember. */
export async function sendNotes(
  going: ReadonlyArray<StudyNote>,
  send: HomeCall,
  report: LogReport,
  held: (key: string, digest: string) => void
): Promise<void> {
  await sendEach(going, NOTE_SENT, send, report, held)
}

/**
 * Whether the paired home holds each note of `kind`, as this phone last
 * heard: none while unpaired. One reading, made once per look at a store.
 */
export function notesHeld(kind: NoteKind): (id: string) => boolean {
  const pairing = pairingOf()
  if (pairing === null) return () => false
  const { notes } = readSent(localStorageOrNull(), pairing)
  return (id) => noteKey(kind, id) in notes
}
