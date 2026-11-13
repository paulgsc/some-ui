/**
 * A session's note (SFEED9 #2753, epic #2670 decisions 8 and 9): what one cloud
 * session did, distilled by its own agent before it archives the session,
 * so nothing the session knew lives only in a transcript that is about to
 * close. The note is data, so it lives in `paulgsc/testing`, under
 * `sessions/<ended>-<session id>.json`, never in some-ui or server. The
 * weekly call's routine (`CALL-ROUTINE.md`) reads the week's notes beside
 * the merged pull requests, so a session that left no pull request, or
 * made a call its pull request doesn't say, still reaches the call.
 *
 * Everything in a note is public, as the testing repository is: what was
 * done and decided, never the owner's data.
 *
 * `render session-check` checks the folder, and `python3 scripts/guard.py
 * --staged` in paulgsc/testing says ready before the note is pushed to main.
 */

import { z } from "zod"

import { once, problemsOf } from "./cut-list"
import type { Parsed } from "./cut-list"
import { words } from "./format"
import {
  choiceProblems,
  ChoiceSchema,
  epicTag,
  IssueSchema,
  PrSchema,
} from "./refs"

export const SESSION_NOTE_SCHEMA = "some-ui.session-note/1"

/** A cloud session's id, as its link ends: "session_01LDpd…". */
const sessionId = z.string().regex(/^session_[A-Za-z0-9]{8,64}$/)

export const SessionNoteSchema = z.strictObject({
  schema: z.literal(SESSION_NOTE_SCHEMA),
  session: sessionId,
  /** The day it ended, in UTC, as `YYYY-MM-DD`: the week whose call reads it. */
  ended: z.iso.date(),
  /** The epics it worked, by the tag their titles carry: "SFEED". */
  epics: z.array(epicTag).max(12),
  /** The pull requests it opened, merged or not. */
  pulls: z.array(PrSchema).max(40),
  /** What it did, in a few spoken sentences, in the owner's terms. */
  did: words,
  /** Calls it made without the owner's word, worth hearing. */
  calls: z.array(ChoiceSchema).max(8),
  /** What it left undone, each with why. */
  left: z.array(words).max(12),
  /** The issues it left waiting on the owner: asks, mostly. */
  waits: z.array(IssueSchema).max(12),
})

export type SessionNote = z.infer<typeof SessionNoteSchema>

/** The note, or every reason it can't be read: a call's options contradicting it among them. */
export function parseSessionNote(raw: unknown): Parsed<SessionNote> {
  const parsed = SessionNoteSchema.safeParse(raw)
  if (!parsed.success)
    return { ok: false, problems: problemsOf(parsed.error, "session note") }
  const problems = parsed.data.calls.flatMap((call, i) =>
    choiceProblems(`calls.${i}`, call)
  )
  return problems.length > 0
    ? { ok: false, problems }
    : { ok: true, value: parsed.data }
}

const sessionNoteFile = (note: SessionNote): string =>
  `${note.ended}-${note.session}.json`

/**
 * Every reason a `sessions/` folder can't be published: a note that doesn't
 * parse, or a file not named for the note it holds. `files` is the folder's
 * JSON files by name.
 */
export function sessionFolderProblems(
  files: ReadonlyMap<string, unknown>
): Array<string> {
  const problems: Array<string> = []
  for (const [name, raw] of files) {
    const note = parseSessionNote(raw)
    if (!note.ok) {
      problems.push(...note.problems.map((p) => `${name}: ${p}`))
      continue
    }
    const want = sessionNoteFile(note.value)
    if (name !== want) problems.push(`${name}: it holds ${want}`)
  }
  return once(problems)
}
