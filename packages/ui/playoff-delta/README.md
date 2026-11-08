# @some-ui/playoff-delta

The weekly vlog's story stage: one team's regular-season week as a 9:16
story, made to be screen-recorded for YouTube Shorts, voiced in your own
words over each slide. Web only (`someUi.audience: "web"`); `apps/www` serves it at
`/playoff-delta` through the web surface's door.

Every week it says two numbers about our rivals, over every way the rest of
the season can go, and which way the week moved us. Nothing is weighted:
each number is an extreme with its proof. The vocabulary is taught once and
used every week after (`src/lib/words.ts`), from one image: driving through a
suburb, making or missing each light.

- **The poles**, for our division's three rivals and our conference's
  fifteen. **The floor**: if everything goes our way, the fewest wins our best
  rival can be held to. **The bloc** is its proof: rivals who still play each
  other, so however those games go, one of them reaches the floor. **The
  ceiling**: if everything goes against us, the most wins a rival can still
  reach. The two only ever close in.
- **Pieces.** A game is named only by who plays: **our light** (us), a
  **one-way** (a rival against the other conference: its loss helps us or
  does nothing, its win hurts us or does nothing), a **crossroads** (two
  rivals) and a **side street** (outside our conference). Each has a glyph
  (`src/lib/symbols.ts`).
- **A result** moved us **toward the best case** (made), **toward the worst
  case** (missed), was **forced** (two rivals: one had to win, and which one
  can still move a pole) or **idle**, against the same week with it the other
  way. **Steps our way** and **steps against us** count how far the week
  moved the poles, before to after. A week where neither floor rose and our
  best finish held is **a clean run**.
- **An objective**, the division or the #1 seed, is **clinched**, **in our
  hands**, **needs help** or **out**, with **greens to go** and **reds to
  spare**.
- **The ladder**, best first: the #1 seed, a division title, a wild card,
  out. Each week names the best rung still reachable and the worst already
  ours. **The call**: **keep driving** while they are apart, **arrived** once
  they meet on a seat, a **dead end** once no seat is left.

The numbers are the point; the NFL is where they come from. Team codes are
text, with no logos and no game footage (owner, 2026-10-27).

## What this package is, and is not

It renders. It does not compute. The poles, the seeds and each result's
move come in as one JSON season, validated by `StorySeasonSchema`
(`src/lib/story.ts`, contract version 6), and a malformed feed fails there
rather than mid-render. Where no season is given, the stage plays
`src/fixtures/season-2025.json`: the 2025 season as the engine evaluates it.

The real season comes from `paulgsc/server`'s `playoff-delta` job
(`crates/playoff_delta`, whose README defines every field), which a weekly
workflow in `paulgsc/testing` runs on ESPN's scoreboards and commits as
`playoff-delta/<season>/<team>.json`. `apps/www` fetches that file
(`lib/web-surface/playoff-delta`) and validates it with `StorySeasonSchema`
before handing it to the stage.

## The story

Two kinds of episode (`src/lib/slides.ts`), each slide with a fixed hold, a
point a take over it makes, and the facts the take keeps, written from the
same data the slide draws:

- **The legend** (week 0), played once: the pieces, the poles on the
  season's first table (our division held to 2 wins, our conference to 6),
  what a result did, the objectives and their countdowns, the ladder and the
  call.
- **A week**, one slide per reading (`src/lib/reading.ts`): our division's
  poles and the bloc that forces its floor → our conference's → which way
  each result moved us → where each objective stands → the ladder and the
  call → the season's envelope, closing → the week in one sentence.

## The show

Playoff Delta is a show (SHOW epic, #2525): every week is an episode of the
same format, fed that week's data, and the owner brings only the voice.
`src/lib/show.ts` makes both formats (the week's and the legend's) from the
slides above, a compile-time template, and pins each version under
`src/show/formats/<id>/v<n>.json`. Its test holds the newest equal to the
code, so a change to the slides (their order, names, points or holds)
fails until a new version is pinned. An episode is
`episodeFor(season, week, sum, inMs)`: a primer the phone's Studio opens
(each scene's point and the facts a take keeps, voiced ad-lib), listed
under the show "Playoff Delta" and pinned to the format, the series and `sum`, with a cut list whose pictures are the
clips, each starting at `inMs`. The recorder sums the season as the stage
read it (its contract JSON), not the published file's bytes.
The episode also carries its upload's title and description (SH5),
`uploadOf(season, week)`, worded in `UPLOAD` (`src/lib/words.ts`) under the
same words rules as the slides and held to YouTube's limits; the phone's
Finish shows them once the episode is ready, and the owner uploads by hand.
The schemas are `@some-ui/video-render`'s (`format.ts`, `episode.ts`).

## What is said

I watch the show; I don't voice it (FEED, #2643). What is said over each
scene is the one part an AI fills, and this package owns the rest: the
schema it fills (`some-ui.pd-narration/1`), what it reads, and the check
(`src/lib/narration.ts`, FEED1 #2644).

```sh
pnpm --filter @some-ui/playoff-delta narration due --season <file|sample> --folder <narration folder>
pnpm --filter @some-ui/playoff-delta narration packet --season <file|sample> --week 9
pnpm --filter @some-ui/playoff-delta narration check <fill.json> --season <file|sample> --week 9
pnpm --filter @some-ui/playoff-delta narration index --root <testing>/playoff-delta
```

Each Tuesday in season a scheduled session fills the weeks due into
`paulgsc/testing`'s `playoff-delta/<season>/narration/<team>-week-NN.json`, as `NARRATION-ROUTINE.md` says (FEED2 #2645).

- **The packet** is everything a filler reads, and nothing else:
  - the guidance (who the words are for, and what they're for);
  - the episode's pins, which the fill copies: season, team, week, format,
    and the sum of the season up to that week (`seasonTo`), so a fill still
    checks once later weeks land, and stops checking if a week it reads
    changes;
  - each scene's point and facts;
  - what the legend taught;
  - the schema as JSON Schema.
- **The check** refuses a fill that:

  - isn't in the schema's shape;
  - carries another episode's pins;
  - has scenes other than the format's, in its order;
  - forecasts (`FORECAST` in `src/lib/words.ts`);
  - says a team's code ("LAR") in place of its name: the facts write codes,
    which a voice can only spell, so the packet carries every team's name;
  - says a number its scene's facts don't give, or a week not yet played.

  It judges nothing else about the words.

- **The index** (`playoff-delta/index.json`, `some-ui.pd-narration-index/1`)
  lists every fill in the repository by season, team and week, with the
  SHA-256 of its file. Home reads it hourly and keeps each fill it lacks,
  with its season file, for good (FEED4 #2647); it is the one file home
  needs, since `raw.githubusercontent.com` can't list a folder.
- **The weeks due** are the legend once, then every played week after the
  newest one filled; a first run fills the legend and the newest week, not
  the weeks before it.

## Recording

```sh
pnpm --filter www build
pnpm --filter www record:playoff-delta --week 8 --narration SF-week-08.json --season-file SF.json
pnpm --filter www record:playoff-delta --clips --week 9   # my own voice, until FEED6
```

From format version 2 an episode is voiced (FEED3, #2646):
`apps/www/tests/record/playoff-delta.ts` checks the week's fill against the
season the stage plays, records a still of each scene with every animation
at rest, has home's Kokoro speaker say each in `PD_VOICE`, and renders one
9:16 MP4 in the series' version 2. `src/lib/voiced.ts` makes the scenes:

- the **locked intro**: who wrote the words (Claude, from the season's
  numbers), what computed the numbers and drew the frames (code), that the
  voice is synthetic, and whose side it is read from, filled by code and
  never by the fill (`INTRO` in `src/lib/words.ts`);
- the **brand intro and outro**, the owner's mark;
- a **chapter slide** said aloud before each slide the format marks
  (`SHAPE` in `src/lib/show.ts`);
- the slides, each said as the fill says it, with **subtitles** lit word by
  word in the band the stage leaves empty at the frame's foot.

The same fill and season give the same bytes. The recorder refuses a scene
the frame can't hold (`data-overflow`). A fill written for version 1 was for
my voice and isn't voiced. `--clips` records the version 1 episode Studio
opens for my voice: one clip and still per slide and `episode.json`. The
recorder's header has every option.

## Next

- **The NFL's tiebreakers** (paulgsc/server#496): today a tie goes to us, in
  every pole and seed.
- **A landscape cut.** For long-form video, the portrait frame centered in a
  16:9 canvas with a side panel; a layout, not a redesign.
