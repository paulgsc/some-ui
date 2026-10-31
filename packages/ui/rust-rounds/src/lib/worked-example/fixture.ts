/**
 * One session playing the worked example (`./index`), for tests. The round
 * is the owner's; this session and what is said in it are made up, to show
 * the log's shape. The recorded runs are rustc 1.97.0's real output.
 */
import type { RoundLog } from "@rust-rounds/lib/formats"
import { LOG_SCHEMA } from "@rust-rounds/lib/formats"
import { INDEXING_01_RUNS as RUNS } from "@rust-rounds/lib/worked-example"

export const WORKED_LOG: RoundLog = {
  schema: LOG_SCHEMA,
  sessions: [
    {
      id: "2026-10-29-evening",
      startedAt: "2026-10-29T23:02:00Z",
      cards: [
        {
          round: "indexing-01",
          card: "a",
          at: "2026-10-29T23:02:40Z",
          picked: "Prints z",
          note: "note-0001",
          refines: null,
          skipped: false,
          rustc: RUNS.a ?? null,
        },
        {
          round: "indexing-01",
          card: "b",
          at: "2026-10-29T23:04:05Z",
          picked: "Prints 122",
          note: "note-0002",
          refines: null,
          skipped: false,
          rustc: RUNS.b ?? null,
        },
        {
          round: "indexing-01",
          card: "c",
          at: "2026-10-29T23:05:30Z",
          picked: "Prints é",
          note: "note-0003",
          refines: null,
          skipped: false,
          rustc: RUNS.c ?? null,
        },
        {
          round: "indexing-01",
          card: "d",
          at: "2026-10-29T23:07:10Z",
          picked: null,
          note: null,
          refines: null,
          skipped: true,
          rustc: RUNS.d ?? null,
        },
      ],
      pinned: [{ round: "indexing-01", card: "c" }],
      fromMyDesk: [],
      tutorGuessedWrong: [],
    },
  ],
}

/** What home transcribed, by note id. Text only: the audio never leaves home. */
export const WORKED_TRANSCRIPTS: ReadonlyMap<string, string> = new Map([
  [
    "note-0001",
    "I thought it would print z, because r is three. It doesn't compile. I think you just can't index a string in Rust, because of UTF-8.",
  ],
  [
    "note-0002",
    "as_bytes gives a slice of u8, so indexing it gives a u8, and 122 is the byte for z.",
  ],
  [
    "note-0003",
    "I thought one to two was the é. It panics because é is two bytes, so two is in the middle of it. I'm surprised it compiled at all.",
  ],
])
