# Read-Aloud Deck Generator

The prompt itself lives with the code that checks its output: `@some-ui/topik`,
[`src/lib/topik/read-aloud/deck-prompt.md`](../../../ui/topik/src/lib/topik/read-aloud/deck-prompt.md).
The deck format, and the load-time check that drops what cannot be shown, are
in `src/lib/topik/read-aloud/content`; complete, checked examples are the
sets in [`sets/`](sets/). This file keeps only what is for developers.

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

## The sets this repo keeps

No read-aloud word is compiled into the app. Every deck reaches the phone as
a file the learner picks: "Open new words from storage" adds it and keeps it
on the device (`src/lib/topik/read-aloud/added-sets`). With none added,
read-aloud says there is nothing to read yet.

[`sets/`](sets/) holds the two decks the app once shipped, as set files:
`starter.json` (every level, a few lines each) and `level-one.json` (level
one, with roles and tenses throughout). Copy them to the Drive folder below
and add them on the phone like any other set. A word keeps its id across
them, so a learner's pace for it comes back when its set is added again.
Nothing in the app imports these files; topik's tests read them from disk
(`src/lib/topik/read-aloud/repo-sets`), which is where their content checks
run. Edit them here, check them with those tests, and copy them again.

## The loop through the learner's drive

The learner never has to ask for a deck. The reflection they already share after a session is the
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
> the note in the learner's words, or the session's date. Give each word a
> `role` and each line a `tense` where the form shows one. Do not reuse a
> word id from `sets/` or an earlier set in `Read aloud/sets` unless it is
> the same dictionary form. Check it with `parseReadAloudDeck` and fix every
> finding, then upload it.

## Not the hex game's format

`hangul-vocab-generator` writes `WordEntry` for the Hangul typing game: one
QWERTY key per jamo and an icon per word. A read-aloud deck is a reading
format instead: words in context, stems and pronunciations. The two share their
conventions (kebab-case ids, short glosses) and nothing else.
