/**
 * What the owner says in Studio that is filed as a pending issue (SFEED5,
 * #2746): a take kept on home whose `ref` names what it is about, filed by
 * the reflections routine (`packages/ui/topik/ROUTINE.md`, part E) through
 * `render pending`, which runs `toFile`. Each filed issue ends with
 * `filedLine(note)`, so no take is filed twice. A new kind of take to file
 * is a branch in `pendingOfRef` and a bullet in part E's E3, never a second
 * way of filing.
 *
 * A note left on an episode (SFEED6, #2745) is filed the same way, from the
 * mailbox's `feedback` folder (`some-ui.episode-note/1`): one issue per place
 * its categories send it (`./feedback`), each ending with
 * `noteFiledLine(note, goes)`, with what home heard in its spoken note when
 * it has one.
 */

import { z } from "zod"

import { askId, parseAskId } from "./ask"
import type { Category, Destination } from "./feedback"
import { CATEGORIES, destinationOf, destinationsOf } from "./feedback"
import type { Repo } from "./refs"

export const PENDING_LABELS = ["pending", "from-studio"] as const

/** The mailbox's transcript of a voice note, as far as filing reads it. */
const TranscriptSchema = z.object({
  schema: z.literal("some-ui.voice-transcript/1"),
  note: z.string().min(1),
  of: z.string(),
  ref: z.string(),
  at: z.iso.datetime({ offset: true }),
  text: z.string().trim().min(1),
})

/** A note on an episode, as home files it for the routine. */
const FeedbackSchema = z.object({
  schema: z.literal("some-ui.episode-note/1"),
  note: z.string().min(1),
  feed: z.enum(["call", "playoff-delta"]),
  episode: z.string().min(1),
  atMs: z.number().int().nonnegative(),
  categories: z.array(z.enum(CATEGORIES)).min(1),
  take: z.string().min(1).nullable(),
  writtenAt: z.iso.datetime({ offset: true }),
})

/** What a take is to be filed as. */
export type Pending = {
  /** An answer to an ask. */
  readonly kind: "ask"
  readonly repo: Repo
  /** The issue it is about: for an answer, the ask's number. */
  readonly about: number
}

const ASK = "ask:"

/** The `ref` a take answering `ask` is kept under on home. */
export const answerRef = (ask: {
  readonly repo: Repo
  readonly number: number
}): string => `${ASK}${askId(ask)}`

/** What a Studio take's `ref` says it is to be filed as, or `null`. */
export function pendingOfRef(ref: string): Pending | null {
  if (!ref.startsWith(ASK)) return null
  const ask = parseAskId(ref.slice(ASK.length))
  return ask === null
    ? null
    : { kind: "ask", repo: ask.repo, about: ask.number }
}

/**
 * The line a filed issue ends with. Its wording is how a later run knows a
 * take was filed: changing it would file every past take again.
 */
export const filedLine = (note: string): string =>
  `Kept on home as the take \`${note}\`.`

// A body edited on GitHub ends its lines in CRLF.
const FILED = /^Kept on home as the take `([^`]+)`\.\r?$/gm

function filedNotes(bodies: ReadonlyArray<string>): Set<string> {
  const notes = new Set<string>()
  for (const body of bodies)
    for (const match of body.matchAll(FILED))
      if (match[1] !== undefined) notes.add(match[1])
  return notes
}

/** One take left to file. */
export type TakeToFile = Pending & {
  /** The take's id on home. */
  readonly note: string
  readonly at: string
  /** What home heard, for the routine to paraphrase; never quoted. */
  readonly heard: string
  readonly labels: typeof PENDING_LABELS
  /** The line the issue's body ends with (`filedLine`). */
  readonly line: string
}

/** One place a note on an episode goes, left to file. */
export type FeedbackToFile = {
  readonly kind: "feedback"
  readonly repo: Repo
  /** Where the issue sends it: the feed's next fill, its template, or a slide to fix. */
  readonly goes: Destination
  readonly note: string
  readonly feed: "call" | "playoff-delta"
  readonly episode: string
  readonly atMs: number
  /** Of the note's categories, those that send it here. */
  readonly categories: ReadonlyArray<Category>
  /** When it was written. */
  readonly at: string
  /** What home heard in its spoken note, for the routine to paraphrase; never quoted. */
  readonly heard: string | null
  readonly labels: typeof PENDING_LABELS
  readonly line: string
}

/** One item left to file. */
export type ToFile = TakeToFile | FeedbackToFile

/**
 * The line an issue filed from a note on an episode ends with, one per place
 * it goes. Like `filedLine`, its wording is how a later run knows it was filed.
 */
export const noteFiledLine = (note: string, goes: Destination): string =>
  `Kept on home as the note \`${note}\`, for ${goes}.`

const NOTE_FILED = /^Kept on home as the note `([^`]+)`, for (\w+)\.\r?$/gm

function filedPlaces(bodies: ReadonlyArray<string>): Set<string> {
  const places = new Set<string>()
  for (const body of bodies)
    for (const match of body.matchAll(NOTE_FILED))
      if (match[1] !== undefined && match[2] !== undefined)
        places.add(`${match[1]} ${match[2]}`)
  return places
}

/** A transcript or note that doesn't read, by its place in its list. */
export type Passed = {
  readonly place: number
  readonly why: string
  /** The list it is in; a transcript's when absent. */
  readonly in?: "feedback"
}

/**
 * The takes left to file, oldest said first, from the mailbox's transcripts
 * (one per note, its newest; of two of one note, the later in the list) and the bodies of the issues already labelled
 * `from-studio` in either repository, open or closed: `pending` comes off
 * once the owner starts on one, and `from-studio` never does.
 */
export function toFile(
  transcripts: ReadonlyArray<unknown>,
  filed: ReadonlyArray<string>,
  feedback: ReadonlyArray<unknown> = []
): {
  readonly items: ReadonlyArray<ToFile>
  readonly passed: ReadonlyArray<Passed>
} {
  const done = filedNotes(filed)
  const passed: Array<Passed> = []
  const byNote = new Map<string, TakeToFile>()
  /** What home heard in each note, its newest transcript's. */
  const heardIn = new Map<string, string>()
  transcripts.forEach((raw, place) => {
    const read = TranscriptSchema.safeParse(raw)
    if (!read.success) {
      passed.push({ place, why: "it doesn't read as a voice transcript" })
      return
    }
    const heard = read.data
    heardIn.set(heard.note, heard.text)
    const pending = heard.of === "studio" ? pendingOfRef(heard.ref) : null
    if (pending === null || done.has(heard.note)) return
    byNote.set(heard.note, {
      ...pending,
      note: heard.note,
      at: heard.at,
      heard: heard.text,
      labels: PENDING_LABELS,
      line: filedLine(heard.note),
    })
  })
  const placesDone = filedPlaces(filed)
  const places: Array<FeedbackToFile> = []
  feedback.forEach((raw, place) => {
    const read = FeedbackSchema.safeParse(raw)
    if (!read.success) {
      passed.push({
        place,
        why: "it doesn't read as a note on an episode",
        in: "feedback",
      })
      return
    }
    const note = read.data
    for (const goes of destinationsOf(note.categories)) {
      if (placesDone.has(`${note.note} ${goes}`)) continue
      places.push({
        kind: "feedback",
        repo: "some-ui",
        goes,
        note: note.note,
        feed: note.feed,
        episode: note.episode,
        atMs: note.atMs,
        categories: note.categories.filter((c) => destinationOf(c) === goes),
        at: note.writtenAt,
        heard: note.take === null ? null : (heardIn.get(note.take) ?? null),
        labels: PENDING_LABELS,
        line: noteFiledLine(note.note, goes),
      })
    }
  })
  const items = [...byNote.values(), ...places].sort(
    (a, b) =>
      Date.parse(a.at) - Date.parse(b.at) || a.note.localeCompare(b.note)
  )
  return { items, passed }
}
