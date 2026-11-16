/**
 * What the essay half of the routine reads about a week that ended (IW6,
 * #2937): home's **final** record of it, from the newest interview index
 * (`apps/mailbox` README, `index-interview-…`), and what home heard in each
 * take, **with its words** (a transcript's `words`: each heard word and its
 * times), since IW3's measures count from them. Both are home's, read as home
 * writes them, so unknown keys are dropped rather than refused.
 *
 * - The record is paulgsc/server `GET /interview-weeks/:id/record`: final
 *   once `closed`, with a send that is not a draft, or none.
 * - A transcript is `some-ui.voice-transcript/1`, named
 *   `transcript-<note>-<n>.json`; a better model's goes under a new `<n>`.
 */
import { wordsOf } from "@interview-week/lib/faults"
import type { HeardWord } from "@interview-week/lib/faults"
import { WEEK_ID } from "@interview-week/lib/week"
import { z } from "zod"

const Instant = z.iso.datetime({ offset: true })

const TakeRecord = {
  take: z.string().min(1).nullable(),
  recordedAt: Instant.nullable(),
}

const WeekRecordSchema = z.object({
  week: z.string().regex(WEEK_ID),
  opens: Instant,
  due: Instant,
  closed: z.boolean(),
  sent: z
    .object({ at: Instant, receivedAt: Instant, draft: z.boolean() })
    .nullable(),
  questions: z.array(
    z.object({
      question: z.string().min(1),
      answered: z.boolean(),
      ...TakeRecord,
    })
  ),
  cards: z.array(
    z.object({ card: z.string().min(1), read: z.boolean(), ...TakeRecord })
  ),
  unanswered: z.array(z.string()),
  unread: z.array(z.string()),
})
export type WeekRecord = z.infer<typeof WeekRecordSchema>

/** The newest of home's interview indexes is the greatest name. */
export const INTERVIEW_INDEX = /^index-interview-\d{8}T\d{9}Z\.json$/

/** The final weeks home's interview index lists; anything else lists none. */
export function indexWeeks(body: unknown): Array<WeekRecord> {
  const parsed = z
    .object({
      schema: z.literal("some-ui.routine-index/1"),
      routine: z.literal("interview"),
      weeks: z.array(z.unknown()),
    })
    .safeParse(body)
  if (!parsed.success) return []
  return parsed.data.weeks.flatMap((week) => {
    const read = WeekRecordSchema.safeParse(week)
    if (!read.success) return []
    const record = read.data
    const final = record.closed && record.sent?.draft !== true
    const agrees =
      record.questions.every((q) => q.answered === (q.take !== null)) &&
      record.cards.every((c) => c.read === (c.take !== null))
    return final && agrees ? [record] : []
  })
}

/** The take notes the records name, whose transcripts the essay needs. */
export function notesNamed(records: ReadonlyArray<WeekRecord>): Set<string> {
  const notes = new Set<string>()
  for (const record of records)
    for (const item of [...record.questions, ...record.cards])
      if (item.take !== null) notes.add(item.take)
  return notes
}

/** A transcript's name in the mailbox: `transcript-<note>-<n>.json`. */
const TRANSCRIPT_NAME = /^transcript-(.+)-([1-9]\d{0,18})\.json$/

/** The note a transcript's name carries. */
export const noteOfTranscript = (name: string): string | null =>
  TRANSCRIPT_NAME.exec(name)?.[1] ?? null

const TranscriptSchema = z.object({
  schema: z.literal("some-ui.voice-transcript/1"),
  note: z.string().min(1),
  text: z.string(),
  model: z.string().optional(),
})

/** What home heard in a take: its text, and its words, or null when home kept none. */
export type Heard = {
  readonly text: string
  readonly words: ReadonlyArray<HeardWord> | null
}

/** Home's verbatim decode (IW2): it keeps the fillers a plain one drops. */
const VERBATIM = "+verbatim"

/**
 * What home heard in each note, by the note's id. Of a note's transcripts,
 * the verbatim decode's (IW2's model, `+verbatim-…`) is preferred, since a
 * take heard both ways is filed twice, then the highest `<n>`. A file whose
 * body isn't a transcript of the note its name carries is left out.
 */
export function heardByNote(
  files: ReadonlyArray<{ name: string; body: unknown }>
): ReadonlyMap<string, Heard> {
  const best = new Map<string, { verbatim: boolean; n: bigint; heard: Heard }>()
  for (const file of files) {
    const [, note, n] = TRANSCRIPT_NAME.exec(file.name) ?? []
    if (note === undefined || n === undefined) continue
    const parsed = TranscriptSchema.safeParse(file.body)
    if (!parsed.success || parsed.data.note !== note) continue
    const verbatim = parsed.data.model?.includes(VERBATIM) ?? false
    const held = best.get(note)
    const better =
      held === undefined ||
      (verbatim && !held.verbatim) ||
      (verbatim === held.verbatim && BigInt(n) > held.n)
    if (better)
      best.set(note, {
        verbatim,
        n: BigInt(n),
        heard: { text: parsed.data.text, words: wordsOf(file.body) },
      })
  }
  return new Map([...best].map(([note, { heard }]) => [note, heard]))
}
