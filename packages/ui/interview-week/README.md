# @some-ui/interview-week

The interview week (#2931): a week of mock interview and teleprompter reads by
voice on the phone, then an essay on how I communicated. The essay counts
faults and charts them over the weeks; nothing here grades.

## What it holds

`src/lib/week` (#2935): the week's format, `some-ui.interview-week/1`, and
`readWeek`, the one door a week comes in by. A week sets an invented company
and role, 4 to 6 questions from a closed list of families
(`FAMILIES`: about yourself, a time you…, why this role, strengths and
weaknesses, a decision), and 2 to 4 teleprompter cards, each presenting an
epic, a doc or a declared invariant of this repo. Ids follow IW1's refs: a
week is `YYYY-wNN`, a question or card a kebab slug of at most 64
characters, and no question is named `read`.

`src/lib/monday` and `scripts/monday.ts` (#2935): the Monday routine that
writes each week, run as `ROUTINE.md` says. Code chooses every question's
family and variant, each decision question's recorded call, and each card's
source and situation, each rotated least recently asked first; the model
writes only the words, and `finish` checks their lengths, the schema, and
that no real employer is named (C277–C280).

`src/lib/faults` (#2934): the faults of one take, from the words home heard
(`some-ui.voice-transcript/1`'s `words`, each with its timing and `p`).

- **An answer** (`measureAnswer`), against the question's target length:
  fillers and fillers a minute, pauses between words and the longest, the
  silence before the first word and after the last, mumbled words, words a
  minute, and spoken time against the target.
- **A teleprompter read** (`measureRead`), against the card's script: words
  skipped, substituted, repeated and inserted by a word-level alignment,
  pauses at the script's breaks against pauses inside a phrase, pace and its
  variation across phrases, and the lead-in from the cue to the first word.
- **The judged half** (`JudgedAnswerSchema`): STAR, hedges, and a decision
  question's parts.

The thresholds are in `thresholds.ts` (C263–C266); the filler list is
`fillers.json` (C265), which home's transcriber copies (#2933).

## Limits

- Words are compared as written: a script's "2" and a heard "two" are a
  substitution. `@some-ui/video-render`'s `tokenized` folds spoken numbers,
  but also drops a plural "s" and joins hyphenated words, so it is not used.
- The alignment takes the fewest changes, so a word said twice in place of the
  next one ("a a c" for "a b c") is one substitution, not a repeat and a skip.
- A full stop inside an abbreviation ("e.g.") is a break of the script.
- A hyphenated word counts as one word per part ("state-of-the-art" is four),
  each with the whole word's timing.
- Pitch and loudness need the audio, so they are home's (#2942), not here.

## What reaches it

The interview week's essay (#2937, IW6) will call these measures; until it
lands, nothing does. The week's routine runs from this workspace's own
`monday` script, which no deployable imports, so `report:vestiges` may still
list the workspace as unreached until the phone plays a week (IW5).
