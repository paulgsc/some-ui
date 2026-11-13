# @some-ui/interview-week

The interview week (#2931): a week of mock interview and teleprompter reads by
voice on the phone, then an essay on how I communicated. The essay counts
faults and charts them over the weeks; nothing here grades.

## What is here today

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
- **The judged half** (`JudgedAnswerSchema`): STAR parts as covered, partly
  or missing, hedges, and for a decision question its options, why, trade-off
  and undo. The model fills it; code only types it (LEVERS, #2162).

The measures are pure: no clock, network or storage. Each threshold is a named
constant in `thresholds.ts` with where its value comes from, and a call in
`docs/calls.json` (C263–C266).

`fillers.json` is the canonical closed list of fillers. Home's transcriber
(paulgsc/server, #2933) keeps the same fillers in its prompt and cites this
file.

## Limits

- Words are compared as written: a script's "2" and a heard "two" are a
  substitution.
- Pitch and loudness need the audio, so they are home's (#2942), not here.

## What reaches it

Nothing yet. The interview week's routine (#2935, IW4) and its essay (#2937,
IW6) are the next stories and call these measures; the phone's screen (#2936,
IW5) joins them here.
