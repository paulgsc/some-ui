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

## The loop through the learner's drive

The bundled deck is a floor, not the whole of it: on the phone, "Open new
words from storage" adds a deck an agent wrote, and keeps it beside the
bundled one (`src/lib/topik/read-aloud/added-sets`). The learner never has to
ask for one. The reflection they already share after a session is the
request, and a scheduled agent answers it while they are away. The next time
they open topik, after picking the file, the deck waits under "Ready for
you" at the top, with its `from` line saying which note it answers.

The files, in the owner's Drive (its `README — Drive SOP` is the rule for
where):

- **In:** `Study ledger/reflections/<base>.json`, with its voice notes
  `<base>_voice-<when>-<id6>.<ext>` beside it.
- **Out:** `Read aloud/sets/words-<base>.json`, the deck as bare JSON (no
  code fence), uploaded as `application/json`. The name pairs it with the
  reflection it answers, so a reflection with a deck is answered.

The routine to give an agent with the Drive connector and a checkout of this
repo:

> Read `README — Drive SOP` in Drive. For each reflection in
> `Study ledger/reflections` that has no `words-<base>.json` in
> `Read aloud/sets`, newest first, at most three a run: read it and listen
> to its voice notes. Write a read-aloud deck from `deck-prompt.md` in
> `@some-ui/topik` (`src/lib/topik/read-aloud`): at the level the learner
> asked for, or else the level they studied at; 12 or so lines, on what the
> note mentions, or everyday life when it mentions nothing; `from` naming
> the note in the learner's words, or the session's date. Do not reuse a word
> id from the bundled deck (`src/lib/topik/read-aloud/bundled`) or an
> earlier set unless it is the same dictionary form. Check it with
> `parseReadAloudDeck` and fix every finding, then upload it.

## Not the hex game's format

`hangul-vocab-generator` writes `WordEntry` for the Hangul typing game: one
QWERTY key per jamo and an icon per word. A read-aloud deck is a reading
format instead: words in context, stems and pronunciations. The two share their
conventions (kebab-case ids, short glosses) and nothing else.
