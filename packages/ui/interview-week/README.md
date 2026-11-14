# @some-ui/interview-week

The interview week (#2931): a week of mock interview and teleprompter reads by
voice on the phone, then an essay on how I communicated. The essay counts
faults and charts them over the weeks; nothing here grades.

## What it holds

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

The interview week's routine (#2935, IW4) and essay (#2937, IW6) call these
measures; until they land, nothing does.
