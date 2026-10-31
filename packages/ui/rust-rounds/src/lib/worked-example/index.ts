/**
 * The worked example: the owner's open UTF-8 round from the ChatGPT thread
 * (#2231), as `indexing-01`, with the tutor notes it was written with.
 *
 * Every rustc fact in it was checked against rustc 1.97.0 (`--edition 2021`,
 * the program saved as `main.rs`):
 *
 * | Line 4             | rustc 1.97                                         |
 * | ------------------ | -------------------------------------------------- |
 * | `s[r]`             | E0277, "the type `str` cannot be indexed by `usize`" |
 * | `s.as_bytes()[r]`  | prints `122`                                       |
 * | `&s[1..2]`         | panics: "end byte index 2 is not a char boundary"  |
 * | `&s[1..3]`         | prints `é`                                         |
 *
 * `WORKED_LOG` and `WORKED_TRANSCRIPTS` are one session playing it. The round
 * is the owner's; that session and what is said in it are made up, to show
 * the log's shape. The recorded runs in it are rustc's real output.
 */
import type {
  Round,
  RoundLog,
  RustcRun,
  TutorNotes,
} from "@rust-rounds/lib/formats"
import {
  LOG_SCHEMA,
  NOTES_SCHEMA,
  ROUND_SCHEMA,
} from "@rust-rounds/lib/formats"

const PROGRAM = [
  "fn main() {",
  '    let s = "aéz";',
  "    let r: usize = 3;",
  "    let c = s[r];",
  '    println!("{c}");',
  "}",
  "",
].join("\n")

export const INDEXING_01: Round = {
  schema: ROUND_SCHEMA,
  id: "indexing-01",
  by: "chatgpt",
  concept: "indexing",
  edges: ["str-index-trait", "char-boundary-runtime"],
  cards: [
    {
      kind: "read",
      id: "a",
      program: PROGRAM,
      ask: "What does rustc do with line 4?",
      choices: [
        {
          pick: "Refuses to compile it",
          say: "Say why rustc refuses `s[r]`: which trait is missing, and for which type?",
        },
        {
          pick: "Prints z",
          say: "Say what `s[r]` would have to return to print z, and what type `c` would be.",
        },
        {
          pick: "Prints 122",
          say: "Say what type `c` would need to be to print 122.",
        },
        {
          pick: "Not sure",
          say: "Say what you would check first to find out.",
        },
      ],
      expect: { outcome: "compile-error", code: "E0277" },
    },
    {
      kind: "variant",
      id: "b",
      of: "a",
      hunk: { line: 4, replace: "    let c = s.as_bytes()[r];" },
      ask: "Line 4 now indexes the bytes. What happens?",
      choices: [
        {
          pick: "Prints 122",
          say: "Say what `s.as_bytes()` is, and why indexing it with `r` compiles when `s[r]` did not.",
        },
        {
          pick: "Prints z",
          say: "Say what type `c` is now, and how it would print as z.",
        },
        {
          pick: "Not sure",
          say: "Say what you think `as_bytes` hands back.",
        },
      ],
      expect: { outcome: "prints", stdout: "122" },
    },
    {
      kind: "variant",
      id: "c",
      of: "a",
      hunk: { line: 4, replace: "    let c = &s[1..2];" },
      ask: "A range instead of an index. What happens?",
      choices: [
        {
          pick: "Refuses to compile it",
          say: "Say which check stops it, and how rustc could make that check before it runs.",
        },
        {
          pick: "Panics",
          say: "Say what is checked, and why it is checked while the program runs.",
        },
        {
          pick: "Prints é",
          say: "Say which bytes of `s` the range `1..2` covers.",
        },
        {
          pick: "Not sure",
          say: "Say where é starts and ends in the bytes of `s`.",
        },
      ],
      expect: { outcome: "panics" },
    },
    {
      kind: "variant",
      id: "d",
      of: "a",
      hunk: { line: 4, replace: "    let c = &s[1..3];" },
      ask: "The range now ends at byte 3. What happens?",
      choices: [
        {
          pick: "Prints é",
          say: "Say why `1..3` is a range rustc's slicing accepts here.",
        },
        {
          pick: "Panics",
          say: "Say which byte you think the range ends inside.",
        },
        {
          pick: "Not sure",
          say: "Say how many bytes é takes in UTF-8.",
        },
      ],
      expect: { outcome: "prints", stdout: "é" },
    },
  ],
}

export const INDEXING_01_NOTES: TutorNotes = {
  schema: NOTES_SCHEMA,
  by: "chatgpt",
  round: "indexing-01",
  concepts: [
    {
      concept: "indexing",
      open: [
        {
          edge: "str-index-trait",
          what: "Says a string can't be indexed 'because of UTF-8'. rustc's reason is a trait: `usize` doesn't implement `SliceIndex<str>`, while ranges of `usize` do.",
          notes: [],
        },
        {
          edge: "char-boundary-runtime",
          what: "Expects a slice through the middle of a character to be refused when compiling. A range is a valid `SliceIndex<str>`, so it compiles; the char boundary is checked when it runs, and fails as a panic.",
          notes: [],
        },
      ],
      smooth: [],
    },
  ],
}

const TOOLCHAIN = "1.97.0"

const E0277: RustcRun = {
  outcome: "compile-error",
  toolchain: TOOLCHAIN,
  code: "E0277",
  stderr:
    "error[E0277]: the type `str` cannot be indexed by `usize`\n --> main.rs:4:15\n  |\n4 |     let c = s[r];\n  |               ^ string indices are ranges of `usize`\n  |\n  = help: the trait `SliceIndex<str>` is not implemented for `usize`\nhelp: `usize` implements trait `SliceIndex<T>`\n --> /rustc/2d8144b7880597b6e6d3dfd63a9a9efae3f533d3/library/core/src/slice/index.rs:214:0\n  |\n  = note: `SliceIndex<[T]>`\n --> /rustc/2d8144b7880597b6e6d3dfd63a9a9efae3f533d3/library/core/src/bstr/traits.rs:197:0\n  |\n  = note: `SliceIndex<ByteStr>`\n  = note: required for `str` to implement `Index<usize>`\n\nerror: aborting due to 1 previous error\n\nFor more information about this error, try `rustc --explain E0277`.\n",
  span: { line: 4, column: 15, endLine: 4, endColumn: 16 },
}

const PANIC: RustcRun = {
  outcome: "panics",
  toolchain: TOOLCHAIN,
  stdout: "",
  stderr:
    "\nthread 'main' (15505) panicked at main.rs:4:15:\nend byte index 2 is not a char boundary; it is inside 'é' (bytes 1..3 of string)\nnote: run with `RUST_BACKTRACE=1` environment variable to display a backtrace\n",
}

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
          skipped: false,
          rustc: E0277,
        },
        {
          round: "indexing-01",
          card: "b",
          at: "2026-10-29T23:04:05Z",
          picked: "Prints 122",
          note: "note-0002",
          skipped: false,
          rustc: { outcome: "prints", toolchain: TOOLCHAIN, stdout: "122\n" },
        },
        {
          round: "indexing-01",
          card: "c",
          at: "2026-10-29T23:05:30Z",
          picked: "Prints é",
          note: "note-0003",
          skipped: false,
          rustc: PANIC,
        },
        {
          round: "indexing-01",
          card: "d",
          at: "2026-10-29T23:07:10Z",
          picked: null,
          note: null,
          skipped: true,
          rustc: { outcome: "prints", toolchain: TOOLCHAIN, stdout: "é\n" },
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
