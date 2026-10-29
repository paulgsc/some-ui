# @some-ui/playoff-delta

The weekly vlog's story stage: one team's regular-season week as a 9:16
story, made to be screen-recorded for YouTube Shorts with a voiceover per
slide. Web only (`someUi.audience: "web"`); `apps/www` serves it at
`/playoff-delta` through the web surface's door.

Every week there was a best way for it to go. Each short shows how close
the week came, where it broke away, and who came closest, in a vocabulary
taught once and used every week after (`src/lib/words.ts`). All of it comes
from one image: driving through a suburb, making or missing each light.

- **Pieces.** A game is a piece, named only by who plays, so its noun never
  changes: **our light** (us; a win always helps), a **one-way** (a team in
  our race against the other conference: their loss helps us or does
  nothing), a **crossroads** (two teams in our race: either way, depending on
  who can afford the win) and a **side street** (two teams outside our race:
  never on our route). Each has a glyph (`src/lib/symbols.ts`).
- **Material.** What a piece is worth this week, its price: how far the best
  week drops if it goes the other way. **Major** from a point, **minor** from
  a quarter of a point, **idle** below that or within its sampling error. A
  piece is **made** or **missed**; our result can **wake** one. A light's
  size is its price, on the same scale every week.
- **The week.** Of the ways the week could have gone, how many would have
  left us worse, as a band: **All greens**, **Mostly green**,
  **Stop-and-go**, **Mostly red**, **All reds**. The share of the ways in is
  a fair game, so the bands' widths (10, 25, 30, 25 and 10 of every 100) are
  how often a week lands in each. **A clean run** misses no major or minor
  piece.
- **Next week** is **rush hour**, **traffic** or an **empty road**, by how
  far it can move us; then **the call**: **keep driving** or **park it** (our
  rule: stop once the share is within 2% of either end, owner, 2026-10-27),
  or **arrived** or a **dead end** (proofs, marked differently).

The numbers are the point; the NFL is where they come from. Team codes are
text, with no logos and no game footage (owner, 2026-10-27).

## What this package is, and is not

It renders. It does not compute. The paths, the shares, the week's ways,
the podium and the proofs come in as one JSON season, validated by
`StorySeasonSchema` (`src/lib/story.ts`, contract version 5), and a malformed
feed fails there rather than mid-render. Where no season is given, the stage
plays `src/fixtures/season-2025.json`: the 2025 season as the engine
evaluates it.

The real season comes from `paulgsc/server`'s `playoff-delta` job
(`crates/playoff_delta`, whose README defines every field), which a weekly
workflow in `paulgsc/testing` runs on ESPN's scoreboards and commits as
`playoff-delta/<season>/<team>.json`. `apps/www` fetches that file
(`lib/web-surface/playoff-delta`) and validates it with `StorySeasonSchema`
before handing it to the stage.

## The story

Two kinds of episode (`src/lib/slides.ts`), each slide with a fixed hold and
a voiceover line written from the same data it draws:

- **The legend** (week 0), played once: the pieces, their material, the
  week's bands, next week and the call.
- **A week**, one slide per question (`src/lib/reading.ts`), on the week's
  ways: the best week and what it needed → the road from best to actual,
  kickoff by kickoff → what our result left the league to do → the week's
  band → the podium → next week (while a game is left) → the call → the
  season so far → the week in one sentence:

  > All reds. We missed our light; the league ran mostly red. Our loss woke
  > four minors; we made one. Traffic next week, and we have a bye. Keep
  > driving.

The week's ways are every way its results could have gone, each counted
against the same rests of the season, so the best week, the road, the
band and the strip of the ways all come from one table and add up.

## What the stage promises

PDS1 (the verdict read off the paths) and PDS2 (a result coloured only by
what the data proved) were retired by contract v2, and PDS3 (the path
slide's words) by contract v3, which dropped the path slide. A light is made
or missed by whether its game went the way the best week wanted, and sized
by its price.

## Recording

```sh
pnpm --filter www build
pnpm --filter www record:playoff-delta --week 9
pnpm --filter www record:playoff-delta --week 0   # the legend
```

`apps/www/tests/record/playoff-delta.ts` writes one clip and still per slide
and `voiceover.md`; its header has the options.

## Next

- **The NFL's tiebreakers in the count** (paulgsc/server#496): today a tie
  goes to us, in the paths, the share and the clinch.
- **A full clinch proof** (paulgsc/server#521): `clinched` is two short
  proofs today, so an exit can come a week or two later than it could.
- **A landscape cut.** For long-form video, the portrait frame centered in a
  16:9 canvas with a side panel; a layout, not a redesign.
