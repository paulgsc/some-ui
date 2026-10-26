# @some-ui/playoff-delta

The weekly vlog's story stage: one team's regular-season week as a 9:16
story, made to be screen-recorded for YouTube Shorts with a voiceover per
slide. Web only (`someUi.audience: "web"`); `apps/www` serves it at
`/playoff-delta` through the web surface's door.

Two questions every week:

- **How bad can we be, and still make the playoffs?** If the team won only
  so many more games, could it still get in, and as which seed? The answer
  only holds or gets worse as results come in: each result rules out ways
  the season can end.
- **Of all the ways the season can still go, how many get us in?** The share
  of ways in moves both ways. Over all the ways a week could go its expected
  change is zero, so its sign is the week's luck, and it splits into the
  team's own result and everyone else's.

## What this package is, and is not

It renders. It does not compute. The paths, the shares, each result's
leverage, next week's games and the proofs come in as one JSON season,
validated by `StorySeasonSchema` (`src/lib/story.ts`, contract version 2),
and a malformed feed fails there rather than mid-render. Where no season is
given, the stage plays `src/fixtures/season-2025.json`: the 2025 season as
the engine evaluates it.

The real season comes from `paulgsc/server`'s `playoff-delta` job
(`crates/playoff_delta`, whose README defines every field), which a weekly
workflow in `paulgsc/testing` runs on ESPN's scoreboards and commits as
`playoff-delta/<season>/<team>.json`. `apps/www` fetches that file
(`lib/web-surface/playoff-delta`) and validates it with `StorySeasonSchema`
before handing it to the stage.

## The story

Up to fourteen slides (`src/lib/slides.ts`), each with a fixed hold and a
voiceover line written from the same week data the slide draws:

hook → the test → last week's paths → our game (or the bye) → this week's
rule → the rest of the league → after the week → one way in → why one fewer
win can't work (while the claim needs a win) → the rivals → the collisions
(when there are any) → next week (when a game matters) → the benchmark → the
outro.

## The algebra

The stage teaches four laws (`src/lib/laws.ts`), one a week, chosen by the
week's biggest league result:

1. **Conservation.** Every game hands out exactly one win.
2. **Four kinds of game** (`src/lib/symbols.ts`, a glyph each): ours, theirs
   against the other conference, the other conference against itself, and
   theirs against each other. Only the last can go either way.
3. **Who can afford the win.** When two conference teams meet, which winner
   is better for us depends on their room under our line.
4. **The pigeonhole.** Teams that still play each other must share out those
   wins; if they don't fit under our line, someone passes us. The boundary
   slide draws it from the engine's own proof.

A result is coloured by the sign of its leverage (green helped, red hurt)
and drawn as a bar its size; ★ marks one that decided a path (the other
result would have changed the paths), ↯ a loss from ahead.

## What the stage promises

Held by the test that names it: PDS3, the path's words, in
`src/components/slides/__tests__/slides.test.tsx`. PDS1 (the verdict read
off the paths) and PDS2 (a result coloured only by what the data proved)
were retired by contract v2: the verdict reads the share, and every result
carries its computed leverage.

## Recording

```sh
pnpm --filter www build
pnpm --filter www record:playoff-delta --week 9
```

`apps/www/tests/record/playoff-delta.ts` writes one clip and still per slide
and `voiceover.md`; its header has the options.

## Next

- **Lost from ahead.** The contract takes a result's
  `collapse: { peakWinProbability, led }`, and a row marks a loss from a
  winning position (↯). It needs a feed with in-game win probability.
- **The NFL's tiebreakers in the count** (paulgsc/server#496): today a tie
  goes to us, in the paths and in the share.
- **A landscape cut.** For long-form video, the portrait frame centered in a
  16:9 canvas with a side panel; a layout, not a redesign.
