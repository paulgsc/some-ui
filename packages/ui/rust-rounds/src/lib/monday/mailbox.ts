/**
 * What only Rust Rounds' Monday routine (RR18, paulgsc/some-ui#2693) reads in
 * the mailbox: which transcripts its records name. The reads and puts are
 * `@some-ui/video-render/node`'s, which the interview week's routine shares.
 */
import { TRANSCRIPT_NAME } from "@rust-rounds/lib/monday/record"

/** The take and paste notes home's records name, whose transcripts the essay needs. */
export function notesNamed(
  records: ReadonlyArray<{
    readonly tickets: ReadonlyArray<{ readonly take: string | null }>
    readonly pastes: ReadonlyArray<{ readonly note: string | null }>
  }>
): Set<string> {
  const notes = new Set<string>()
  for (const record of records) {
    for (const ticket of record.tickets)
      if (ticket.take !== null) notes.add(ticket.take)
    for (const paste of record.pastes)
      if (paste.note !== null) notes.add(paste.note)
  }
  return notes
}

/** The note a transcript's name carries: `transcript-<note>-<n>.json`. */
export function noteOfTranscript(name: string): string | null {
  return TRANSCRIPT_NAME.exec(name)?.[1] ?? null
}
