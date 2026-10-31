/**
 * One session playing the worked example (`./index`), for tests. The round
 * is the owner's; this session and what is said in it are made up, to show
 * the log's shape. The recorded runs are rustc 1.97.0's real output.
 */
import type { RoundLog, RustcRun } from "@rust-rounds/lib/formats"
import { LOG_SCHEMA } from "@rust-rounds/lib/formats"

const TOOLCHAIN = "1.97.0"

/** rustc's warning for cards c and d, whose line 4 no longer reads `r`. */
const UNUSED_R =
  "warning: unused variable: `r`\n --> main.rs:3:9\n  |\n3 |     let r: usize = 3;\n  |         ^ help: if this is intentional, prefix it with an underscore: `_r`\n  |\n  = note: `#[warn(unused_variables)]` (part of `#[warn(unused)]`) on by default\n\nwarning: 1 warning emitted\n\n"

const E0277: RustcRun = {
  outcome: "compile-error",
  toolchain: TOOLCHAIN,
  code: "E0277",
  stderr:
    "error[E0277]: the type `str` cannot be indexed by `usize`\n --> main.rs:4:15\n  |\n4 |     let c = s[r];\n  |               ^ string indices are ranges of `usize`\n  |\n  = help: the trait `SliceIndex<str>` is not implemented for `usize`\nhelp: `usize` implements trait `SliceIndex<T>`\n --> /rustc/2d8144b7880597b6e6d3dfd63a9a9efae3f533d3/library/core/src/slice/index.rs:214:0\n  |\n  = note: `SliceIndex<[T]>`\n --> /rustc/2d8144b7880597b6e6d3dfd63a9a9efae3f533d3/library/core/src/bstr/traits.rs:197:0\n  |\n  = note: `SliceIndex<ByteStr>`\n  = note: required for `str` to implement `Index<usize>`\n\nerror: aborting due to 1 previous error\n\nFor more information about this error, try `rustc --explain E0277`.\n",
  span: { lineStart: 4, columnStart: 15, lineEnd: 4, columnEnd: 16 },
}

const PANIC: RustcRun = {
  outcome: "panics",
  toolchain: TOOLCHAIN,
  compileStderr: UNUSED_R,
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
          refines: null,
          skipped: false,
          rustc: E0277,
        },
        {
          round: "indexing-01",
          card: "b",
          at: "2026-10-29T23:04:05Z",
          picked: "Prints 122",
          note: "note-0002",
          refines: null,
          skipped: false,
          rustc: {
            outcome: "prints",
            toolchain: TOOLCHAIN,
            compileStderr: "",
            stdout: "122\n",
          },
        },
        {
          round: "indexing-01",
          card: "c",
          at: "2026-10-29T23:05:30Z",
          picked: "Prints é",
          note: "note-0003",
          refines: null,
          skipped: false,
          rustc: PANIC,
        },
        {
          round: "indexing-01",
          card: "d",
          at: "2026-10-29T23:07:10Z",
          picked: null,
          note: null,
          refines: null,
          skipped: true,
          rustc: {
            outcome: "prints",
            toolchain: TOOLCHAIN,
            compileStderr: UNUSED_R,
            stdout: "é\n",
          },
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
