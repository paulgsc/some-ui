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

## Design direction: the Sunday survival report

The opening names this week's team and record, then asks “How much hope is
left?” Oversized type, a serif accent and quiet field markings give the
portrait a sports editorial rhythm within the active theme.

The weekly payoff gives the remaining path count the most weight. Its
headline and accent follow the change in the minimum winning record and
seed: relief when the floor improves, tension when it worsens, held hope
when it stays, and a closed door on elimination. The voiceover uses the
same verdict. These are possible scenarios, not playoff probabilities;
the frame says so. The ending closes with the paths when none remain.

## The symbol algebra

Seven event types exist before any week is played; each week only fills them
(`src/lib/symbols.ts`). Each is composed from the same seven primitives (you,
a contender, an eliminated team, a named rival, your division, your
conference, and the win that travels from loser to winner), keeps one hue
from the active theme's `--chart-1..5`, and one motion. Results on a card:
green went your way, red didn't, ★ moved the paths, ↯ lost from ahead.

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
