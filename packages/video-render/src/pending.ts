/**
 * What the owner says in Studio that is filed as a pending issue (SFEED5,
 * #2746): a take kept on home whose `ref` names what it is about, filed by
 * the reflections routine (`packages/ui/topik/ROUTINE.md`, part E) through
 * `render pending`, which runs `toFile`. Each filed issue ends with
 * `filedLine(note)`, so no take is filed twice. A new kind of take to file
 * (SFEED6's feedback) is a branch in `pendingOfRef` and a bullet in part E's
 * E3, never a second way of filing.
 */

import { z } from "zod"

import { askId, parseAskId } from "./ask"
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

const FILED = /^Kept on home as the take `([^`]+)`\.$/gm

function filedNotes(bodies: ReadonlyArray<string>): Set<string> {
  const notes = new Set<string>()
  for (const body of bodies)
    for (const match of body.matchAll(FILED))
      if (match[1] !== undefined) notes.add(match[1])
  return notes
}

/** One take left to file. */
export type ToFile = Pending & {
  /** The take's id on home. */
  readonly note: string
  readonly at: string
  /** What home heard, for the routine to paraphrase; never quoted. */
  readonly heard: string
  readonly labels: typeof PENDING_LABELS
  /** The line the issue's body ends with (`filedLine`). */
  readonly line: string
}

/** A transcript that doesn't read, by its place in the list. */
export type Passed = { readonly place: number; readonly why: string }

/**
 * The takes left to file, oldest said first, from the mailbox's transcripts
 * (one per note, its newest) and the bodies of the issues already labelled
 * `from-studio` in either repository, open or closed: `pending` comes off
 * once the owner starts on one, and `from-studio` never does.
 */
export function toFile(
  transcripts: ReadonlyArray<unknown>,
  filed: ReadonlyArray<string>
): {
  readonly items: ReadonlyArray<ToFile>
  readonly passed: ReadonlyArray<Passed>
} {
  const done = filedNotes(filed)
  const passed: Array<Passed> = []
  const items: Array<ToFile> = []
  transcripts.forEach((raw, place) => {
    const read = TranscriptSchema.safeParse(raw)
    if (!read.success) {
      passed.push({ place, why: "it doesn't read as a voice transcript" })
      return
    }
    const heard = read.data
    const pending = heard.of === "studio" ? pendingOfRef(heard.ref) : null
    if (pending === null || done.has(heard.note)) return
    items.push({
      ...pending,
      note: heard.note,
      at: heard.at,
      heard: heard.text,
      labels: PENDING_LABELS,
      line: filedLine(heard.note),
    })
  })
  items.sort(
    (a, b) =>
      Date.parse(a.at) - Date.parse(b.at) || a.note.localeCompare(b.note)
  )
  return { items, passed }
}
