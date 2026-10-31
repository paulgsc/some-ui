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
 * `INDEXING_01_RUNS` is what rustc 1.97.0 really printed for each card, as
 * home records a run (RR3, paulgsc/server). The phone plays the example with
 * them until home serves recorded runs of its own. `./fixture` holds one
 * session playing it, for tests.
 */
import type { Round, RustcRun, TutorNotes } from "@rust-rounds/lib/formats"
import { NOTES_SCHEMA, ROUND_SCHEMA } from "@rust-rounds/lib/formats"

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

/** What rustc 1.97.0 did with each card's program, by card id. */
export const INDEXING_01_RUNS: Readonly<Record<string, RustcRun>> = {
  a: E0277,
  b: {
    outcome: "prints",
    toolchain: TOOLCHAIN,
    compileStderr: "",
    stdout: "122\n",
  },
  c: PANIC,
  d: {
    outcome: "prints",
    toolchain: TOOLCHAIN,
    compileStderr: UNUSED_R,
    stdout: "é\n",
  },
}
