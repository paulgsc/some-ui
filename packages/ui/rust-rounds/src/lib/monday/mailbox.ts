/**
 * What only Rust Rounds' Monday routine (RR18, paulgsc/some-ui#2693) reads in
 * the mailbox: which transcripts its records name. The reads and puts are
 * `@some-ui/video-render/node`'s, which the interview week's routine shares.
 */

/**
 * The take and paste notes home's records name, whose transcripts the essay
 * needs: a ticket's, and the opening's answers' (#3269), whichever week
 * they were said in.
 */
export function notesNamed(
  records: ReadonlyArray<{
    readonly tickets: ReadonlyArray<{ readonly take: string | null }>
    readonly opening: ReadonlyArray<{ readonly take: string }>
    readonly pastes: ReadonlyArray<{ readonly note: string | null }>
  }>
): Set<string> {
  const notes = new Set<string>()
  for (const record of records) {
    for (const ticket of record.tickets)
      if (ticket.take !== null) notes.add(ticket.take)
    for (const answer of record.opening) notes.add(answer.take)
    for (const paste of record.pastes)
      if (paste.note !== null) notes.add(paste.note)
  }
  return notes
}
