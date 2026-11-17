/**
 * Whether this phone is paired with home, once its pairing record has been
 * read (PO1, #3128; `./__tests__/paired-once-read.test.ts`). A one-shot ask
 * of home made as a page opens waits here for the record, which the link
 * reads as it starts (at most `./credential`'s 5 s, usually a few
 * milliseconds), so a paired phone never says it isn't paired. The record's
 * read never rejects: one it can't read is unpaired. Kept out of `./index`,
 * which React imports (R1). Removed in #3152's second part, where an ask
 * made while the record is read waits as the link's own state.
 */
import { homeLink, pairing } from "./index"

export async function pairedOnceRead(): Promise<boolean> {
  await homeLink().load()
  return pairing().kind === "paired"
}
