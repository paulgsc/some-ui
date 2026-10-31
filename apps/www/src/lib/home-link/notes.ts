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
 * room at a store's cap (`noteHeld`, which `./voice-copy` hands the stores);
 * nothing here lets anything go.
 */
import type { HomeCall } from "@some-ui/core-utils"
import {
  canonicalJson,
  isRecord,
  jsonOf,
  localStorageOrNull,
  sha256Hex,
} from "@some-ui/core-utils"
import type { Soundbite } from "@some-ui/soundbites"

import type { LeetypeTakeNote } from "@/lib/leetype-takes"

import { pairingOf } from "./index"
import type { LogReport } from "./leetype-log"
import { bucketOf } from "./leetype-log"
import type { Sent } from "./sent"
import { readSent } from "./sent"
import { answerOrEnd } from "./shelf"

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

/** The SHA-256 home's answer names for the note it holds, if any. */
function heldSha(body: string): string | null {
  const answer = jsonOf(body)
  if (!isRecord(answer) || !isRecord(answer.note)) return null
  return typeof answer.note.sha256 === "string" ? answer.note.sha256 : null
}

/**
 * Sends `going` through `send`, into `report`: a note home answers 200 for
 * holding the same bytes is held, one it answers for other bytes differs,
 * and a `409` or `422` is refused (kept here, offered again by the next
 * run); `held` hears each key `sent.notes` should remember.
 */
export async function sendNotes(
  going: ReadonlyArray<StudyNote>,
  send: HomeCall,
  report: LogReport,
  held: (key: string, digest: string) => void
): Promise<void> {
  for (const note of going) {
    const text = canonicalJson(note.body)
    const answer = await answerOrEnd(
      send,
      report,
      "PUT",
      `/study-notes/${note.kind}/${encodeURIComponent(note.id)}`,
      text
    )
    if (answer === null) return
    const bucket = bucketOf(answer.status)
    if (bucket !== "held") {
      report[bucket] += 1
      continue
    }
    const sha = await sha256Hex(text)
    if (heldSha(answer.body) === sha) {
      report.held += 1
      held(noteKey(note.kind, note.id), sha)
    } else {
      report.differs += 1
    }
  }
}

/**
 * Whether the paired home holds the note, as this phone last heard: false
 * while unpaired. Read when a store would make room, never cached.
 */
export function noteHeld(kind: NoteKind, id: string): boolean {
  const pairing = pairingOf()
  if (pairing === null) return false
  return noteKey(kind, id) in readSent(localStorageOrNull(), pairing).notes
}
