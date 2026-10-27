# @some-ui/playoff-delta

The weekly vlog's story stage: one team's regular-season week as a 9:16
story, made to be screen-recorded for YouTube Shorts with a voiceover per
slide. Web only (`someUi.audience: "web"`); `apps/www` serves it at
`/playoff-delta` through the web surface's door.

One question every week, in two halves: **did following the team pay this
week, and is next week worth following?** "Following" is attention: like
watching a run of traffic lights on a drive, you could have ignored them, but
once you look, each one is a make or a miss.

- **The lights.** Every result this week that could move the team's share of
  the ways in (of all the ways the rest of the season can go, the share that
  get it in) is a light: green when it went the team's way, red when it
  didn't, bigger the further it moved the share.
- **Luck.** The share is a fair game: over the ways a week can go, it
  averages to the share before. So what everyone else's results did to it,
  against how far that week's results could have moved it (its spread), is
  the week's luck. The team's own result is its own light, never luck.
- **The stake.** How far next week can move the share, the team's own game
  apart.
- **The verdict.** Watch next week, or exit: the team is in whatever happens,
  no way in is left, or the share is within 2% of either end (owner,
  2026-10-27). The first exit ends the series; once the season is over, the
  stage checks the exit in hindsight.

The numbers are the point; the NFL is where they come from. Team codes are
text, with no logos and no game footage (owner, 2026-10-27).

## What this package is, and is not

It renders. It does not compute. The paths, the shares, each result's
leverage, next week's games and the proofs come in as one JSON season,
validated by `StorySeasonSchema` (`src/lib/story.ts`, contract version 3),
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

Up to eight slides (`src/lib/slides.ts`), each with a fixed hold and a
voiceover line written from the same week data the slide draws; the answers
themselves are pure functions in `src/lib/luck.ts`, with their words:

hook → the lights → this week's rule → luck → next week (while a game is
left) → the verdict → the season so far → the outro.

## The algebra

The rule slide teaches why a light went the way it did, one of three laws
(`src/lib/laws.ts`), picked by the week's biggest league result (the four
kinds on a bye):

1. **Conservation.** Every game hands out exactly one win.
2. **Four kinds of game** (`src/lib/symbols.ts`, a glyph each): ours, theirs
   against the other conference, the other conference against itself, and
   theirs against each other. Only the last can go either way.
3. **Who can afford the win.** When two conference teams meet, which winner
   is better for us depends on their room under our line.

## What the stage promises

PDS1 (the verdict read off the paths) and PDS2 (a result coloured only by
what the data proved) were retired by contract v2, and PDS3 (the path
slide's words) by contract v3, which dropped the path slide. A light's colour
is the sign of its computed leverage.

## Recording

```sh
pnpm --filter www build
pnpm --filter www record:playoff-delta --week 9
```

`apps/www/tests/record/playoff-delta.ts` writes one clip and still per slide
and `voiceover.md`; its header has the options.

## Next

- **Lost from ahead.** The contract takes a result's
  `collapse: { peakWinProbability, led }`, and a light marks a loss from a
  winning position (↯). It needs a feed with in-game win probability, which
  is also what watching a rival's game live, rather than checking the score,
  would be measured with.
- **The NFL's tiebreakers in the count** (paulgsc/server#496): today a tie
  goes to us, in the paths, the share and the clinch.
- **A full clinch proof** (paulgsc/server#521): `clinched` is two short
  proofs today, so an exit can come a week or two later than it could.
- **A landscape cut.** For long-form video, the portrait frame centered in a
  16:9 canvas with a side panel; a layout, not a redesign.
