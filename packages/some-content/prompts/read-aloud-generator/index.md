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

  Practice: read-aloud
  Level: 1
  Lines: 55
  Genre: office
  Premise: two coworkers stuck late find out they live on the same street
  ```

  and give it to any model. A read-aloud request without `Lines:` gets the
  pool `deck-prompt.md` sizes for the level.

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
wrong in one word). In the Drive folder below, each pair has a scene folder of
its own, `TOPIK 3 · everyday · Starter` and `TOPIK 1 · everyday · Level one`,
holding it as `read-aloud.json` and `lens.json`, with the description
`repo set: …` naming the files it was copied from. Add them on the phone like
any other set. A word keeps its id across them, so a learner's pace for it
comes back when its set is added again. Nothing in the app imports these
files; topik's tests read them from disk
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
- **Out:** a scene folder in `Read aloud/sets/`, named
  `TOPIK <level> · <genre> · <title>` (`TOPIK 2 · office · Late at the office`),
  where `<level>` is the decks' highest line level, so the folder sorts by level
  and genre for the learner picking a set. It holds the two decks as bare JSON
  (no code fence), uploaded as `application/json`: `read-aloud.json` and
  `lens.json`. A folder made from a reflection has the Drive description
  `answers: <base>`, and the reflection is answered once such a folder holds
  both decks.
- **Retired:** a scene no longer offered moves whole, description included,
  into `Read aloud/archive/<date>/`. Its reflection stays answered: the routine
  looks for `answers: <base>` there too, so it never writes a retired scene
  again.

The routine to give an agent with the Drive connector and a checkout of this
repo:

> Read `README — Drive SOP` in Drive. For each reflection in
> `Study ledger/reflections` that no scene folder answers (description
> `answers: <base>`, holding both decks, in `Read aloud/sets/` or under
> `Read aloud/archive/`), newest first, at most three a run: read it and
> listen to its voice notes. Choose a context for it: a genre from
> `deck-prompt.md` (a drama's, unless the note asks for everyday life) and a
> premise that fits what the note mentions. Write two decks from
> `deck-prompt.md` in `@some-ui/topik` (`src/lib/topik/read-aloud`) in that
> context, at the level the learner asked for, or else the level they studied
> at: a read-aloud pool sized for a sitting (50–60 lines at level 1, about 50
> at level 2, about 40 at level 3, as `deck-prompt.md` says), written mostly
> in words they already have with at most one or two new words in a sentence,
> and a lens deck of 8 or so lines, each with its own `id` (the lens deck's
> ending `-lens`), the same `title`, `from` and `context`. The words they
> already have are those in `sets/` and in every deck under `Read aloud/`,
> archived ones included. Check each with `parseReadAloudDeck` and fix every
> finding, then count what is left: the app drops a line it cannot show and
> keeps the deck, so write a few lines over and make up any shortfall until
> the pool keeps its count. Create the scene folder and set its description if
> it is not there yet, then upload the decks it lacks into it.

The reflection's export also carries `readAloudFeedback` (its `about` says what
it is): the learner's two answers at the end of a read-aloud sitting, kept on
the phone and sent with the next reflection. The routine reads them when it
chooses the level and writes the pool. **Too easy** asks the next pool for a
step harder: lines toward the top of the level's range, with a few from the
level above. **Too many repeats** asks for more variety: more different
words and situations, and fewer of the same words from line to line. They are
separate, and the learner can give either, both or neither. Neither moves their
level on its own, a stuck report is not one of them, and the app's own wording
promises neither. Weigh an answer by its `answeredAt`: one given long before the
reflection says less about it.

The same pass reads each reflection for what it says about the app. A note
can speak to both: what to study next shapes the pair, and a bug or a wish
for how a screen works becomes a GitHub issue (an `epic` with sub-issues when
it spans several steps), filed in the routine's own words and labelled
`from-reflection`, with `kind:story` for a wish or `kind:defect` for a screen
that fails at what it already offers (`CLAUDE.md`, "Two kinds of pull
request"). The repo is public and the reflection is the owner's own, so an
issue never quotes a note, a transcript or a study result. The routine
then starts a session on each new issue: it opens a PR and drives it to
green, or, where the direction is open, comments the options on the issue
and stops. No such PR merges without the owner's approval.

## Not the hex game's format

`hangul-vocab-generator` writes `WordEntry` for the Hangul typing game: one
QWERTY key per jamo and an icon per word. A read-aloud deck is a reading
format instead: words in context, stems and pronunciations. The two share their
conventions (kebab-case ids, short glosses) and nothing else.
