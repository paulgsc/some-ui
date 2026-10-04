/**
 * Margin notes (canon `adaptive-learning-canon.typ` Rem. 3.7): what the
 * learner says about whichever artifact of a round is showing, at any
 * moment, before or after they commit.
 *
 * The four kinds separate the two reasons a learner stops, which nothing
 * else on the round surface can tell apart: they cannot tell what is being
 * asked (`unclear`), or they understand the question and do not know the
 * answer (`gap`). `wrong` disputes the artifact itself (Rem. 3.4's disputed
 * key, raised on an artifact), and `thought` is anything else. The kind
 * alone is a complete note; free text, typed or spoken, is optional.
 *
 * # Not evidence
 *
 * A note carries no outcome, so it is not an observation (Def. 3.1), and
 * Prop. 3.4 holds for it: nothing that updates the ledger or draws the next
 * round (`lib/leetype/ledger`, `lib/leetype/round-sampler`) reads a note.
 * What reads one is the generation prompt (`lib/leetype/generation`,
 * Rem. 3.3), and the learner, on the session-complete screen.
 *
 * # Bounded, on the device
 *
 * At most `NOTE_LIMIT` are kept, the most recent, each for `NOTE_TTL_MS`,
 * with free text cut at `NOTE_TEXT_MAX` (Rem. 3.7, Rem. 7.5). They stay on
 * the device (Rem. 7.3; `./store`). A spoken note is kept as its transcript;
 * the audio is never written anywhere (`./dictation`).
 */

import { z } from "zod"

export const NOTE_KINDS = ["unclear", "gap", "wrong", "thought"] as const
export type NoteKind = (typeof NOTE_KINDS)[number]

/** Each kind as the chip that raises it says it, and as the prompt names it. */
export const NOTE_KIND_COPY: Readonly<
  Record<NoteKind, { readonly label: string; readonly prompt: string }>
> = {
  unclear: {
    label: "Not sure what it's asking",
    prompt: "could not tell what was being asked",
  },
  gap: { label: "I don't know this", prompt: "did not know this" },
  wrong: { label: "This looks wrong", prompt: "thinks this is wrong" },
  thought: { label: "Just a thought", prompt: "noted" },
}

/** Rem. 3.7: at most thirty, the most recent. */
export const NOTE_LIMIT = 30
/** Rem. 3.7: each note expires after thirty days. */
export const NOTE_TTL_MS = 30 * 24 * 60 * 60 * 1000
/** Rem. 3.7: free text is cut at five hundred characters. */
export const NOTE_TEXT_MAX = 500

/**
 * The round surface's artifacts (Def. 9.2, `ArtifactSwitcher`'s
 * `ArtifactId`), as a note records which one was showing. Kept as its own
 * list so a stored note is validated on read; `RoundSession` passes an
 * `ArtifactId` into it, so a new artifact fails `tsc` there until it is
 * added here.
 */
const NOTE_ARTIFACTS = [
  "algorithm",
  "constraintDiff",
  "budget",
  "diffSet",
  "optionSet",
  "runResult",
] as const
type NoteArtifact = (typeof NOTE_ARTIFACTS)[number]

/**
 * Each artifact as a noun phrase, for the prompt and the composer's own
 * copy ("noted on the rewrites"); the tab labels ("Which proposition?")
 * do not read as one.
 */
export const NOTE_ARTIFACT_NAMES: Readonly<Record<NoteArtifact, string>> = {
  algorithm: "the program",
  constraintDiff: "the bounds",
  budget: "the budget",
  diffSet: "the rewrites",
  optionSet: "the proposition question",
  runResult: "the runs",
}

const NoteAnchorSchema = z.object({
  /** The round's id, as authored; `own` says whose round it was. */
  roundId: z.string().min(1),
  /** Whether it was the learner's own round rather than the corpus's. */
  own: z.boolean(),
  artifact: z.enum(NOTE_ARTIFACTS),
  /** The authored index of the member of `D` picked, if one was. */
  picked: z.number().int().nonnegative().nullable(),
  /** Whether `(d, p)` had been committed. */
  committed: z.boolean(),
  /** `RoundSession`'s session id, so the session-complete screen lists its own. */
  sessionId: z.string().min(1),
})
export type NoteAnchor = z.infer<typeof NoteAnchorSchema>

export const RoundNoteSchema = z.object({
  id: z.string().min(1),
  /** ISO 8601, UTC: when the kind was picked. */
  at: z.string().min(1),
  kind: z.enum(NOTE_KINDS),
  /** Free text, typed or transcribed; empty when the kind said it all. */
  text: z.string().max(NOTE_TEXT_MAX),
  /** Whether any of `text` was spoken. */
  spoken: z.boolean(),
  anchor: NoteAnchorSchema,
})
export type RoundNote = z.infer<typeof RoundNoteSchema>

/** `text`, trimmed and cut to `NOTE_TEXT_MAX`. */
export function clampNoteText(text: string): string {
  return text.trim().slice(0, NOTE_TEXT_MAX)
}

/** Two pieces of free text joined by one space, as a transcript is appended. */
export function appendNoteText(text: string, more: string): string {
  return clampNoteText([text.trim(), more.trim()].filter(Boolean).join(" "))
}

/**
 * The notes Rem. 3.7 keeps: unexpired at `now`, one per id, newest first,
 * at most `NOTE_LIMIT`. Total: a note with an unreadable time is dropped.
 */
export function boundNotes(
  notes: ReadonlyArray<RoundNote>,
  now: number
): Array<RoundNote> {
  const seen = new Set<string>()
  return notes
    .map((note) => ({ note, time: Date.parse(note.at) }))
    .filter(({ time }) => Number.isFinite(time) && now - time < NOTE_TTL_MS)
    .sort((a, b) => b.time - a.time)
    .filter(({ note }) => {
      if (seen.has(note.id)) return false
      seen.add(note.id)
      return true
    })
    .slice(0, NOTE_LIMIT)
    .map(({ note }) => note)
}

/** How many notes the generation prompt carries, newest first. */
export const PROMPT_NOTES = 10

/**
 * One line per note for the generation prompt (Rem. 3.3): which round and
 * artifact, when, the kind in words, and the learner's own words quoted.
 */
export function promptLinesOf(notes: ReadonlyArray<RoundNote>): Array<string> {
  return notes.slice(0, PROMPT_NOTES).map(({ kind, text, anchor }) => {
    const where = `${NOTE_ARTIFACT_NAMES[anchor.artifact]} of ${anchor.own ? "their own round" : `round \`${anchor.roundId}\``}`
    const when = anchor.committed ? "after answering" : "before answering"
    // One line per note: a newline typed into the note must not start a
    // line of its own in the prompt.
    const flat = text.replace(/\s+/g, " ").trim().replaceAll('"', "'")
    const words = flat === "" ? "" : `: "${flat}"`
    return `- On ${where}, ${when}, the learner ${NOTE_KIND_COPY[kind].prompt}${words}`
  })
}
