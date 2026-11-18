# Takes brought to a session, and found again

The design of TAKES4 as the owner decided it on 2026-11-18 (epic #3029, the comment "Owner's
decision, 2026-11-18 (later the same day): no GitHub filing. Take path A."). Design only:
nothing here is built yet, and the stories at the end build it. Checked against `main` of both
repositories on 2026-11-18 (some-ui `fb04d1d`, paulgsc/server `efe3c37`).

## What the owner asked for

> "There's an ephemeral moment when I have a take, any kind of idea or concept that informs some
> decision on any of the infrastructure ... Then there's active decision and coordination ...
> These two don't happen at the same time, and there's no promise they ever happen together.
> So, first, capture the epiphany immediately; that's the takes ceremony in the APK. Next, at
> any time, for any take, see whether to move it on to a coordinator session. My requirement
> there is a good way to query, reach for, pivot, sort, filter and see the status of takes. And
> the coordinator needs to be aware of the take itself, because that's the context I prompt
> from."

(Close paraphrase of spoken words, 2026-11-18; the owner chose path A, C590.) Four things
follow:

1. **Find again.** Takes keeps every take paired with what it is about, with search, filters,
   sort, and a status in the owner's words: _Captured → Brought to a session → Became #n_, or
   _Let go_.
2. **Bring to a session.** Any take copies one self-contained block, which the owner pastes into
   a coordinator session. Nothing is published, and home holds no GitHub key.
3. **"Became #n" comes back on its own.** The epic or story a coordinator files carries the
   take's ID, and home finds it by reading public GitHub search, with no key and no writes.
4. **No routine files takes or notes.** The Reflections run's Part E retires.

## What exists today

- **Takes** (TAKES2/TAKES3, #3074): the first page has a tile per kind (`TAKE_KINDS` in
  `packages/ui/soundbites/src/lib/library/compartments.ts`: note, scene, idea, ask, here) plus
  All, each with its count. A kind's page lists cards under counted chips for place (on this
  phone, on home) and for the conveyor's five stations. Each card says what the take was for,
  through `apps/www/src/lib/take-about` (the join is the phone's alone, C420). `TakeLibrary`
  searches home's takes by their words or meaning (`GET /api/v1/voice-notes/takes?q=`, server
  `docs/take-library.md`). The list is newest first, with no other sort, and the search covers
  only takes home holds.
- **The conveyor** (server `docs/conveyor.md`, table `studio_take_move`): in the oven, cooking,
  ready for pickup, picked up, canned. Moves are append-only rows ordered by `seq`. A move to
  `picked-up` comes only from `ready-for-pickup` and always carries its issue
  (`<owner>/<repo>#<n>`), and `picked-up` is the last station (invariant 4). Only `studio`
  takes that are no idea's answer and were not let go are on it (invariant 3).
- **Part E** (`packages/ui/topik/ROUTINE.md`, through `@some-ui/video-render`'s `pending.ts`)
  files a take moved to ready for pickup, a note on an episode and a spoken answer to an ask as
  pending `from-studio` issues, and answers each pickup in the mailbox's `picked` folder, which
  home turns into the move to `picked-up` (`file_host/src/mailbox/pass.rs`).
- **Copying on the phone:** `apps/www/src/lib/clipboard` (through `callForeign`, used by
  `components/copy-button` and Rust Rounds' "Copy for a tutor"), and Android's share sheet
  (`apps/www/src/lib/share-files`).
- **Home and GitHub:** home reads public files from `raw.githubusercontent.com` without a key
  (`call_weeks`, `clips`, `pd_fills`, `cards_essays`), on a timer, and writes nothing to GitHub.
- **Rust Rounds and interview takes** (`rust-round`, `interview`) are kept and heard on home
  like any take, but have no compartment in Takes and are not on the conveyor (#3210, #3211).

## 1. The status, on the conveyor (C585, C589)

The owner's four statuses are the conveyor's stations under the owner's words. The stations
keep their names in the database, so every conveyor invariant holds unchanged:

| Station            | The owner's status    | How a take gets there                               |
| ------------------ | --------------------- | --------------------------------------------------- |
| `in-the-oven`      | Captured              | recorded                                            |
| `cooking`          | Captured · working on | the owner moves it                                  |
| `ready-for-pickup` | Brought to a session  | "Bring to a session" (section 3), and only that     |
| `picked-up`        | Became #n             | home finds its issue (section 4), only from Brought |
| `canned`           | Let go                | the owner moves it; home keeps it                   |

**Takes on no conveyor.** Invariant 3 leaves two kinds of take off the conveyor: an idea's
answer (until TAKES13, #3210, widens it) and a take the owner set aside. They still get a
status, from what home holds rather than a station: "Captured", or "Became #n" once home links
an issue to them (section 4), and a set-aside take reads "Let go", the same word as `canned`,
since both mean kept and not pursued (CLAUDE.md: "'Let go' still sets a recording aside and
keeps it"). "Bring to a session" works on them too: it copies the block, and makes no move,
since there is no station to move, so they go from Captured straight to Became.

**No move to Brought without the copy.** The conveyor page's "Move to …" control no longer
offers Brought; "Bring to a session" is the only way there, so the status says what was done.
A take already at `ready-for-pickup` when this ships was moved there under the old meaning,
"ready for pickup", which is what Brought now names: it reads "Brought to a session", and Bring
copies its block like any other. Nothing stored says whether it was ever copied, and nothing is
added to say so.

"Captured" covers both early stations; the card keeps "working on" as a mark so the owner's own
sorting isn't lost. The words live in `apps/www/src/lib/take-conveyor/words.ts`: the station
names, what each `means`, the page's `intro`, and the refusals that name the pickup
(`refused.pickup`, `refused.final`) all change, since nothing "picks up" a take any more.

## 2. Find again

On Takes, beside what #3074 already gives:

- **Status chips** in the owner's four words, counted, on every kind's page and on All, beside
  the place chips. A chip counts what it would show, as the station chips do today. The station
  chips give way to them.
- **Sort:** newest first (today's), oldest first, and by what it's about (the episode and
  moment, the scene, the ticket), so takes about one thing sit together.
- **Search** covers every take, not only home's: home's word and meaning search
  (`GET /voice-notes/takes?q=`) for what was said, and on the phone, what each take was for
  (`take-about`'s words) and its take ID (section 3), so a take named in a session or an issue
  is found by its ID.
- **"Became #n"** on a card opens the issue on GitHub; more than one issue carrying the take's
  ID shows as "Became #n, also in #m".

The words live in `packages/ui/soundbites/src/lib/library/words.ts`, with its test that no ref,
id or internal term reaches the screen (the take ID is the owner's handle, shown on purpose).

## 3. Bring to a session (C586)

**The take ID.** Each take gets a short ID derived from its note id: `tk` followed by the first
ten characters of the base-32 encoding (lowercase `a`–`z`, `2`–`7`) of the SHA-256 of the note
id, for example `tk4m7q2xa3bf`. It is one word to GitHub's search (no punctuation inside, so it
is never split), 50 bits wide, so two of the owner's takes sharing one is not a practical risk,
and derived, so the phone and home compute the same ID with nothing stored. A note id itself
(up to 64 characters, with `-`, `_`, `.` and `:`, server `voice_repo::is_note_id`) is split by
search at its punctuation, which is why it isn't the ID.

**The block.** "Bring to a session", on every take's card and on its own page, copies one
plain-text block to the clipboard (`lib/clipboard`) or, by a second control, hands it to
Android's share sheet as text (`Share.share({ text })`, a text port beside
`lib/share-files`, which shares files), and moves the take to Brought (a move to
`ready-for-pickup`, through the conveyor's own route). The block is self-contained, so a
coordinator session with no other context can act on it:

```
A take from Studio (take tk4m7q2xa3bf)
Kind: a note on an episode
About: the call, week of Nov 6, at 3:12 (picks: Pacing, The voice)
Said: 2026-11-17, 21:40
What home heard: <the transcript, as home heard it; or "Home hasn't heard this take yet">
How home heard it: heard clearly
If you file an epic or story for this, put this line in its body:
From take tk4m7q2xa3bf
```

The "About" line is `take-about`'s words for the take's kind: the episode and moment and picks,
the scene of a video, the idea and its question, the ask's number and question, the Rust Rounds
ticket, the interview question, or "recorded on its own". Nothing in it is a ref or a route.

The block goes only where the owner pastes it: a coordinator session the owner opens. Nothing is
published by the copy, and nothing leaves home: the phone builds the block from what it already
holds (home's transcript is already on the phone's takes read). That holds only once home's own
pickup filing has stopped: today home puts every take at `ready-for-pickup` into the mailbox's
`pickup` folder, transcript included, so TAKES12's server half stops that before Bring ships
(section 5). Part E's rule never to quote the
transcript in an issue (ROUTINE.md's C2) is the coordinator's to keep when it files: the
session is told the issue's words are its own (story 4, below).

Bringing a take again copies the same block and makes no new move. A canned take can still be
brought, which moves it back to Brought; a set-aside take is brought without a move.

## 4. "Became #n": home reads public search (C587)

Home never writes to GitHub and holds no key. It learns which issue a take became by reading
GitHub's public search:

- **Two queries a pass, every 15 minutes,** since GitHub's search answers `422` unless a query
  names `is:issue` or `is:pull-request`:
  `GET https://api.github.com/search/issues?q=user:paulgsc+author:paulgsc+is:issue+"From take"+in:body&sort=updated&order=desc&per_page=100`,
  and the same with `is:pull-request`. `user:paulgsc` covers every public repository of the
  owner's (some-ui, server, dotfiles, and any later); `author:paulgsc` keeps out anything a
  viewer writes, since every take's ID ends up in a public body and a stranger's issue naming
  one must not link it. `"From take"` is the phrase the block asks for. Each result carries its
  body, state, why it closed (issues) and whether it merged (pull requests), so the queries both
  find new items and keep found ones' status current (a change of state updates an item, which
  brings it to the top).
- **Reading it:** home reads pages back to an hour before its last pass, not just to the last
  pass, since search is eventually consistent and an item updated just before a pass can be
  indexed only after it; reading an item twice changes nothing, since rows are written only on
  a difference. In each body it finds the line `From take tk…` and takes the IDs it holds a
  take for. GitHub stems the phrase, so most results lack the line: a normal pass reads one page
  of each query. The first pass, with nothing seen yet, reads up to search's 1,000-result cap
  (ten pages a query); it spaces its pages to at most eight a minute and keeps where it got to,
  so a pass that stops resumes at its next page rather than starting over.
- **Issues make the move, pull requests add a link.** Only an issue moves a take to Became; a
  pull request that carries the line (often copied from the issue it closes) is kept as a link,
  whether it is read before the issue or after. A take whose only link is a pull request stays
  Brought, and its card reads "Brought to a session · in PR #m"; with an issue too, "also in
  PR #m".
- **Limits:** unauthenticated search allows 10 requests a minute from an address; home makes
  eight an hour, plus pages. A failed pass (no network, a `403` or `429` rate limit, a `5xx`)
  waits for the next, honouring `retry-after` when given. Only public repositories are seen;
  an issue in a private one is never found, and the take stays Brought.
- **What home keeps,** append-only, in two new tables that leave with the account and with
  their take when the owner deletes it for good from My data:
  - `take_issue_link`: the take, the item's GitHub `id` (stable across a transfer),
    `<owner>/<repo>#<n>` as first seen, issue or pull request, and when home first saw it. One
    row per item carrying the ID, never removed: if a later edit drops the line, the link
    stays, since it was true when seen.
  - `take_issue_seen`: for each linked item, by its GitHub `id`, what home saw and when: open
    or closed, why it closed or whether it merged, and its address if that changed (a
    transfer). A row only when something changed. Home reads only items updated since an hour before its last
    pass, so an unchanged item and one that stopped matching look alike: both are absent. So
    an item whose line was later removed, or whose repository went private, keeps the state
    home last saw, and a later close is never seen. That is this design's limit.
- **The move to Became:** when home first links an issue to a take at Brought, it appends the
  move to `picked-up` with that issue, in the same transaction (invariant 4's rule: only from
  `ready-for-pickup`). A take linked while at another station, or on no conveyor, keeps its
  station; its card shows "Became #n" all the same, since the link is the record.

What "Became #n" then shows, in the owner's terms: "Became #n · open", "Became #n · done",
"Became #n · closed without a change" (from `state_reason`). A pull request that carries the line shows as "also in PR #m"; one that only mentions the
issue isn't read, and the issue's own page shows it. No state name or status code reaches the screen; "open" and "done" are the owner's words
for those rows (C589).

## 5. What retires

Removed by the stories below, in the same PRs that replace them:

- **Part E** of `packages/ui/topik/ROUTINE.md` (all three kinds it files: answers to asks,
  notes on episodes, pickups), `@some-ui/video-render`'s `pending.ts` and its `render pending`
  command, and the line about Part E in the Reflections scheduled task's prompt. Moving Part E
  is a change to a recorded call, so it is a story that `moves` it (C585 moves C297, and with it C298).
- **The mailbox's `pickup` and `picked` folders**: home's `file_pickups` and its picked reader
  (`file_host/src/mailbox/pass.rs`, `PICKUP_SCHEMA`, `PICKED_SCHEMA`), the folders in
  `apps/mailbox`, and server `docs/conveyor.md`'s "Pickup" section. Every answer the routine
  gave is already a `picked-up` move on home, so nothing is lost; the folders' live files are
  archived as the mailbox archives any file, not deleted unread.
- **`docs/asks.md`, "Answering":** a spoken answer to an ask is a take like any other, brought
  to a session by the owner; the ask stays open until a session acts on it.
- **Notes on episodes** are no longer filed by any routine; how a note (as distinct from its
  spoken take) reaches a session is #3035's.
- **#2973** closes as not planned: nothing files pickups.
- Issues Part E filed (#3173, #3174) stay as they are, and the takes it filed stay at
  `picked-up` with those issues.

**The cutover: the routine and home never both act on a take.** Part E reads takes at
`ready-for-pickup`, and "Bring to a session" moves takes there. So, before the phone's "Bring to
a session" ships, Part E's some-ui half (TAKES12, #3208) lands and the Reflections run that
follows shows no Part E in its record, and home's `file_pickups` stops putting takes in the
mailbox (the first step of TAKES12's server half; the folders themselves retire after). Home's search never files anything, so it can't
collide with Part E; a take Part E filed is already at `picked-up` and stays there.

## Against the assurance grammar

A new operation family in `packages/assurance/src/ledger.json`, **`take-found`: "A take I bring
to a session finds the issue it became"**, served by one process with two segments: GitHub →
home (the search pass) and home → phone (the takes read). The copy is the phone's alone and
crosses nothing. Its objectives:

| ID  | Kind     | Requirement                                                                                                                                                                                      |
| --- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| TF1 | OA3      | "Became #n" shows only once `take_issue_link` holds a link to an issue; a pull request alone reads "in PR #m".                                                                                   |
| TF2 | OA6      | A search pass that stopped reads apart from a quiet one: each pass's start and outcome is a metric, and a missed hour alerts.                                                                    |
| TF3 | OA8      | Every failed pass is counted and named (no network, rate limit, `5xx`), and a run of failures alerts (`TakeSearchFailing`).                                                                      |
| TF4 | RE1      | Every search request is counted, with GitHub's own rate-limit headers kept.                                                                                                                      |
| TF5 | RE3, RE7 | A pass is two search requests (issues, pull requests) plus a page for each further 100 items updated since an hour before the last pass; the first pass reads at most search's 1,000-result cap. |
| TF6 | RE9      | Growth: one link row per item (issue or pull request) carrying a take's ID, one seen row per change; nothing deleted but with the take or the account.                                           |

Stores: `server:take_issue_link`, `server:take_issue_seen`. The `routine-to-home` family loses
the pickup's objectives as Part E retires, and the mailbox stores' growth lines lose `pickup`
and `picked`. Each is a narrowing of a promise, so the story that makes it carries an amendment
naming the owner's decision of 2026-11-18. The new tables are placed only once their server PR
is ready to merge (CLAUDE.md, "Operational assurance").

## What the owner decided

- **C590** (2026-11-18): path A. Takes are brought to a session by the owner's paste, and home
  holds no GitHub key. The earlier answers on #3199, #3200 and #3201 stand recorded on those
  issues but no longer apply.
- Gone with path B: sessions can't browse takes by area on their own (TAKES5). B remains
  possible later.

## Stories

Sub-issues of #3029. TAKES12 (#3208), TAKES13 (#3210) and TAKES14 (#3211) stay; the others were filed
from this design. In order:

1. **TAKES12** (#3208): Part E out, and the Reflections run's record showing it; and on the
   server, `file_pickups` stops. Before anything in step 3.
2. **TAKES15, the ledger** (#3214, some-ui): the `take-found` family and its process.
3. **TAKES16, Bring to a session** (#3215, some-ui): the take ID, the block (a pure module with its test), copy
   and share, the move to Brought, the ID on the card.
4. **TAKES17, the "From take" line** (#3216, some-ui): the coordinate skill tells a session that files an epic or
   story from a pasted take to put the block's line in its body, in its own words otherwise.
5. **TAKES19, the search pass** (#3218, server): the worker, `take_issue_link` and `take_issue_seen`, the move
   to `picked-up`, the takes read carrying each take's links and their state, metrics and the
   alert.
6. **TAKES18, Find again** (#3217, some-ui): status chips in the owner's words, sort, search over every take
   (words, what it's about, its ID), and "Became #n" on the card.
7. **TAKES12, the rest** (#3208): the pickup folders and their readers retire.
8. **TAKES13** (#3210, server) and **TAKES14** (#3211, some-ui): Rust Rounds and interview takes
   on the conveyor and in their own compartments.

## Calls

- **C585:** the owner's four statuses are the conveyor's stations under new words; "Bring to a
  session" is the move to ready-for-pickup, and "Became #n" is the move to picked-up that home
  makes when it finds the issue. Moves C297 (the routine filing pickups), and with it C298, that filing's known limit.
- **C586:** the take ID (`tk` and ten base-32 characters of the note id's SHA-256) and the
  block's lines, copied or shared.
- **C587:** home reads public GitHub search for `"From take"` in the owner's own issues and pull
  requests across their public repositories, two queries every 15 minutes, with no key.
- **C589:** the status words, and that a pull request shows only when it carries the line.
- **C590** (the owner's): path A.
