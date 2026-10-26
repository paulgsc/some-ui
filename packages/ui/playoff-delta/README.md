# @some-ui/playoff-delta

The weekly vlog's story stage: one team's regular-season week as a 9:16
story, made to be screen-recorded for YouTube Shorts with a voiceover per
slide. Web only (`someUi.audience: "web"`); `apps/www` serves it at
`/playoff-delta` through the web surface's door.

The question every week: **how bad can we be, and still make the playoffs?**
If the team never won again, could it still get in, and as which seed? Each
week's results either keep those paths open, prune them, or (when none are
left) close them for good.

## What this package is, and is not

It renders. It does not compute. The paths, the results that moved them,
and the rivals' worst cases come in as one JSON season, validated by
`StorySeasonSchema` (`src/lib/story.ts`, the contract), and a malformed
feed fails there rather than mid-render. Where no season is given, the stage
plays `src/fixtures/invented-season.json`: an invented
17-week season, generated with the same formula schedule, so the numbers are
consistent but not real.

The real season comes from `paulgsc/server`'s `playoff-delta` job
(`crates/playoff_delta`), which a weekly workflow in `paulgsc/testing` runs
on ESPN's scoreboards and commits as `playoff-delta/<season>/<team>.json`.
`apps/www` fetches that file (`lib/web-surface/playoff-delta`) and validates
it with `StorySeasonSchema` before handing it to the stage.

## The story

Fourteen slides (`src/lib/slides.ts`), each with a fixed hold and a voiceover
line written from the same week data the slide draws:

hook → the test → the alphabet → the grammar → last week's paths → your game
→ who fell → how they fell → this week's paths → the path → the rivals →
the collisions (only when there are any) → the benchmark → the outro.

## The symbol algebra

Seven event types exist before any week is played; each week only fills them
(`src/lib/symbols.ts`). Each is composed from the same seven primitives (you,
a contender, an eliminated team, a named rival, your division, your
conference, and the win that travels from loser to winner), keeps one hue
from the active theme's `--chart-1..5`, and one motion. Results on a card:
green helped, red hurt, ★ the other result would have changed the paths, ↯
lost from ahead.

## What the stage promises

Each is held by the test that names it.

- **PDS1, the verdict** (`weekVerdict`, `src/lib/__tests__/story.test.ts`):
  "Worse." only when a path open last week is closed, rows compared by final
  wins; "Better." only when one opened, which takes a tied game; "Held."
  otherwise. A win of the team's own that only lifts the floor it has banked
  closes nothing.
- **PDS2, the colours** (`provenSign`, same file): a result is coloured by the
  engine's own verdict when it has one; otherwise only a result against the
  other conference is, since a win leaving the conference never hurts. Inside
  the conference a win changes hands, and which way helps depends on who
  could afford it, so a result with no verdict there has no colour.
- **PDS3, the path and rivals words**
  (`src/components/slides/__tests__/words.test.tsx`): the path is one way in,
  not the only one or a best case; a rival's third claim is each break it got
  reversed together, not the worst possible.

## Recording

```sh
pnpm --filter www build
pnpm --filter www record:playoff-delta --week 9
```

`apps/www/tests/record/playoff-delta.ts` writes one clip and still per slide
and `voiceover.md`; its header has the options.

## Next

- **Lost from ahead.** The contract already takes a result's
  `collapse: { peakWinProbability, led }`, and a card marks a loss from a
  winning position (↯). It needs a feed with in-game win probability; the
  invented season marks one (week 9, Seattle) to show it.
- **A landscape cut.** For long-form video, the portrait frame centered in a
  16:9 canvas with a side panel; a layout, not a redesign.
