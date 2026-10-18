# Read-Aloud Deck Generator

The prompt itself lives with the code that checks its output: `@some-ui/topik`,
[`src/lib/topik/read-aloud/deck-prompt.md`](../../../ui/topik/src/lib/topik/read-aloud/deck-prompt.md).
The deck format, and the load-time check that drops what cannot be shown, are
in `src/lib/topik/read-aloud/content`; complete, checked examples are the
sets in [`sets/`](sets/). This file keeps only what is for developers.

The format is governed by the adaptive-learning canon: the read-aloud rep and
its valuation (Def. 4.8, Cor. 4.6), concept identity (Def. 1.3), and, for a
line's `lens`, the grammar-lens item and its mistake catalogue (Def. 4.9,
Cor. 4.8; the catalogue is `src/lib/topik/read-aloud/mistakes`).

Every deck is one practice, read-aloud or the grammar lens (`practice`), and
is set in a context: a genre, a K-drama's or everyday life's, and a premise
(`context`). On the phone a lens set opens on the grammar lens and a
read-aloud set on read-aloud, and the card under "Ready for you" says which,
with the genre and the premise.

## Using it

- Copy `deck-prompt.md`, append a request block:

  ```
  ## This request

  Practice: lens
  Level: 2
  Lines: 12
  Genre: office
  Premise: two coworkers stuck late find out they live on the same street
  ```

  and give it to any model.

- Check the reply with `parseReadAloudDeck` (exported from `@some-ui/topik`).
  Every finding it reports is something the app would drop, so fix the deck or
  regenerate rather than shipping it with findings. Outside the package, load
  it through Vite with topik's `@topik` alias: plain `node` cannot resolve the
  alias that `content` imports the mistake catalogue by.

## The sets this repo keeps

No read-aloud word is compiled into the app. Every deck reaches the phone as
a file the learner picks: "Open new words from storage" adds it and keeps it
on the device (`src/lib/topik/read-aloud/added-sets`). With none added,
read-aloud says there is nothing to read yet.

[`sets/`](sets/) holds the two decks the app once shipped, each as a
read-aloud set and a lens set, all four in the `everyday` genre: the starter
(`starter.read-aloud.json`, every level, a few lines each, and
`starter.lens.json`) and level one (`level-one.read-aloud.json`, with roles
and tenses throughout, and `level-one.lens.json`, its lines a learner could go
wrong in one word). Copy each pair to its scene folder in the Drive folder
below (`TOPIK 1 · everyday · Level one/`, as `read-aloud.json` and
`lens.json`) and add them on the phone like any other set. A word keeps its id across them, so a
learner's pace for it comes back when its set is added again.
Nothing in the app imports these files; topik's tests read them from disk
(`src/lib/topik/read-aloud/repo-sets`), which is where their content checks
run. Edit them here, check them with those tests, and copy them again.

## The loop through the learner's drive

The learner never has to ask for a deck. The reflection they already share
after a session is the request, and a scheduled agent answers it while they
are away, with a pair of sets in one context: one to read aloud, one for the
grammar lens. The next time they open topik, after picking the files, the
sets wait under "Ready for you" at the top, with their `from` line saying
which note they answer.

The files, in the owner's Drive (its `README — Drive SOP` is the rule for
where):

- **In:** `Study ledger/reflections/<base>.json`, with its voice notes
  `<base>_voice-<when>-<id6>.<ext>` beside it.
- **Out:** a scene folder in `Read aloud/sets`, named
  `TOPIK <level> · <genre> · <title>` (`TOPIK 2 · office · Late at the office`)
  so the folder sorts by level and genre for the learner picking a set. It
  holds the two decks as bare JSON (no code fence), uploaded as
  `application/json`: `read-aloud.json` and `lens.json`. The folder's Drive
  description, `answers: <base>`, pairs it with the reflection it answers: a
  reflection whose folder holds both is answered.
- **Retired:** sets that are no longer offered move to `Read aloud/archive/`,
  one folder per retirement, named by its date.

The routine to give an agent with the Drive connector and a checkout of this
repo:

> Read `README — Drive SOP` in Drive. For each reflection in
> `Study ledger/reflections` that no scene folder in `Read aloud/sets` answers
> (description `answers: <base>`, holding both decks), newest first, at most
> three a run: read it and listen to its voice notes. Choose a context for it:
> a genre from `deck-prompt.md` (a drama's, unless the note asks for everyday
> life) and a premise that fits what the note mentions. Write two decks from
> `deck-prompt.md` in `@some-ui/topik` (`src/lib/topik/read-aloud`) in that
> context, at the level the learner asked for, or else the level they studied
> at: a read-aloud deck of 12 or so lines, and a lens deck of 8 or so lines,
> each with its own `id` (the lens deck's ending `-lens`), the same `title`,
> `from` and `context`. The words they already have are those in `sets/` and
> in `Read aloud/sets`. Check each with `parseReadAloudDeck` and fix every
> finding, then create the scene folder, set its description, and upload both
> into it (only the missing one, if the other is there).

The same pass reads each reflection for what it says about the app. A note
can speak to both: what to study next shapes the pair, and a bug or a wish
for how a screen works becomes a GitHub issue (an `epic` with sub-issues when
it spans several steps), filed in the routine's own words and labelled
`from-reflection`. The repo is public and the reflection is the owner's own,
so an issue never quotes a note, a transcript or a study result. The routine
then starts a session on each new issue: it opens a PR and drives it to
green, or, where the direction is open, comments the options on the issue
and stops. No such PR merges without the owner's approval.

## Not the hex game's format

`hangul-vocab-generator` writes `WordEntry` for the Hangul typing game: one
QWERTY key per jamo and an icon per word. A read-aloud deck is a reading
format instead: words in context, stems and pronunciations. The two share their
conventions (kebab-case ids, short glosses) and nothing else.
