/**
 * The Monday routine's sample run (RR18, paulgsc/some-ui#2693), laid out as
 * `monday pull` leaves a run's folder, so the same files prove the CLI and the
 * tests, offline (MB1: nothing here is ever put in the live mailbox).
 *
 * - `brief/`: Quillmoss's week 46 (`QUILLMOSS_WEEK`), the only week the
 *   mailbox holds, past its deadline with no essay.
 * - `records/`: home's final record of it: QM-311 and QM-312 answered,
 *   QM-313 opened twice and left silent, and one error pasted on Thursday.
 * - `transcript/`: what home heard in both takes and the paste's note.
 * - `values.json`: what the model wrote from the bundle: the essay's words,
 *   and week 47, Tallowbrook, whose programs rustc 1.97.0 checked.
 *
 * A run at `SAMPLE_NOW`, Monday 16 November 04:00 Pacific, writes week 46's
 * essay and week 47.
 */
import type { MailboxFile } from "@rust-rounds/lib/monday/bundle"
import week46 from "@rust-rounds/lib/monday/sample/brief/rust-week-2026-w46.json"
import record46 from "@rust-rounds/lib/monday/sample/records/2026-w46.json"
import heard311 from "@rust-rounds/lib/monday/sample/transcript/transcript-note-311-1.json"
import heard312 from "@rust-rounds/lib/monday/sample/transcript/transcript-note-312-1.json"
import heardPaste from "@rust-rounds/lib/monday/sample/transcript/transcript-note-p1-1.json"
import values from "@rust-rounds/lib/monday/sample/values.json"

export const SAMPLE_NOW = new Date("2026-11-16T12:00:00Z")

export const SAMPLE_BRIEF: ReadonlyArray<MailboxFile> = [
  { name: "rust-week-2026-w46.json", body: week46 },
]

export const SAMPLE_RECORDS: ReadonlyArray<unknown> = [record46]

export const SAMPLE_TRANSCRIPTS: ReadonlyArray<MailboxFile> = [
  { name: "transcript-note-311-1.json", body: heard311 },
  { name: "transcript-note-312-1.json", body: heard312 },
  { name: "transcript-note-p1-1.json", body: heardPaste },
]

export const SAMPLE_VALUES: unknown = values
