/**
 * What only Rust Rounds' Monday routine (RR18, paulgsc/some-ui#2693) reads in
 * the mailbox: which transcripts its records name. The reads and puts are
 * `@some-ui/video-render/node`'s, which the interview week's routine shares.
 *
 * PN1: `notesNamed` names every note a record names, a ticket's take, each
 * of its points' own takes (RR24), each opening answer's take whatever week
 * it was said in (#3269) and each paste's note, so `monday pull` fetches
 * every transcript the bundle reads. Held by monday.test.ts, which walks a
 * record for every `take` and `note` it holds.
 */
import type { WeekRecord } from "@rust-rounds/lib/monday/record"

/** The take and paste notes home's records name, whose transcripts the essay needs (PN1). */
export function notesNamed(records: ReadonlyArray<WeekRecord>): Set<string> {
  const notes = new Set<string>()
  for (const record of records) {
    for (const ticket of record.tickets) {
      if (ticket.take !== null) notes.add(ticket.take)
      for (const point of ticket.points) notes.add(point.take)
    }
    for (const answer of record.opening) notes.add(answer.take)
    for (const paste of record.pastes)
      if (paste.note !== null) notes.add(paste.note)
  }
  return notes
}
