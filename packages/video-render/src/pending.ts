/**
 * What the owner says in Studio that is filed as a pending issue (SFEED5,
 * #2746; SFEED epic #2670, decisions 6 and 11): a take, kept on home with
 * its transcript, whose `ref` names what it is about. Home never files an
 * issue itself. The daily reflections routine (`packages/ui/topik/ROUTINE.md`,
 * Part E) reads the mailbox's transcripts through `render pending`, which
 * runs `toFile`, and files one issue per take in the repository it concerns,
 * in its own words, never quoting the transcript.
 *
 * This module is the one codec on both sides: the phone names a take with
 * `answerRef` (and SFEED6's feedback with its own kind, added to `KINDS`),
 * and the routine reads the ref back with `pendingOfRef`. Each filed issue
 * carries `filedLine(note)`, so a take already filed (its issue open or
 * closed) is never filed again (`filedNotes`).
 *
 * - **An answer to an ask** (`ask:<repo>-<number>`, the ask's `askId`): the
 *   issue says which option the owner chose, or what they said instead, and
 *   links the ask, which stays open until a session acts on it.
 */

import { z } from "zod"

import { askId } from "./ask"
import { REPOS } from "./refs"
import type { Repo } from "./refs"

/** The labels every pending issue is filed with. */
export const PENDING_LABELS = ["pending", "from-studio"] as const

/** The mailbox's transcript of a voice note, as far as filing reads it. */
const TranscriptSchema = z.object({
  schema: z.literal("some-ui.voice-transcript/1"),
  note: z.string().min(1),
  of: z.string(),
  ref: z.string().nullable(),
  at: z.string(),
  text: z.string(),
})

/** One kind of take that is filed, by the first part of its `ref`. */
type Kind = {
  /** What the rest of the ref names, or `null` when it doesn't read. */
  readonly read: (rest: string) => {
    readonly repo: Repo
    readonly about: number
  } | null
}

const ASK = "ask"

/** Every kind filed, by its ref's prefix (before the first `:`). */
const KINDS = {
  [ASK]: {
    read: (rest) => {
      const match = /^(.+)-([1-9]\d*)$/.exec(rest)
      const repo = REPOS.find((each) => each === match?.[1])
      return repo === undefined || match?.[2] === undefined
        ? null
        : { repo, about: Number(match[2]) }
    },
  },
} as const satisfies Record<string, Kind>

export type PendingKind = keyof typeof KINDS

/** What a take is to be filed as. */
export type Pending = {
  readonly kind: PendingKind
  readonly repo: Repo
  /** The issue it is about: for an answer, the ask's number. */
  readonly about: number
}

/** The `ref` a take answering `ask` is kept under on home. */
export const answerRef = (ask: {
  readonly repo: Repo
  readonly number: number
}): string => `${ASK}:${askId(ask)}`

const isKind = (prefix: string): prefix is PendingKind =>
  Object.hasOwn(KINDS, prefix)

/** What a Studio take's `ref` says it is to be filed as, or `null`. */
export function pendingOfRef(ref: string): Pending | null {
  const colon = ref.indexOf(":")
  if (colon < 0) return null
  const prefix = ref.slice(0, colon)
  if (!isKind(prefix)) return null
  const read = KINDS[prefix].read(ref.slice(colon + 1))
  return read === null ? null : { kind: prefix, ...read }
}

/**
 * The line a filed issue carries, naming the take on home, so the owner's
 * session can find it and no later run files it again.
 */
export const filedLine = (note: string): string =>
  `Kept on home as the take \`${note}\`.`

const FILED = /^Kept on home as the take `([^`]+)`\.$/gm

/** The takes the issues' bodies say were filed already. */
export function filedNotes(bodies: ReadonlyArray<string>): Set<string> {
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
  /** When it was said. */
  readonly at: string
  /** What home heard, for the routine to paraphrase; never quoted. */
  readonly heard: string
  readonly labels: typeof PENDING_LABELS
  /** The line the issue's body ends with (`filedLine`). */
  readonly line: string
}

/** A transcript passed over, and why. */
export type Passed = { readonly place: number; readonly why: string }

/**
 * The takes left to file, oldest said first, from the mailbox's transcripts
 * (each a body as `transcript-<note>-<n>.json` holds it, in any order) and
 * the bodies of the issues already filed with `PENDING_LABELS` in either
 * repository, open or closed. A note heard more than once is filed once,
 * from its last transcript in `transcripts`. A transcript of anything but
 * a Studio take, or of a take whose ref names nothing to file, is not
 * filed and not reported; one that doesn't read is reported by its place.
 */
export function toFile(
  transcripts: ReadonlyArray<unknown>,
  filed: ReadonlyArray<string>
): { readonly items: ReadonlyArray<ToFile>; readonly passed: Array<Passed> } {
  const done = filedNotes(filed)
  const passed: Array<Passed> = []
  const byNote = new Map<string, ToFile>()
  transcripts.forEach((raw, place) => {
    const read = TranscriptSchema.safeParse(raw)
    if (!read.success) {
      passed.push({ place, why: "it doesn't read as a voice transcript" })
      return
    }
    const heard = read.data
    if (heard.of !== "studio" || heard.ref === null) return
    const pending = pendingOfRef(heard.ref)
    if (pending === null || done.has(heard.note)) return
    if (heard.text.trim() === "") {
      passed.push({ place, why: "home heard no words in it" })
      return
    }
    byNote.set(heard.note, {
      ...pending,
      note: heard.note,
      at: heard.at,
      heard: heard.text,
      labels: PENDING_LABELS,
      line: filedLine(heard.note),
    })
  })
  const items = [...byNote.values()].sort(
    (a, b) => a.at.localeCompare(b.at) || a.note.localeCompare(b.note)
  )
  return { items, passed }
}
