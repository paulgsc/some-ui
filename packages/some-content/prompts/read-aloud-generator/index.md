# Read-Aloud Deck Generator

The prompt itself lives with the code that checks its output: `@some-ui/topik`,
[`src/lib/topik/read-aloud/deck-prompt.md`](../../../ui/topik/src/lib/topik/read-aloud/deck-prompt.md).
The deck format, and the load-time check that drops what cannot be shown, are
in `src/lib/topik/read-aloud/content`; a complete, checked example is the
bundled starter deck in `src/lib/topik/read-aloud/starter`. This file keeps
only what is for developers.

The format is governed by the adaptive-learning canon: the read-aloud rep and
its valuation (Def. 4.8, Cor. 4.6), and concept identity (Def. 1.3).

## Using it

- Copy `deck-prompt.md`, append a request block:

  ```
  ## This request

  Level: 2
  Lines: 12
  Theme: a weekend in the city
  ```

  and give it to any model.

- Check the reply with `parseReadAloudDeck` (exported from `@some-ui/topik`).
  Every finding it reports is something the app would drop, so fix the deck or
  regenerate rather than shipping it with findings.

## Not the hex game's format

`hangul-vocab-generator` writes `WordEntry` for the Hangul typing game: one
QWERTY key per jamo and an icon per word. A read-aloud deck is a reading
format instead: words in context, stems and pronunciations. The two share their
conventions (kebab-case ids, short glosses) and nothing else.
