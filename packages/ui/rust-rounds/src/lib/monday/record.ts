/**
 * What the Monday routine reads about a week that ended (RR18,
 * paulgsc/some-ui#2693): home's **final** record of it, and what home heard in
 * each take. Both are home's, read as home writes them, so unknown keys are
 * dropped rather than refused: a newer home may say more.
 *
 * - The record is `GET /rust-weeks/:id/record`'s answer (paulgsc/server
 *   `handlers/rust_week_record.rs`, `WeekRecord`), read only once it is final:
 *   `closed`, and a send that is not a draft, or none. A draft is never what
 *   the owner sent (#2231, "The record is final only after `due`").
 * - A transcript is `some-ui.voice-transcript/1` (the mailbox's `transcript`
 *   folder). A take's `ref` is `<week>:<ticket>`; a pasted error's note is
 *   `<week>:PASTE:<at>` (paulgsc/server `voice_repo::is_rust_round_ref`).
 */
import { WEEK_ID } from "@rust-rounds/lib/formats/week"
import { z } from "zod"

const Instant = z.iso.datetime({ offset: true })

const PasteSchema = z.object({
  at: Instant,
  text: z.string().min(1),
  note: z.string().min(1).nullable(),
})

const TicketRecordSchema = z.object({
  ticket: z.string().min(1),
  answered: z.boolean(),
  take: z.string().min(1).nullable(),
  recordedAt: Instant.nullable(),
  opens: z.int().nonnegative(),
})

export const WeekRecordSchema = z.object({
  week: z.string().regex(WEEK_ID),
  opens: Instant,
  due: Instant,
  closed: z.boolean(),
  sent: z
    .object({ at: Instant, receivedAt: Instant, draft: z.boolean() })
    .nullable(),
  tickets: z.array(TicketRecordSchema),
  unanswered: z.array(z.string()),
  pastes: z.array(PasteSchema),
})
export type WeekRecord = z.infer<typeof WeekRecordSchema>

/** A week's record, once home made it final; otherwise why it can't be read as final. */
export function readFinalRecord(
  input: unknown
): { ok: true; record: WeekRecord } | { ok: false; why: string } {
  const parsed = WeekRecordSchema.safeParse(input)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return {
      ok: false,
      why: `it isn't home's record of a week (${issue?.path.join(".") ?? ""}: ${issue?.message ?? ""})`,
    }
  }
  const record = parsed.data
  if (!record.closed || record.sent?.draft === true) {
    return { ok: false, why: "home hasn't made it final yet" }
  }
  for (const ticket of record.tickets) {
    if (ticket.answered !== (ticket.take !== null)) {
      return {
        ok: false,
        why: `${ticket.ticket} says answered and its take disagree`,
      }
    }
  }
  return { ok: true, record }
}

const TRANSCRIPT_SCHEMA = "some-ui.voice-transcript/1"

export const TranscriptSchema = z.object({
  schema: z.literal(TRANSCRIPT_SCHEMA),
  note: z.string().min(1),
  of: z.string(),
  ref: z.string().nullable().optional(),
  at: z.string(),
  text: z.string(),
})

/** A transcript's name in the mailbox: `transcript-<note>-<n>.json`. */
export const TRANSCRIPT_NAME = /^transcript-(.+)-([1-9]\d{0,18})\.json$/

/**
 * What home heard in each note, by the note's id: the transcript with the
 * highest `<n>` (compared as a number), since a better model's goes under a
 * new name. A file whose body isn't a transcript of the note its name carries
 * is left out.
 */
export function heardByNote(
  files: ReadonlyArray<{ name: string; body: unknown }>
): ReadonlyMap<string, string> {
  const best = new Map<string, { n: bigint; text: string }>()
  for (const file of files) {
    const [, note, n] = TRANSCRIPT_NAME.exec(file.name) ?? []
    if (note === undefined || n === undefined) continue
    const parsed = TranscriptSchema.safeParse(file.body)
    if (!parsed.success || parsed.data.note !== note) continue
    const held = best.get(note)
    if (held === undefined || BigInt(n) > held.n) {
      best.set(note, { n: BigInt(n), text: parsed.data.text })
    }
  }
  return new Map([...best].map(([note, { text }]) => [note, text]))
}

/**
 * The weeks home's Rust Rounds index lists (`apps/mailbox` README, "The Rust
 * Rounds index"): `{"schema":"some-ui.routine-index/1","routine":"rust",
 * "asOf","weeks":[<record>…]}`. Anything else lists none.
 */
export function indexWeeks(body: unknown): Array<WeekRecord> {
  const parsed = z
    .object({
      schema: z.literal("some-ui.routine-index/1"),
      routine: z.literal("rust"),
      weeks: z.array(z.unknown()),
    })
    .safeParse(body)
  if (!parsed.success) return []
  return parsed.data.weeks.flatMap((week) => {
    const read = WeekRecordSchema.safeParse(week)
    return read.success ? [read.data] : []
  })
}
