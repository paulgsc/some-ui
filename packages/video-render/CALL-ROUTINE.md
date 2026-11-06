# The weekly call's routine

A scheduled cloud session runs this every Friday. It writes the week's call
(`src/call.ts`): the week's data, which `/call` plays and which, with the
template, is the call's DNA. When a speech engine is installed, it also
renders the call as a video. Everything it writes is public, as the
repositories are.

## The week

The seven days ending the day before the run: Friday to Thursday. For a run
on Friday 2026-11-13, that is 2026-11-06 to 2026-11-12. If last week's file
is missing (a missed run), cover from the day after the last week's `to`,
up to 14 days.

## Steps

1. **Start from `main`** on the session's branch, and install:
   `pnpm install --frozen-lockfile`.
2. **Read the facts:**
   `pnpm --filter @some-ui/video-render render call-facts --from <from> --to <to> > facts.json`
   in the scratchpad. It holds the week's merged pull requests (with each
   one's change kind and "Calls I made"), promise trailers, open asks, and
   the epics that moved, with their "Where we are".
3. **Read the ledger:** the Residual Ledger's `items`
   (https://claude.ai/artifact/Ktc1i8JtBGQVdXEraobxgA) with `ArtifactData`,
   every item whose `status` isn't `done`.
4. **Write the week** as
   `apps/www/src/lib/web-surface/call/weeks/<from>.json`, schema
   `some-ui.call-week/1`, `read` set to both repositories' `main` commits:
   - **board:** a row per ledger item not done, its title shortened to fit
     a card, its `status`, and its `tally.waits_on_you`.
   - **moved:** up to 12 epics that moved, each said from its "Where we
     are": what landed, and what is next. Every PR it says landed is in a
     batch.
   - **done:** up to 12 batches of related pull requests, grouped by the
     story they moved. Leave out bots' PRs and route snapshot syncs. Say
     what each batch changed for the owner, never how.
   - **gray:** up to 8 promises declared or amended this week, from the
     trailers, said as what they now hold.
   - **mine:** up to 8 calls from the week's "Calls I made" sections worth
     the owner hearing: the options, the one taken, why, how to undo it.
     Leave out what a check or a convention decided.
   - **asks:** every open ask that parses, newest first, up to 12: each one
     filed this week, then the rest by what they unblock. An ask that
     doesn't parse is named in the PR body, never guessed. The others go in
     **later**, with up to 20 more owner items from the ledger's
     `first_step` "Yours:" lines that have no ask yet.
   - Each `said` is plain, spoken English, a few sentences, in the owner's
     terms: what changed for them and what it unblocks. No file names,
     routes or internal terms. The close says how many asks are open.
5. **Check it:**
   `pnpm --filter @some-ui/video-render render call-check <the file>` until
   it says ready.
6. **Record it:** `pnpm --filter www build`, then
   `pnpm --filter www record:call --week <from> --voices edge` if the
   `edge-tts` command is installed, else `--voices none`. A scene the frame
   can't hold is refused: shorten its words or its list, and record again.
   The video and its stills stay in the session (`apps/www/out/call/`).
7. **Open a pull request** with the week's file alone, titled
   `feat(www): the weekly call for <from> to <to>`, `Change-Kind: story`.
   Its body says what the week's facts held (counts), any ask that didn't
   parse, and whether a video was made. Drive it to green and merge it
   (`.claude/skills/steward/SKILL.md`): it adds one data file, which
   `call-check` and the stage's own tests hold.
8. **Say where it is:** the call plays at `/call?week=<from>` on the Pages
   site once the merge deploys. Note the run in the ledger's `log`.

## What it never does

- Answer an ask, close one, or change an epic's text. The call reports; the
  owner decides.
- Invent a call made without the owner. If "Calls I made" is empty, `mine`
  is empty, and the close says so.
