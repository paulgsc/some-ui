/**
 * The Rust Rounds a viewer can play on the Pages build (#2241; CLAUDE.md, "A
 * viewer tries, and nothing is kept"): the worked example, which the session
 * always holds (`@some-ui/rust-rounds`, `indexing-01`), and one more sample
 * round, `borrowing-01`, each with rustc's results recorded ahead of time and
 * shipped as static data, as LeetType's sample session ships.
 *
 * - **Nothing is kept.** The session's records are the page's storage, which
 *   on this build is an in-memory copy (`./viewer-storage`): a reload starts
 *   over, and nothing of the owner's is here.
 * - **No home.** Every card plays from what is bundled; nothing is fetched.
 *
 * `BORROWING_01_RUNS` is what rustc 1.97.0 (2d8144b78 2026-07-07) printed,
 * recorded as `record` in `lib/demo`'s test does it.
 */
import type {
  Round,
  RustcRun,
  RustRoundsPorts,
  TutorNotes,
} from "@some-ui/rust-rounds"
import {
  INDEXING_01_NOTES,
  keptRounds,
  NOTES_SCHEMA,
  ROUND_SCHEMA,
} from "@some-ui/rust-rounds"
import { onPageVisibility } from "@some-ui/voice-capture"

import { copyText } from "@/lib/clipboard"
import { browserLocalStorage } from "@/lib/tenant/storage"

const PROGRAM = [
  "fn main() {",
  "    let mut v = vec![1, 2, 3];",
  "    let first = &v[0];",
  "    v.push(4);",
  '    println!("{first}");',
  "}",
  "",
].join("\n")

/** A sample round, written in a tutor's format for the viewer to play. */
export const BORROWING_01: Round = {
  schema: ROUND_SCHEMA,
  id: "borrowing-01",
  by: "sample",
  concept: "borrowing",
  edges: ["borrow-overlap", "borrow-ends-at-last-use"],
  cards: [
    {
      kind: "read",
      id: "a",
      program: PROGRAM,
      ask: "What is rustc telling you about line 4, and why does Rust do it this way?",
      expect: { outcome: "compile-error", code: "E0502" },
    },
    {
      kind: "variant",
      id: "b",
      of: "a",
      hunk: { line: 3, replace: "    let first = v[0];" },
      ask: "Line 3 now copies the number out. What changed in what rustc did, and why?",
      expect: { outcome: "prints", stdout: "1" },
    },
    {
      kind: "variant",
      id: "c",
      of: "a",
      hunk: { line: 5, replace: '    println!("{}", v.len());' },
      ask: "Line 5 no longer reads `first`. What does the result tell you about when a borrow ends?",
      expect: { outcome: "prints", stdout: "4" },
    },
  ],
}

/** The tutor notes the sample round goes with: the worked example's, and borrowing's. */
export const SAMPLE_NOTES: TutorNotes = {
  schema: NOTES_SCHEMA,
  by: "sample",
  round: BORROWING_01.id,
  concepts: [
    ...INDEXING_01_NOTES.concepts,
    {
      concept: "borrowing",
      open: [
        {
          edge: "borrow-overlap",
          what: "Reads `&v[0]` as a copy of the number. It is a shared borrow of `v`, and `push` needs `v` mutably while that borrow is still used.",
          notes: [],
        },
        {
          edge: "borrow-ends-at-last-use",
          what: "Expects a borrow to last to the end of the block. rustc ends it at its last use, so a borrow never read after line 3 does not stop line 4.",
          notes: [],
        },
      ],
      smooth: [],
    },
  ],
}

const TOOLCHAIN = "1.97.0"

/** What rustc 1.97.0 did with each card's program, by card id. */
export const BORROWING_01_RUNS: Readonly<Record<string, RustcRun>> = {
  a: {
    outcome: "compile-error",
    toolchain: TOOLCHAIN,
    code: "E0502",
    stderr:
      'error[E0502]: cannot borrow `v` as mutable because it is also borrowed as immutable\n --> main.rs:4:5\n  |\n3 |     let first = &v[0];\n  |                  - immutable borrow occurs here\n4 |     v.push(4);\n  |     ^^^^^^^^^ mutable borrow occurs here\n5 |     println!("{first}");\n  |                ----- immutable borrow later used here\n\nerror: aborting due to 1 previous error\n\nFor more information about this error, try `rustc --explain E0502`.\n',
    span: { lineStart: 4, columnStart: 5, lineEnd: 4, columnEnd: 14 },
  },
  b: {
    outcome: "prints",
    toolchain: TOOLCHAIN,
    compileStderr: "",
    stdout: "1\n",
  },
  c: {
    outcome: "prints",
    toolchain: TOOLCHAIN,
    compileStderr:
      "warning: unused variable: `first`\n --> main.rs:3:9\n  |\n3 |     let first = &v[0];\n  |         ^^^^^ help: if this is intentional, prefix it with an underscore: `_first`\n  |\n  = note: `#[warn(unused_variables)]` (part of `#[warn(unused)]`) on by default\n\nwarning: 1 warning emitted\n\n",
    stdout: "4\n",
  },
}

/**
 * The viewer's Rust Rounds: the session's own store over the page's storage,
 * given the sample round when it holds nothing yet, and the clipboard for
 * "Copy for a tutor". A viewer may paste a tutor's reply too:
 * it plays as on the phone, and goes with the reload like the rest.
 */
export function viewerRustRoundsPorts(): RustRoundsPorts {
  const store = keptRounds(browserLocalStorage)
  if (store.open().held.rounds.length === 0) {
    store.hold({
      ...store.held(),
      rounds: [BORROWING_01],
      runs: Object.fromEntries(
        Object.entries(BORROWING_01_RUNS).map(([card, run]) => [
          `${BORROWING_01.id}/${card}`,
          run,
        ])
      ),
      notes: [SAMPLE_NOTES],
      notesMissing: false,
    })
  }
  return {
    store,
    notes: null,
    copy: copyText,
    now: () => Date.now(),
    newId: () => crypto.randomUUID(),
    onVisibility: onPageVisibility,
    home: false,
  }
}
