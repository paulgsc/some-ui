# @some-ui/rust-rounds

Rust Rounds is a voice-first phone session over real rustc results, with any
agent as the tutor (epic #2231). This workspace holds the contract every tutor
writes to and the phone reads (#2232). The phone session itself is RR4
(#2235), and home's recording of each program is RR3 (paulgsc/server).

## What is here

- `ROUTINE.md`: the tutor's instructions and the three formats, field by
  field, written so any agent can follow them. A test holds it to naming
  every field and value the schemas have, and to the lint's caps.
- `src/lib/formats`: the zod schemas, each tagged by `schema`:
  `some-ui.rust-round/1` (a round of cards), `some-ui.rust-round-log/1` (what
  happened in each session) and `some-ui.rust-tutor-notes/1` (the open and
  smoothed rough edges per concept). Also `resolvePrograms` (each card's
  program, a variant's built from its hunk) and `expectMatches` (whether a
  tutor's guess is what rustc did, which is how `tutorGuessedWrong` is
  decided).
- `src/lib/lint`: what makes a round hard to play on a phone. It reports
  findings and never refuses.
- `src/lib/intake`: takes a tutor's reply, pasted or read from home, and
  refuses a malformed one with a fix request for the tutor.
- `src/lib/tutor-copy`: "Copy for a tutor", the log as markdown with the
  transcripts inline, the instructions and one worked example.
- `src/lib/worked-example`: the owner's UTF-8 round, `indexing-01`, checked
  against rustc 1.97.0.

Everything here is pure: nothing is sent, stored or played.

## Rules

- **Never imports `@some-ui/leetype`.** The two may share infrastructure,
  never product logic. `eslint.config.js` refuses the import.
- **Nothing grades.** The formats have no place for a right answer, a rubric,
  a score or a level, and every object is strict, so a tutor cannot add one.
- **No audio in the log.** Voice notes are named by id; their transcripts
  come from home as text.
