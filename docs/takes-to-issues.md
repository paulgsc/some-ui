# Takes that become issues: home files them, and each take follows its issue

The design of TAKES4 as the owner reshaped it on 2026-11-18 (epic #3029, the comment
"Owner's direction, 2026-11-18 (night)"). Design only: nothing here is built yet, and the
stories at the end build it. Checked against `main` of both repositories on 2026-11-19
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
`take_issue_request`, keyed by the take and the move's `seq`, because a move is never
updated and the draft is longer than a move's 280-character comment.

Every kind of take reaches the same entrance. Today only `studio` takes that are no idea's
answer are on the conveyor; widening it to `rust-round` and `interview` takes (and idea answers, and any kind added later) is a
migration that widens which takes `voice_repo::conveyor::advance` (server `crates/db/voice/src/conveyor.rs`) accepts, the same rebuild
`20261113002100_add_interview_to_voice_note` did for `voice_note`. Takes then shows a
compartment for each: Rust Rounds and Interview weeks, beside the five there are now.

Withdrawing before home files (#2973's case) can't file: home files within a minute of the
move, and in the same read that starts the filing it checks that the take's newest move is
still the `ready-for-pickup` move the request names. A take moved on in that minute is not
filed. If the move lands after the issue was created, the issue is still kept with the take
(section 5); the take stays where the owner put it.

### 2. Home's GitHub credential and its least scope

Home needs to create issues, add labels at creation, comment (an ask's answer, section 3),
and read issue state. On GitHub that is **Issues: read and write**, plus **Metadata: read**
(which every token carries), on the repositories home files into, and nothing else: no
contents, no pull requests, no workflows, no administration.

Two forms hold that scope; the owner chooses (ask, below):

- **A fine-grained personal access token**, owned by the owner, limited to the named
  repositories with those two permissions. The issues read as the owner's own, which they
  are. It has an expiry the owner sets, so home says how long it has left.
- **A GitHub App** installed on those repositories with the same permissions. Home holds
  its private key and mints an hour-long token for each pass. The issues read as the app's
  ("… [bot]"), apart from the owner's. More set-up, no expiry.

Either way the secret lives in `deploy/home/file_host.sops.env` beside `MAILBOX_TOKEN`
(the token, or the app's id and key file), encrypted to the owner's key. Only the owner can
add it, since only they can encrypt with sops. Home's config treats its absence as "filing
is off": the phone then withdraws the "Make it an issue" control and says why, in the
person's terms ("Home can't file issues yet"). The token is never sent to the phone, never
logged (`redacted.rs`), and never reaches the mailbox.

### 3. Which repository, and which labels

Each take kind has a default repository, and the draft lets the owner pick another from
the repositories the credential covers. The proposed defaults (ask, below):

| Take for                             | Files into                                                      | Why                                    |
| ------------------------------------ | --------------------------------------------------------------- | -------------------------------------- |
| A note on an episode, on the video   | some-ui                                                         | templates and fill routines live there |
| A note on an episode, on the content | the repository the content is about; some-ui if unsure          | #3035's second kind                    |
| A scene                              | some-ui                                                         | Studio and the Build Journal           |
| An idea                              | some-ui                                                         | Studio                                 |
| An answer to an ask                  | **a comment on the ask itself**, in the ask's repository (C588) |                                        |
| Rust Rounds                          | some-ui                                                         | the Rust Rounds feed and essay         |
| An interview week                    | some-ui                                                         | the interview feed                     |
| Recorded here                        | some-ui                                                         |                                        |

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

- **Title:** the first sentence of what home heard, cut to 80 characters, or what the owner
  types.
- **Body:** what home heard, as the owner left it on the sheet. Then the context, from the
  same join Takes already makes (`take-about`):
  - what the take was for, in the kind's own words: "A note on the call, week of Nov 6, at
    3:12 (Pacing, The voice)"; "Scene 4 of _Home deploy, part 1_"; "An answer to #2545";
    "Rust Rounds, 2026, week 46";
  - when it was said;
  - how home heard it (its verdict: heard, unclear, nothing said), so a session knows when
    to listen instead;
  - the owner's labels and comment from the conveyor, as words;
  - the link back: the take's id and where it is ("Studio › Takes on home, take
    `<id>`"). Home's address is LAN-only and is never written into a public issue; the
    coordinator asks the owner to play the take when it needs to.
- **Last line:** a fixed marker, `<!-- take <note> <seq> -->`, which is how home recognises
  its own issue (section 6).

Never sent: the audio, the transcript's words beyond what the owner left in the draft, and
anything about another take. Since some-ui and paulgsc/server are public, what the owner
sends is published. Whether the draft starts from what home heard at all, or starts empty,
is the owner's call (ask, below).

A take home hasn't heard yet can still be sent: the draft says "Home hasn't heard this take
yet" in place of the words, and the owner types the title.

### 5. Home keeps the issue with the take (append-only)

Three new tables on home, each append-only (an UPDATE aborts), each leaving with the
account and with its take when the owner deletes it for good from My data (whose receipt
then says the issue link went; the issue itself stays on GitHub):

- `take_issue_request`: the owner's word. Take, `seq`, the repository chosen, title, body,
  when it was asked.
- `take_issue`: the pairing. Take, `seq`, `<owner>/<repo>#<n>` (or the ask and the
  comment's id), when it was filed. A take may hold more than one: a note that goes to two
  places, or a take filed again after its first issue closed.
- `take_issue_state`: what home has seen of each issue. Issue, when seen, state
  (open, closed), why it closed (`completed`, `not_planned`, `duplicate`), the pull requests
  that closed or reference it, and the ETag. A row is appended only when something changed.

On success home also appends the conveyor move to `picked-up` with the issue, if the take's
newest move is still the request's. That is the move Part E's answer makes today.

### 6. Filing, once

Home's filer is a worker beside the mailbox pass, woken by the move and on a timer.

1. Read the request and check the take is still at that move (section 1).
2. Before creating, list the repository's open issues labelled `from-studio` created since
   the request and look for its marker. Found: record it (a crash after an earlier create).
   This is what keeps a retry to one issue, since GitHub's create is not idempotent.
3. Create the issue, then record `take_issue` and the move in one transaction.
4. A refusal is recorded against the request, with its reason, append-only, and shown to the
   owner (section 9).

### 7. How home learns the status: a poll (C587)

A webhook can't reach home: home is on the LAN and makes only outbound requests, as
`call_weeks.rs` says. So home polls.

Each pass (every 15 minutes) makes one request per repository home has filed into:
`GET /repos/<owner>/<repo>/issues?labels=from-studio&state=all&since=<last seen>`, with
`If-None-Match`. A quiet pass is one `304` per repository, which GitHub doesn't count
against the rate limit. For an issue that changed, home appends a `take_issue_state` row.
Which pull requests are working on or closed an issue come from the issue's timeline,
read only for an issue whose state changed in that pass. An ask's comment follows the
ask's own state the same way, by number, since the ask carries no `from-studio` label.

Issues are public, so the poll could go without the token, but GitHub allows only 60
unauthenticated requests an hour from an address. With the token it has 5,000, and the
token already reads issues, so the poll uses it.

### 8. What the phone shows

**On a take's card** (`TakeLibrary`, beside the place and station pills):

| The issue                                                      | The card says                                     |
| -------------------------------------------------------------- | ------------------------------------------------- |
| asked, not yet filed                                           | Home is filing this                               |
| open, no pull request yet                                      | Filed as #n · Waiting for a session               |
| open, a pull request references it                             | Filed as #n · Being worked in PR #m               |
| closed as completed                                            | Filed as #n · Done (in PR #m, when one closed it) |
| closed as not planned or duplicate                             | Filed as #n · Closed without a change             |
| home can't see it any more (deleted, or the token lost access) | Filed as #n · Home can't see it any more          |

The words live in one pure table with its test (`lib/library/words.ts` for the card, beside
`take-conveyor/words.ts`), and no state name, status code or "open/closed" reaches the
screen (CLAUDE.md, "State in the person's terms"). `#n` opens the issue on GitHub. A take
filed twice shows both, newest first.

**"Takes with issues"**, a page of its own: `journal/takes/filed`, reached from a tile on
Takes' first page beside the kind tiles. It lists every take that has an issue, under the
same counted chips as a kind's page, but the chips are the issue's status (Waiting for a
session, Being worked, Done, Closed without a change), and each card still says what it was
for. **Archived** is a closed issue's take: it folds under the rest, as canned takes do on a
kind's page, and leaves "Takes with issues" counts of what is still open. The take itself is
never deleted or moved off the record; "archived" is how the page groups it.

The conveyor's words change with it (`take-conveyor/words.ts`): "Ready for pickup" becomes
"Make it an issue", and "Picked up" becomes "Has an issue".

### 9. Offline, and when GitHub refuses

- **The phone can't reach home.** The move waits in the phone's own send queue, as every
  move does today, and the card says "Waiting to reach home".
- **Home can't reach GitHub** (no network, GitHub down, `5xx`, rate limited). The request
  stays, home retries with backoff within one budget (RE2), and the card says "Home is
  filing this". After 24 hours it says "Home hasn't been able to file this since <when>",
  and an alert reaches the owner.
- **GitHub refuses** (`401` the token expired or was revoked; `403` no access to that
  repository; `404` or `410` the repository is gone or has issues off; `422` a label
  missing). Home records the refusal and doesn't retry it on its own. The card says what is
  wrong in the person's terms ("Home's key to GitHub has run out"; "Home isn't allowed to
  file in server"), and offers "Try again" once the owner has fixed it, or "Send it
  elsewhere", which opens the draft again. Each refusal is counted and alerted.
- **The token nears its expiry** (personal token only): home says so two weeks ahead, in
  the alert and on Settings' home status.
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
- **#2973** closes as not planned: nothing routine-driven files pickups, and section 1 holds
  its case.
- **`docs/asks.md`, "Answering"**: an answer said on an ask's page becomes a comment on the
  ask when the owner sends it.
- Issues Part E filed so far (#3173, #3174) stay as they are.

## Against the assurance grammar

A new operation family in `packages/assurance/src/ledger.json`, **`take-filed`: "A take I
make an issue of gets filed, and says what became of it"**, served by one process with three
segments, split where ownership changes: phone → home (the move and its draft), home →
GitHub (the filer), GitHub → home (the poll), with home → phone read through the existing
takes read. Its objectives:

| ID  | Kind      | Requirement                                                                                                                               |
| --- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| TF1 | OA2       | Every request is filed, refused with its reason, or shown as overdue after 24 hours.                                                      |
| TF2 | OA3       | "Filed as #n" shows only once `take_issue` holds it; a retry or replay makes at most one issue (the marker).                              |
| TF3 | OA4       | A take filed into two places reports each place's outcome as itself.                                                                      |
| TF4 | OA6       | A poller or filer that stopped reads apart from a quiet one: each pass's start is a metric, and a missed hour alerts.                     |
| TF5 | OA8       | Every refusal is counted, named and alerted (`TakeIssueRefused`, `TakeIssueTokenExpiring`); the token never appears in a record.          |
| TF6 | RE1       | Every GitHub request is counted by operation (file, find, poll, timeline), with GitHub's own rate-limit headers kept.                     |
| TF7 | RE2, RE10 | Filing attempts share one budget per request; a backlog of refused requests never delays a new one.                                       |
| TF8 | RE7       | An idle poll is one conditional request per repository per pass.                                                                          |
| TF9 | RE9       | Growth: one request row per send, one pairing per issue, one state row per change seen; nothing deleted but with the take or the account. |

Stores: `server:take_issue_request`, `server:take_issue`, `server:take_issue_state`. The
`routine-to-home` family loses the pickup's objectives as Part E retires, and the
`mailbox` stores' growth lines lose `pickup` and `picked`. Each of those is a narrowing of a
promise, so the story that makes it carries an amendment naming this direction from the
owner. The new route module is placed in `take-filed` before the route snapshot arrives
(CLAUDE.md, "Operational assurance"), and the new tables are placed only once their server
PR is ready to merge.

## What waits on the owner

Filed as `ask` issues (`docs/asks.md`):

- #3199: who owns home's GitHub credential, and in which form: a fine-grained token of theirs, or a
  GitHub App.
- #3200: which repositories home may file into (this is the credential's scope), and each kind's
  default.
- #3201: whether an issue's draft starts from what home heard, or starts empty, given the issue is
  public.

Until they answer, the stories that need only the shape (the tables, the phone's sheet and
page behind a switch that stays off) can go ahead; the filer stays off until a credential is
on home.

## Calls

- **C585:** "Make it an issue" is the conveyor's ready-for-pickup move under new words, one
  entrance for every kind of take.
- **C586:** the owner reviews and edits the issue's draft on the phone before home sends it;
  home's LAN address is never in the issue.
- **C587:** home learns status by polling one conditional list per repository every 15
  minutes, with the token.
- **C588:** an answer to an ask is a comment on the ask, not a new issue.
- **C589:** the status words on a take's card, and "archived" as a closed issue's fold.
