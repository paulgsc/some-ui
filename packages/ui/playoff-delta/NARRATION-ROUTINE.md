# Playoff Delta's narration routine

A scheduled cloud session runs this every Tuesday in season, after
`paulgsc/testing`'s weekly Playoff Delta run has written the week (FEED2,
#2645). It writes what is said over each scene of the week's episode: the
one part of the video an AI fills (FEED #2643). Everything else is the
show's code, and what is written here is checked by that code before it
lands. Everything it writes is public.

The session is the filler only. It reads the packet, writes the words, and
lands them. It changes no code, no format and no guidance; a note about
those goes on the FEED epic for the owner.

## Steps

1. **Start from `main`** of `paulgsc/some-ui` (the tools) and of
   `paulgsc/testing` (the season and the fills). Add either with `add_repo`
   if the session lacks it: push access for `paulgsc/testing`. Read
   some-ui's `CLAUDE.md`, then install: `pnpm install --frozen-lockfile`.
2. **Find the season.** It is `paulgsc/testing`'s newest
   `playoff-delta/<season>/<team>.json` (2026's `SF.json` today). Its fills
   live beside it in `playoff-delta/<season>/narration/`.
3. **Find the weeks due:**

   ```sh
   pnpm --filter @some-ui/playoff-delta narration due \
     --season <testing>/playoff-delta/<season>/<team>.json \
     --folder <testing>/playoff-delta/<season>/narration
   ```

   It prints one line per week due, the week and its file name: the legend
   (week 0) once, then every week after the newest one filled. On a first
   run that is the legend and the newest week, never the weeks before. If
   it prints nothing, stop: open no PR.

4. **For each week due, read its packet:**

   ```sh
   pnpm --filter @some-ui/playoff-delta narration packet \
     --season <testing>/playoff-delta/<season>/<team>.json --week <n>
   ```

   The packet is the whole brief: who the words are for, each scene's point
   and its facts, the words the legend taught, and the shape to return.
   Read nothing else to write the words. The facts are true; the words are
   yours to choose.

5. **Write the fill** as the packet's `jsonSchema` says, to
   `playoff-delta/<season>/narration/<the file name step 3 printed>`. Copy
   `pins` as they are, then one `said` per scene, in order. Write each to be
   said aloud by a voice: plain spoken sentences, no symbols or lists.
6. **Check it** until it says ready:

   ```sh
   pnpm --filter @some-ui/playoff-delta narration check <fill.json> \
     --season <testing>/playoff-delta/<season>/<team>.json --week <n>
   ```

   A refusal names the scene and why: a number the scene's facts don't
   give, a week not played yet, a forecast word, or the shape. Rewrite that
   scene and check again. Never change a fact, the packet or the check to
   get past it.

7. **Open a pull request** in `paulgsc/testing` with the week's fills,
   titled `data(playoff-delta): narration for <season> week <n>` (or weeks
   `<a>` and `<b>`). Its body lists each fill and that the check said
   ready. Merge it once every fill says ready: the repository has no CI, so
   the check is its gate.
8. **Note the run** in the Residual Ledger's `log` collection
   (https://claude.ai/artifact/Ktc1i8JtBGQVdXEraobxgA), item `feed`: which
   weeks were filled.

## What it never does

- **Edit or replace a fill already on `main`.** A fill is the record of
  what was said that week, kept as written. A redo waits on FEED5 (#2648),
  which adds the owner's notes and the path for one.
- **Fill a week before the newest filled one,** or a week the season
  doesn't have.
- **Change some-ui:** no commits, no PRs there.

If the routine can't finish, open an issue in `paulgsc/some-ui` labelled
`kind:defect`, saying which step failed and why, so the owner hears of it.
