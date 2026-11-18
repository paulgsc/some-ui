# Takes that become issues: home files them, and each take follows its issue

The design of TAKES4 as the owner reshaped it on 2026-11-18 (epic #3029, the comment
"Owner's direction, 2026-11-18 (night)"). Design only: nothing here is built yet, and the
stories at the end build it. Checked against `main` of both repositories on 2026-11-18
(some-ui `fb04d1d`, paulgsc/server `efe3c37`).

## What the owner asked for

> "There shouldn't be a routine that picks up takes, because the routine wouldn't know what
> to do with it... home can create the GitHub issue. So basically, takes go on the conveyor.
> And if I say I want this to become an issue, home is the one that creates the GitHub issue.
> And then the take now moves to: this take has a GitHub issue, of that status. And that's a
> page of itself."

(Close paraphrase of spoken words, 2026-11-18.) Five things follow, and each section below
answers one or more:

1. No routine picks up takes. The Reflections run's Part E retires.
2. Home creates the issue, and only when the owner says so, from the phone.
3. The take's status follows the issue's, in the owner's words, and a closed issue sends its
   take to the archive.
4. A coordinator session picks the work up from the issue. Nothing sits in between.
5. Every take stays paired with what it was said for: an episode, a scene, an idea, an ask, a
   Rust Rounds week, an interview week, or nothing in particular.

## What exists today

- **The conveyor** (server `docs/conveyor.md`, table `studio_take_move`, CONVEYOR1 #2873) has
  five stations: in the oven, cooking, ready for pickup, picked up, canned. Moves are
  append-only rows ordered by `seq`. A move to `picked-up` comes only from `ready-for-pickup`
  and always carries `issue` (`<owner>/<repo>#<n>`), so the schema already pairs a take with
  one issue.
- **The pickup** (CONVEYOR3, #2875): home puts `pickup-<note>-<seq>.json` in the mailbox once
  it has heard the take (`file_host/src/mailbox/pass.rs`, `file_pickups`). The daily
  Reflections run (`packages/ui/topik/ROUTINE.md`, Part E, through
  `@some-ui/video-render`'s `pending.ts`) files it as a `pending`, `from-studio` issue and
  answers in `picked`, and home appends the move to `picked-up`. Part E also files answers to
  asks said on an ask's page, and notes left on an episode (#2745). Its known limit is #2973.
- **Only `studio` takes** are on the conveyor and in the take library
  (`voice_repo::takes`, server `docs/take-library.md`). Rust Rounds takes (`rust-round`) and
  interview takes (`interview`) are voice notes of their own kinds, kept and heard the same
  way, but no Takes compartment shows them.
- **Takes' compartments** (TAKES2/TAKES3, #3074): `TAKE_KINDS` in
  `packages/ui/soundbites/src/lib/library/compartments.ts` is note, scene, idea, ask, here.
  What each take was for comes from `apps/www/src/lib/take-about`, on the phone alone (C420).
- **Home and GitHub today:** home reads public files from `raw.githubusercontent.com` without
  a token (`call_weeks`, `clips`, `pd_fills`, `cards_essays`), on a timer, because "GitHub
  tells home nothing, and home makes only outbound requests" (`call_weeks.rs`). Home holds no
  GitHub credential and makes no write to GitHub. Its secrets are sops-encrypted in server's
  `deploy/home/file_host.sops.env` (`MAILBOX_TOKEN`, `VAPID_PRIVATE_KEY`, and so on).

## The shape

```
phone ──"Make it an issue" (draft)──▶ home ──create issue──▶ GitHub
  ▲                                     │ ◀──poll state (conditional)──┘
  └──── "Filed as #n · Waiting for a session" ◀──┘
                                                       coordinator session ◀── owner points at #n
```

### 1. The owner's word: one entrance, the conveyor (C585)

"Make it an issue" is the conveyor's move to `ready-for-pickup`, under new words. The
station keeps its name in the database, so every conveyor invariant holds unchanged: home
files only from that station, and the move to `picked-up` carries the issue, as it does
today. What changes is who acts on it: home's own filer instead of the mailbox and the
routine.

The move carries a draft (section 4). Home keeps it in a new append-only table,
`take_issue_request`, because a move is never updated and the draft is longer than a move's
280-character comment. A send is a row of its own (the take, the move's `seq`, and the send's
own number), so sending again after a refusal, to the same place or another, appends a row
and the newest send for that move is the one home files.

**One issue per take.** `picked-up` is the conveyor's last station (server
`docs/conveyor.md`, invariant 4), so a take is filed once. A second thought on a filed take
is a new take. A note on an episode and its spoken take are two things: the take (kind
`note` in Takes) is sent from the conveyor like any take and gets its one issue; the note
itself, its picks and the places they send it, is filed from the note, and its issues are
#3035's. A take's card shows its own issue; the note's page shows the note's.

Every kind of take reaches the same entrance. Today only `studio` takes that are no idea's
answer and that was not let go of are on the conveyor (server `docs/conveyor.md`,
invariant 3). That rule lives in the conveyor's queries, not in a CHECK: `holds_take`,
`at_station` and `in_the_oven` in server `crates/db/voice/src/conveyor.rs`, the library
read in `takes.rs`. The let-go rule is already inside those three queries (a `NOT EXISTS`
on `voice_note_set_aside`, which checks no kind), so it needs no change. The library read
decides "on the conveyor" through `delete::deletable` (`takes.rs`), which also feeds the
owner's per-kind delete switch (`delete.rs`, `allows`): widening the library must not widen
`deletable`, or which kinds can be deleted widens with it. Widening it to `rust-round` and `interview` takes, idea answers, and any
kind added later is a change to those queries and an amendment to invariant 3; no
migration. Takes then shows a compartment for each: Rust Rounds and Interview weeks, beside
the five there are now. A filed take that is later let go keeps its issue: "Takes with
issues" still lists it, marked set aside, since the pairing is the record.

Withdrawing (#2973's case) is a cancel. Home starts filing as soon as it can reach GitHub,
and every attempt, the first and each retry, first checks that the take's newest move is
still the `ready-for-pickup` move the send names. A take moved on before that check is not
filed, however long home was waiting. What remains is the moment between that check and
GitHub's answer, since a request to GitHub can't sit inside home's transaction. A move that
lands in that moment leaves the take where the owner put it, and the issue is still kept
with the take (section 5), so nothing is lost and nothing is filed twice.

### 2. Home's GitHub credential and its least scope

Home needs to create issues, add labels at creation, comment (an ask's answer, section 3),
read issue state, and read which pull requests mention an issue (section 7). On GitHub that
is **Issues: read and write**, **Pull requests: read**, and **Metadata: read**, on the
repositories home files into, and nothing else: no contents, no
writes to pull requests, no workflows, no administration.

**Home files as its own GitHub App** (the owner's call, C590, #3199: "go with the GitHub
App"). The owner creates the app with exactly those permissions and no webhook, and
installs it on the repositories home may file into. Its issues read as the app's
("… [bot]"), apart from the owner's. The app's ID, its installation's ID and its private
key live in `deploy/home/file_host.sops.env` beside `MAILBOX_TOKEN`, encrypted to the
owner's key; only the owner can add them, since only they can encrypt with sops. Home
mints a one-hour installation token from them when it needs one. Nothing expires on a
date, so there is no expiry to warn about.

Home's config treats their absence as "filing is off": the phone then withdraws the "Make
it an issue" control and says why, in the person's terms ("Home can't file issues yet").
The key and the tokens are never sent to the phone, never logged (`redacted.rs`), and never
reach the mailbox.

### 3. Which repository, and which labels

The owner picks the repository in the draft, each time, from the repositories the app is
installed on (the owner's call, C591, #3200: "setting the repo is part of the flow to
trigger issues create"). There are no defaults per kind, and which repositories home may
file into is which the owner installs the app on. The one exception is an answer to an
ask: it goes to the ask itself, in the ask's repository (C588), and the draft says so
instead of offering a picker.

**An ask's answer is a comment on the ask, not a new issue (C588).** The ask is already the
issue the answer belongs to, and the session that acts on it reads it there
(`docs/asks.md`, "Answering"). The take then follows the ask's status.

Labels, set at creation: `from-studio` (kept from Part E, so TAKES5 and earlier queries
still find every issue that came from Studio), `pending` (waiting for a coordinator
session), and the kind label CLAUDE.md requires: `kind:defect` for a note on an episode
whose pick is "a slide drawn wrong" (`defect`), `kind:story` for every other, as Part E
does today. A label the repository lacks is created by the story that turns filing on, not
by home at runtime.

### 4. What the issue says (C586)

The owner sees the issue before it exists. "Make it an issue" opens a sheet on the phone
with a draft the owner can edit and then sends:

The draft starts empty apart from what the take was for (the owner's call, C592, #3201:
"start empty"). Nothing the owner said aloud is published unless they type it.

- **Title:** what the owner types.
- **Body:** what the owner types. Then the context, filled in by home from the same join
  Takes already makes (`take-about`):
  - what the take was for, in the kind's own words: "A note on the call, week of Nov 6, at
    3:12 (Pacing, The voice)"; "Scene 4 of _Home deploy, part 1_"; "An answer to #2545";
    "Rust Rounds, 2026, week 46";
  - when it was said;
  - how home heard it (its verdict: heard, unclear, nothing said), so a session knows when
    to listen instead;
  - the owner's labels from the conveyor, as words. The move's comment stays on home, by
    the owner's own call (C296);
  - the link back: the take's id and where it is ("Studio › Takes on home, take
    `<id>`"). Home's address is LAN-only and is never written into a public issue; the
    coordinator asks the owner to play the take when it needs to.
- **Last line:** a fixed marker, `<!-- take <note> -->`, which is how home recognises its
  own issue (section 6). It names the take, not the move, so it matches whichever send
  made it.

Never sent: the audio, the move's comment, and anything about another take. Since some-ui
and paulgsc/server are public, what the owner sends is published. Part E never quoted what
home heard (ROUTINE.md's C2 rule, #2670 decision 11: "never quote the transcript"), and had
a model write the issue in its own words. Home has no such model, and the owner chose an
empty draft, so that rule holds: the body is only what the owner types. A take home hasn't
heard yet can be sent the same way.

### 5. Home keeps the issue with the take (append-only)

Four new tables on home, each append-only (an UPDATE aborts), each leaving with the
account and with its take when the owner deletes it for good from My data (whose receipt
then says the issue link went; the issue itself stays on GitHub):

- `take_issue_attempt`: each attempt and its outcome (section 6).
- `take_issue_request`: the owner's word. Take, `seq`, the repository chosen, title, body,
  when it was asked.
- `take_issue`: the pairing. Take, `seq`, `<owner>/<repo>#<n>` (or the ask and the
  comment's id), when it was filed. At most one per take (section 1).
- `take_issue_state`: what home has seen of each issue. Issue, when seen, state
  (open, closed), why it closed (`completed`, `not_planned`, `duplicate`), the pull requests
  that closed or reference it, where it is now if it moved (`now_at`), and the ETag. A row is appended only when something changed.

On success home also appends the conveyor move to `picked-up` with the issue, if the take's
newest move is still the request's. That is the move Part E's answer makes today.

### 6. Filing, once

GitHub's create is not idempotent, and its answer can be lost (a crash, a timeout, a
`5xx`) after it has made the issue. So home records each attempt before it makes it, and
settles every attempt before it makes another for the same take.

A fourth append-only table, `take_issue_attempt`, holds one row per attempt (the take, the
send, the repository and what it creates: an issue, or a comment on an ask, and when it
started) and, as later rows, each attempt's outcome: made (with its number), not made, or
refused (with why). An attempt with no outcome is unsettled.

Home's filer is one worker beside the mailbox pass, woken by a send and on a timer. It runs
one pass at a time (a single-flight lock in the process, as home runs one `file_host`) and
takes one take at a time. For a take:

1. **Paired already?** If the take has a `take_issue` (its key is the take, so it holds at
   most one), create nothing. Append the move to `picked-up` only if the take's newest move
   is still the paired send's ready move. A take that has an issue but sits at another
   station shows its issue on its card all the same, and "Make it an issue" isn't offered
   for it again.
2. **Settle what came before.** For each unsettled attempt, in whichever repository it named,
   look for the take's marker: among that repository's `from-studio` issues, open and closed,
   created no earlier than ten minutes before the attempt started (GitHub's clock and
   home's differ; the list is fetched with `since=` and filtered by `created_at` on home),
   or, for an ask, among the ask's comments (`GET /repos/<o>/<r>/issues/<n>/comments`) in
   the same window. The lookup also matches Part E's line (section 10). Found: record the
   attempt as made and the pairing, and go back to step 1. Not found: record it as not
   made, but only once the attempt is at least ten minutes old, since GitHub can finish a
   create after home stopped waiting for its answer; until then it stays unsettled and the
   card still says "Home is filing this". If the repository is gone (`404`), or the ask is
   (`404` on its comments, or `410` there while the repository's issue list still answers:
   a deleted issue), the attempt is not made: anything made there is gone with it. A `410`
   on the comments while the issue list also answers `410` means issues are turned off,
   which takes the path below. If the lookup can't be made for any other reason (a `410` on
   the repository's issue list, which means issues are turned off and can come back,
   included), the attempt stays unsettled, no new attempt is made for
   that take, and the card says "Home is checking whether GitHub made this". Counted from
   the attempt's start, after 24 hours that becomes overdue: an alert reaches the owner
   (`TakeIssueUnsettled`), and the card offers "Check on GitHub" (the repository's issues)
   and "It wasn't made, send again". That records the owner's word as the attempt's
   outcome, sets aside the send it was for (home files only a send newer than it), and
   opens the draft; nothing is filed until the owner sends it. After an owner-settled
   attempt, each new attempt runs this step's lookup once more before it creates, until one
   reaches GitHub (made, refused, or its answer lost). If the marker
   turns up, a later row records the attempt as made after all and the take is paired; the
   newest outcome row is the one read. If that lookup can't be made either, the new attempt
   goes ahead: the owner has already accepted that risk (TF2's tolerance). Until the owner
   sends, the card says "Write its issue", as for a take waiting on its first draft.
3. **Still wanted?** Check the take's newest move is still the newest send's ready move
   (section 1). If not, stop: the owner withdrew it.
4. **Make it.** Append the attempt, then create the issue or comment, then record the
   outcome, the pairing, and (if step 3's condition still holds) the move to `picked-up`,
   in one transaction. If the answer is lost (a timeout, a `5xx`, a crash), the attempt is
   left unsettled and the take's turn ends this pass; step 2 settles it on a later pass. If
   GitHub answers with a rate limit (section 9), it made nothing: the attempt is recorded
   as not made and the next one waits the limit out.
5. **Refused.** A refusal is recorded as the attempt's outcome, with its reason, and shown
   to the owner (section 9). A refusal is settled: "Send it elsewhere" after it is safe,
   since GitHub made nothing.

Because step 2 runs before step 3, an issue made before a crash is paired even if the owner
moved the take on since; because no attempt starts while another is unsettled, a send to a
second repository can't make a second issue. The one way left is the owner's own: saying
"It wasn't made" about an attempt home could not check for 24 hours, when GitHub had in
fact made it somewhere home can no longer read. That is TF2's tolerance.

### 7. How home learns the status: a poll (C587)

A webhook can't reach home: home is on the LAN and makes only outbound requests, as
`call_weeks.rs` says. So home polls.

Each pass (every 15 minutes) makes, per repository home has filed into, at most three
conditional lists, each to a fixed URL so its ETag still matches next pass:

1. `GET /repos/<owner>/<repo>/issues?labels=from-studio&state=all&sort=updated&direction=desc&per_page=100`
   with `If-None-Match`. A `304` means nothing changed. On a `200`, home reads pages until it
   reaches an issue no newer than the last it saw, skips every item with a `pull_request`
   key (this endpoint lists pull requests too), and appends a `take_issue_state` row for
   each paired issue whose state changed.
2. The same with `labels=ask`, only while a take is paired with an ask's comment: an ask
   carries no `from-studio` label, and GitHub's `labels=` matches issues holding all of
   them, so one list can't hold both.
3. `GET /repos/<owner>/<repo>/pulls?state=open&per_page=100`, conditional, only while a
   paired issue is open: home reads which open pull requests mention a paired issue, as
   `#<n>` in the same repository or `paulgsc/<repo>#<n>` from another, matched as a whole
   reference (`#12` is not `#123`), or as the issue's full address on github.com. That
   gives "Being worked in PR #m". A mention doesn't change the issue, so the issue list
   alone can't show it. Pull requests are read in the repositories home has filed into, so
   work from any other repository doesn't show.

Two reads by issue, beside the lists:

- **When an issue closes,** home asks GitHub's GraphQL API once what closed it
  (`timelineItems(itemTypes: CLOSED_EVENT)`, each `ClosedEvent`'s `closer`: a pull request
  or a commit), since the REST timeline's close names only a commit.
- **Once a day,** home reads each paired issue by number
  (`GET /repos/<owner>/<repo>/issues/<n>`, conditional), closed ones included: a deleted
  issue only drops out of a list. A `301` (the issue moved to another repository) is
  followed, and the new address is kept in a `take_issue_state` row (its `now_at`), which
  later reads and the card use. A moved issue's status then comes only from this daily
  read unless home also files into its new repository, so it can lag by a day; the pairing itself is never rewritten. A move to a
  repository the app can't read, and a `404` or `410`, read as "Home can't see it any
  more".

A quiet pass is one to three `304`s per repository, which GitHub doesn't count against the
rate limit for a request with a token. The daily reads add one `304` per paired issue a
day, and the closing read one request per closure.

Issues are public, so the poll could go without the app's token, but GitHub allows only 60
unauthenticated requests an hour from an address. With the token it has 5,000, and the
token already reads issues, so the poll uses it.

### 8. What the phone shows

**On a take's card** (`TakeLibrary`, beside the place and station pills):

| The issue                                                    | The card says                                                                               |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| waiting on the owner's draft (none yet, or set aside)        | Write its issue                                                                             |
| asked, not yet filed                                         | Home is filing this                                                                         |
| not filed after 24 hours of trying                           | Home hasn't been able to file this since <when>                                             |
| an attempt home can't settle yet                             | Home is checking whether GitHub made this                                                   |
| that, after 24 hours                                         | Home couldn't check whether GitHub made this · Check on GitHub · It wasn't made, send again |
| open, no pull request yet                                    | Filed as #n · Waiting for a session                                                         |
| open, a pull request references it                           | Filed as #n · Being worked in PR #m                                                         |
| closed as completed                                          | Filed as #n · Done (in PR #m, when one closed it)                                           |
| closed as not planned or duplicate                           | Filed as #n · Closed without a change                                                       |
| home can't see it any more (deleted, or the app lost access) | Filed as #n · Home can't see it any more                                                    |

The words live in one pure table with its test (`packages/ui/soundbites/src/lib/library/words.ts`
for the card), and no state name, status code or "open/closed" reaches the screen (CLAUDE.md,
"State in the person's terms"). "PR #m" is the owner's own wording for this row (TAKES4 on
#3029). `#n` opens the issue on GitHub.

**"Takes with issues"**, a page of its own: `journal/takes/filed`, reached from a tile on
Takes' first page beside the kind tiles. It lists every take that has an issue, under the
same counted chips as a kind's page, but the chips are the issue's status (Waiting for a
session, Being worked, Done, Closed without a change), and each card still says what it was
for. **Archived** is a closed issue's take: it folds under the rest, as canned takes do on a
kind's page, and leaves "Takes with issues" counts of what is still open. The take itself is
never deleted or moved off the record; "archived" is how the page groups it.

The conveyor's words change with it (`apps/www/src/lib/take-conveyor/words.ts`): "Ready for
pickup" becomes "Make it an issue", "Picked up" becomes "Has an issue", and what each
station `means` follows ("The next pickup files it as an issue." becomes "Home files it as
an issue once you send it."), as do the conveyor page's `intro` ("…filed as an issue, by the
next pickup…") and the refusals that name the pickup (`refused.pickup`, `refused.final`). A take already at ready for pickup when this lands, with no
send, shows "Write its issue": home files nothing for it until the owner sends a draft.

### 9. Offline, and when GitHub refuses

- **The phone can't reach home.** The move waits in the phone's own send queue, as every
  move does today, and the card says "Waiting to reach home".
- **Home can't reach GitHub** (no network, GitHub down, `5xx`, rate limited). The request
  stays, home retries with backoff within one budget (RE2), and the card says "Home is
  filing this". After 24 hours it says "Home hasn't been able to file this since <when>",
  and an alert reaches the owner.
- **GitHub refuses** (`401` the app's key was revoked; `403` no access to that
  repository, told apart from GitHub's rate limits, which answer `403` or `429` and are
  waited out in GitHub's order (as `retry-after` says when it is
  given; else, when `x-ratelimit-remaining` is `0`, until `x-ratelimit-reset`; else at least
  a minute, longer on each repeat) when any of `retry-after`,
  `x-ratelimit-remaining: 0` or a body naming the secondary rate limit is present; `404` or `410` the repository is gone or has issues off; `422` a label
  missing). Home records the refusal and doesn't retry it on its own. The card says what is
  wrong in the person's terms ("Home's key to GitHub no longer works"; "Home isn't allowed to
  file in server"), and offers "Try again" once the owner has fixed it, or "Send it
  elsewhere", which opens the draft again. Either is a new send for the same move
  (section 1). Each refusal is counted and alerted.
- **Filing is off** (no credential on home): the control is withdrawn, with "Home can't file
  issues yet".

### 10. What retires

Removed by the stories below, in the same PRs that replace them:

- **Part E** of `packages/ui/topik/ROUTINE.md` (all three kinds it files: asks' answers,
  notes, pickups), `@some-ui/video-render`'s `pending.ts` and its `render pending` command,
  and the line in the Reflections scheduled task's prompt about Part E. Moving Part E is a
  change to a recorded call, so it is a story that `moves` it.
- **The mailbox's `pickup` and `picked` folders**: home's `file_pickups` and its picked
  reader (`file_host/src/mailbox/pass.rs`, `PICKUP_SCHEMA`, `PICKED_SCHEMA`), the folders in
  `apps/mailbox`, and server `docs/conveyor.md`'s "Pickup" section. Nothing is lost: every
  answer the routine gave is already a `picked-up` move on home, and each pickup is a copy
  of a move home keeps. The folders' live files are archived as the mailbox archives any
  file, not deleted unread.
- **The `feedback` folder's role in filing**: notes on episodes are filed the same way,
  from the note (#3035, which owns the notes' half). Home still forwards notes to the
  mailbox only if something else reads them; otherwise the folder retires with them.
- **#2973** closes as not planned: nothing routine-driven files pickups. Section 1 narrows
  its case from up to a day to the moment between home's check and GitHub's answer, and in
  that moment the issue is kept with the take, not left stray.
- **`docs/asks.md`, "Answering"**: an answer said on an ask's page becomes a comment on the
  ask when the owner sends it.
- Issues Part E filed so far (#3173, #3174) stay as they are.

**The cutover, so no take is filed by both.** Part E's pickup branch stops before home's
filer turns on: TAKES12's some-ui half (Part E, `pending.ts`) lands first, and the
credential goes on home only after the Reflections run's record shows a run with no Part E
(its first run after that merge). Then, before it files anything, home reads every issue
Part E filed, in both paulgsc/some-ui and paulgsc/server (Part E filed an ask's answer in
the ask's repository), label `from-studio`, `state=all`, no date bound, once, and records
each one whose body holds Part E's line, ``Kept on home as the take `<id>`.``
(`pending.ts`, `filedLine`), as that take's issue. Such a pairing names no send, since
Part E filed from what home heard, not from a move. Step 2's lookups keep matching that
line too, at no cost. A take Part E filed, even one the owner
has since moved back to "Make it an issue", already has its issue, and section 6's step 1
files nothing more.

## Against the assurance grammar

A new operation family in `packages/assurance/src/ledger.json`, **`take-filed`: "A take I
make an issue of gets filed, and says what became of it"**, served by one process with three
segments, split where ownership changes: phone → home (the move and its draft), home →
GitHub (the filer), GitHub → home (the poll), with home → phone read through the existing
takes read. Its objectives:

| ID  | Kind      | Requirement                                                                                                                                                                                                                                                          |
| --- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TF1 | OA2       | Every send is filed, refused with its reason, waits on the owner's draft ("Write its issue"), or is shown as overdue after 24 hours, with an alert (`TakeIssueOverdue` for a send not filed, `TakeIssueUnsettled` for an attempt home can't settle).                 |
| TF2 | OA3       | "Filed as #n" shows only once `take_issue` holds it; a retry, a lost answer or a send elsewhere makes at most one issue or comment (the attempt record, the marker, and one pairing per take). Tolerance: the owner's own "It wasn't made" after 24 hours unchecked. |
| TF3 | OA5       | A take moved off "Make it an issue" before an attempt's check is not filed by that attempt or any later one.                                                                                                                                                         |
| TF4 | OA6       | A poller or filer that stopped reads apart from a quiet one: each pass's start is a metric, and a missed hour alerts.                                                                                                                                                |
| TF5 | OA8       | Every refusal is counted, named and alerted (`TakeIssueRefused`); the app's key and tokens never appear in a record.                                                                                                                                                 |
| TF6 | RE1       | Every GitHub request is counted by operation (file, settle, poll, pulls, closer, daily read), with GitHub's own rate-limit headers kept.                                                                                                                             |
| TF7 | RE2, RE10 | Filing attempts share one budget per request; a backlog of refused requests never delays a new one.                                                                                                                                                                  |
| TF8 | RE7       | An idle pass is at most three conditional lists per repository, each a `304`; the daily read adds one conditional request per paired issue.                                                                                                                          |
| TF9 | RE9       | Growth: one request row per send, two attempt rows (start, outcome) per attempt, a third only when a re-check finds an attempt the owner said wasn't made, one pairing per issue, one state row per change seen; nothing deleted but with the take or the account.   |

Stores: `server:take_issue_request`, `server:take_issue_attempt`, `server:take_issue`,
`server:take_issue_state`. The
`routine-to-home` family loses the pickup's objectives as Part E retires, and the
`mailbox` stores' growth lines lose `pickup` and `picked`. Each of those is a narrowing of a
promise, so the story that makes it carries an amendment naming this direction from the
owner. The new route module is placed in `take-filed` before the route snapshot arrives
(CLAUDE.md, "Operational assurance"), and the new tables are placed only once their server
PR is ready to merge.

## What the owner decided

The three asks are answered and closed (2026-11-18):

- #3199 (C590): home files as its own GitHub App.
- #3200 (C591): the repository is picked in the draft, from the app's installed
  repositories.
- #3201 (C592): the draft starts empty apart from what the take was for.

The filer stays off until the app's key is on home.

## Stories

Sub-issues of #3029, in order. Notes on episodes use the same filer from the note; that half
stays with #3035.

1. **TAKES6** (#3202, some-ui): the `take-filed` family in the ledger and its process.
2. **TAKES7** (#3203, server): the four tables, the draft on the move, and the takes read
   carrying each take's issues.
3. **TAKES8** (#3204, some-ui): the "Make it an issue" sheet, the conveyor's new words and the
   card's status words.
4. **TAKES9** (#3205, server): the filer. Waits on #3199 and #3200.
5. **TAKES10** (#3206, server): the status poll.
6. **TAKES11** (#3207, some-ui): the "Takes with issues" page.
7. **TAKES12** (#3208, both): what retires. Its some-ui half (Part E) lands before the
   credential goes on home; its server half (the pickup folders) after the filer runs.
8. **TAKES13** (#3210, server): the conveyor and the library widened to Rust Rounds, interview
   takes and idea answers.
9. **TAKES14** (#3211, some-ui): the Rust Rounds and Interview weeks compartments.

## Calls

- **C585:** "Make it an issue" is the conveyor's ready-for-pickup move under new words, one
  entrance for every kind of take, filed by home. Moves C298 (the routine's known limit).
- **C586:** the owner reviews and edits the issue's draft on the phone before home sends it;
  home's LAN address is never in the issue.
- **C587:** home learns status by polling every 15 minutes, with the token: at most three
  conditional lists per repository to fixed URLs, a daily conditional read of each paired
  issue, and one GraphQL read of what closed an issue.
- **C588:** an answer to an ask is a comment on the ask, not a new issue. Moves C297, whose
  other half, the routine filing pickups in some-ui, C585 replaces.
- **C589:** the status words on a take's card, and "archived" as a closed issue's fold.

The owner's (2026-11-18):

- **C590:** home files as its own GitHub App.
- **C591:** the repository is picked in the draft, from the app's installed repositories.
- **C592:** the draft starts empty apart from what the take was for. Moves C586, whose
  draft started from what home heard.
