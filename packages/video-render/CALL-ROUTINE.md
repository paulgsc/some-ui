# The weekly call's routine

A scheduled cloud session runs this every Friday. It writes the week's call
(`src/call.ts`): the week's data, which `/call` plays and which, with the
template, is the call's DNA. The week lives in `paulgsc/testing`, beside
Playoff Delta's data, so neither `paulgsc/some-ui` nor `paulgsc/server`
holds data (ST36, #2635). The owner's home voices and renders it: the
session's part ends at the written week. Everything it writes is public.

## The week

The seven days ending the day before the run: Friday to Thursday. For a run
on Friday 2026-11-13, that is 2026-11-06 to 2026-11-12. If last week's file
is missing (a missed run), cover from the day after the last week's `to`,
up to 14 days.

## Steps

1. **Start from `main`** of `paulgsc/some-ui` (for the tools) and of
   `paulgsc/testing` (for the weeks), and install some-ui:
   `pnpm install --frozen-lockfile`.
2. **Read the facts:**
   `pnpm --filter @some-ui/video-render render call-facts --from <from> --to <to> > facts.json`
   in the scratchpad. It holds the week's merged pull requests (with each
   one's change kind), the calls that reached `docs/calls.json` on `main`
   in the week or were agreed to in it (each with who made it), promise
   trailers, open asks, and the epics that moved, with their "Where we
   are". It reads the record from the checkout's history, so the clone must
   reach back to the week's start (`git fetch --shallow-since=<from>` on a
   shallow one). Then read the week's session notes: the files in
   `paulgsc/testing`'s `sessions/` whose `ended` falls in the week
   (`src/session-note.ts`, SFEED9).
3. **Read the ledger:** the Residual Ledger's `items`
   (https://claude.ai/artifact/Ktc1i8JtBGQVdXEraobxgA) with `ArtifactData`,
   every item whose `status` isn't `done`.
4. **Write the week** as `call/<from>.json` in `paulgsc/testing`, schema
   `some-ui.call-week/1`, `template` set to `{"id": "conference-call",
"version": <CALL_VERSION>}` (the newest, `src/call.ts`; `call-check`
   refuses an older one on the newest week), and `read` set to both
   repositories' `main` commits. The intro, the chapters and the brand
   slides are the template's, filled by code: write none of them.
   - **board:** a row per ledger item not done, its title shortened to fit
     a card, its `status`, and its `tally.waits_on_you`.
   - **moved:** up to 12 epics that moved, each said from its "Where we
     are": what landed, and what is next. Every PR it says landed is in a
     batch. A session note's `left` says what is next where the epic hasn't
     caught up.
   - **done:** up to 12 batches of related pull requests, grouped by the
     story they moved. Leave out bots' PRs and route snapshot syncs. Say
     what each batch changed for the owner, never how.
   - **gray:** up to 8 promises declared or amended this week, from the
     trailers, said as what they now hold.
   - **mine:** up to 8 of the week's `calls`, and of its session notes'
     `calls`, worth the owner hearing: the options, the one taken, why it
     was gray, and how to undo it. A call in both is said once. Say whose
     call it was: Claude's alone, Claude's with the owner agreeing, or the
     owner's; a session note's calls are Claude's alone.
   - **asks:** up to 12 open asks that parse: first those filed this week,
     newest first, then the rest by how much each unblocks. An ask that
     doesn't parse is named in the PR body, never guessed. The others go in
     **later**, with up to 20 more owner items from the ledger's
     `first_step` "Yours:" lines that have no ask yet.
   - Each `said` is plain, spoken English, a few sentences, in the owner's
     terms: what changed for them and what it unblocks. No file names,
     routes or internal terms. The close says how many asks are open.
5. **Check the folder** once step 6 has updated the index:
   `pnpm --filter @some-ui/video-render render call-check <paulgsc/testing>/call`
   until it says ready. It checks the index, every week it lists against the
   schema, each named for its own days, and no week file the index forgets. A scene's words and lists must fit its frame: keep `said`
   to a few sentences, as the schema's sample does.
6. **Update `call/index.json`:** the new week first. Keep at most `keep`
   weeks. A week past `keep` leaves the repository only if home holds it.
   Home reads the index hourly and keeps every week it lists, and its `call`
   index in the mailbox lists every week it holds, with the SHA-256 of the
   bytes it keeps. If `JOBS_MAILBOX_URL` and `JOBS_MAILBOX_TOKEN` are set,
   list the mailbox's `index` folder:

   ```sh
   curl -sS --max-time 30 -H "Authorization: Bearer $JOBS_MAILBOX_TOKEN" \
     "$JOBS_MAILBOX_URL/v1/index/items?after=0&limit=50"
   ```

   Then fetch the item whose name starts `index-call-` from
   `index/items/<name>` (the mailbox keeps only the newest, and a `404`
   means home put a newer one since the listing, so list again, once).
   A week past `keep` leaves, file and index entry both, only when that
   index's `held` lists its `from` and `to` with the SHA-256 of the file in
   the repository (`sha256sum call/<from>.json`). Keep the week, let the
   index run past `keep` and say why in the PR body when:

   - there is no mailbox or no `call` index;
   - the index doesn't list the week;
   - its SHA-256 differs. Home keeps a week as it first read it, so an edit
     made since never reaches home.

   Never delete a week home doesn't hold byte for byte, and never edit a
   week home already holds.

7. **Open a pull request** in `paulgsc/testing` with the week, the index and
   any week leaving, titled `data(call): the weekly call for <from> to <to>`.
   Its body says what the week's facts held (counts), any ask that didn't
   parse, and any week kept past `keep`. Merge it once `call-check` says the
   folder is ready: the repository has no CI, so that check is its gate.
8. **Say where it is:** the owner's home-network build plays it at
   `/call?week=<from>`, and home voices and renders it. Note the run in the
   ledger's `log`.

## What it never does

- Answer an ask, close one, or change an epic's text. The call reports; the
  owner decides.
- Invent a call made without the owner. If the week's `calls` is empty,
  `mine` is empty, and the close says so.
