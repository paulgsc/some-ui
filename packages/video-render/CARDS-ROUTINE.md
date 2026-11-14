# A cards essay's routine

A session runs this to make a cards essay (CARDS7, #2979): a silent video of
cards that explains one subject (how a machine upgrades itself, how a
scratchpad works) from the repositories that hold it, each claim with a status
badge and every card stamped with the commits it was checked against. The
owner watches it on home, as they watch the weekly call. This session writes
the cut list. Everything after the cut list is code, and nothing about it is
uploaded anywhere.

Each step is written so a scheduled session can follow it unattended. The
daily routine takes this up when it answers an ask for an essay (EXPLAIN4,
#2980).

## Who does what

- **The session** chooses the subject, which cards in what order and what
  each says. It checks every claim against the repositories at a commit,
  sets each claim's badge and names the stamp. That judgement can't be
  written as code.
- **Code** refuses what can't be drawn. `cards-check` refuses a malformed
  cut list, a card without a stamp, and anything home has no file for
  (`parseCardsEssay`). Drawing refuses a line that doesn't fit or a
  character the font lacks (`@some-ui/burn-ins`' `prepare`, in
  `record:cards`).
- **Home** reads `paulgsc/testing`'s `cards/` index hourly and keeps each
  essay it lacks, as first served. Its render worker records the stage's
  burn-ins page and renders the video (`apps/www/tests/record/cards.ts`).
  The same essay on the same image gives the same bytes, and the video is
  kept until the owner lets it go.

## Steps

1. **Start from `main`** of `paulgsc/some-ui` and of `paulgsc/testing`, and
   install some-ui: `pnpm install --frozen-lockfile`.
2. **Read the subject** at the commits the essay will be stamped with. Clone
   each repository it explains read-only, and note each one's short commit.
3. **Write the cut list** in the cheat-sheet series, version 1, as
   `packages/video-render/src/sample/videos/*/cut-list.json` are. Read both
   before writing.
   - Every scene is a card picture (`{"kind": "card"}`) with its card as a
     burn-in: a `terminal`, `cheat-sheet`, `legend`, `rule` or `flow`. No
     scene plays a take: nothing is said over cards.
   - **Badges:** ■ `main` for what is on a default branch at the stamp's
     commit, ◧ `pr` for an open pull request, □ `next` for what is planned
     and not built, △ `gap` for a known gap, ✋ `you` for a step only the
     reader does. A claim you can't check gets no card.
   - **Stamp:** `{"sources": ["<owner>/<repo>@<short sha>", …], "date":
"<YYYY-MM-DD>"}`, the commits you read and the day you checked them.
     Write no claim of "now": the stamp dates the card.
4. **Name it** `<slug>-<date>.json`, the slug a few plain lowercase words
   joined by `-` and the date the stamp's. The same subject checked again on
   a later day is a new essay, so an old one is never rewritten.
5. **Render it once** to find what the frame refuses:
   `pnpm --filter www build`, then
   `pnpm --filter www record:cards --cut-list-file <key>.json --out <scratchpad>`.
   Fix every refusal in the cut list and render again until it writes
   `cards.mp4`. Keep the video in the scratchpad: it is for you alone, and
   home makes the owner's copy.
6. **Add it to `paulgsc/testing`:** the file as `cards/<key>.json`, and its
   key in `cards/index.json`
   (`{"schema": "some-ui.cards-index/1", "essays": [{"key": …}, …]}`), in
   order of the stamps' days, newest first. Never edit or remove an essay already there, since home keeps
   each as first served.
7. **Check the folder:**
   `pnpm --filter @some-ui/video-render render cards-check <paulgsc/testing>/cards`
   until it says ready.
8. **Open a pull request** in `paulgsc/testing`. Before pushing, run
   `python3 scripts/guard.py --staged` there until it says ready. Title it
   `data(cards): <the essay's title>`. Its body names the key, the stamp's
   sources, and every claim marked `pr`, `next` or `gap`. Merge it once
   step 5 rendered it and `cards-check` says the folder is ready: the
   repository has no CI, so those two are its gate.
9. **Say where it plays and end:** home renders it within the hour after the
   merge, and the owner watches it in Studio › Renders. End with a summary:
   the key, what the essay covers, the commits it was checked against, and
   anything you left out because it couldn't be checked. Note the run in the
   Residual Ledger's `log`.

## What it never does

- Upload, attach or send a video anywhere. Home renders the owner's copy.
- Write a claim it didn't check against the stamp's commits, or a card with
  no stamp.
- Voice an essay, or ask the owner to. The owner is its audience.
- Delete an essay from `cards/`. The folder keeps every essay until it grows
  enough to need the call's leave rule (C327).
