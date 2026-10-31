# The weekly LeetType review

A scheduled task runs this every Sunday at 18:47 Pacific, in a fresh session
with the Google Drive connector and a checkout of `paulgsc/some-ui`. It reads
how the week's LeetType sessions went (the session logs home leaves in the
mailbox) and what the owner said in their spoken answers (the takes the
phone's study-context export leaves in Drive), judges both against the
session files they answer, and writes one assessment to Drive: what the owner
can now explain, what they can't yet, which readings to place, and what moved
since the last one.

The design and every decision behind it are in some-ui#1927: the design
(2026-10-19), the defaults (2026-10-20), the mailbox update (2026-10-24) and
the owner's yes to scheduling (2026-10-30). Epic some-ui#2025 holds the rest
of LeetType's mailbox work.

The run writes one Markdown file to Drive's `LeetType/reviews/` (§5), copies
answers into `LeetType/answers/` where the SOP asks (§1), and, from
2026-11-30 on, may put new session files into the mailbox's `leetype` folder
(§6). It writes nothing else anywhere: no GitHub issue, PR or comment, no
commit, nothing to home, no email (§7).

The scheduled task's prompt only points at this file, so a change to the run
is a reviewed change here. The canon it judges by is
`docs/canon/complexity-witness-canon.typ`; where this file and the canon
disagree, the canon wins and this file is the bug. Where this file and the
code it names disagree (a schema, `summariesOf`, the session-file lint), the
code wins.

## 0. Before anything

1. **The Drive SOP.** Find the Google Doc titled `README — Drive SOP` in My
   Drive (its parent is My Drive's root; ignore copies in `Archive/`) and read
   it before any Drive write. It is the rule for where files go and what they
   are named, and wins over this file on that. Its `LeetType/` and
   `Study ledger/` sections describe what this run reads and writes, and carry
   the folder ids. Check every Drive result's owner is
   paulgathondudev@gmail.com; if not, stop.

   - If the SOP has no `LeetType/reviews/` section, or the folder doesn't
     exist, write nothing to Drive this run and say so in the summary (§8).
     Don't create the folder: SOP rule 2 gives a folder its section first, and
     both are the owner's.

2. **The repo.** In the checkout, on `origin/main`
   (`git fetch origin main && git checkout --detach origin/main`), run
   `pnpm install` from the repo root. Then read this file;
   `packages/ui/leetype/src/types/session-file.ts` (what a session file
   holds: rounds, their `rule` and `cites`, readings, record screens with
   their `prompt` and `rubric`); `packages/ui/leetype/src/lib/leetype/session-log/model.ts`
   (the events, and `summariesOf`, the funnel this run reads); and
   `apps/mailbox/README.md` ("API" and "What a put must satisfy"). From the
   canon, read Def. 1.9, Rem. 7.4, Def. 9.4, Def. 9.5, Prop. 9.4, Rem. 9.5,
   Rem. 10.3 and Rem. 10.4: §2 and §3 judge by them.

3. **The mailbox.** `JOBS_MAILBOX_URL` (no trailing slash) and
   `JOBS_MAILBOX_TOKEN` are set in this environment; the token is the
   mailbox's `routine` role. Use only `curl` with an
   `Authorization: Bearer $JOBS_MAILBOX_TOKEN` header, never print either
   value, and don't turn on shell tracing (`set -x`). If either is unset or
   empty, skip every mailbox step, judge from Drive alone, and say so in the
   summary. Otherwise check it once:

   ```sh
   curl -sS --max-time 30 -o /dev/null -w '%{http_code}\n' \
     -H "Authorization: Bearer $JOBS_MAILBOX_TOKEN" \
     "$JOBS_MAILBOX_URL/v1/leetype-log/items?limit=1"
   ```

   `200` means it is usable. Anything else (`401` a wrong token, `404` a
   mailbox without the folder, `000` no network): skip every mailbox step,
   judge from Drive alone, and say so in the summary. A mailbox problem never
   stops the run.

4. **Where the last run stopped.** A scheduled session keeps no files between
   runs, so the run's place is kept in the reviews themselves. List
   `LeetType/reviews/` and read the front matter (§5) of every `review-*.md`
   in it:
   - `logSeq`: the highest `logSeq` across them. Logs with a higher `seq` are
     new. With no review yet, it is `0`.
   - `answersThrough`: the latest `answersThrough` across them. Export folders
     dated on or after it are read. With no review yet, every folder is.
   - `answers`: the union of their `answers` lists. An answer whose `id` is in
     it was judged before.
   - `unheard`: the `unheard` list of the review created last (Drive's
     `createdTime`). Those answers are tried again.
   - `sessions`: the union of their `sessions` lists, each a
     `log-<session>[.r<n>].json` name, so a later copy of a session is told
     apart from one already read.

## 1. Inputs

### The session logs (mailbox `leetype-log`)

Home puts each finished session's log into `leetype-log` (some-ui#2027).
Each file is `log-<session>.json`, or `log-<session>.r<n>.json` for a later
copy of a session home holds more of, and its body is
`{"schema":"some-ui.leetype-log/1","session","file","events":[…]}`: every
event of the session in its home form (`HomeEvent` in
`packages/ui/leetype/src/lib/leetype/session-log/home.ts`). A spoken answer
arrives without its ticks, and nothing in the log is audio, said or typed.

List what is new, paged until `items` is empty:

```sh
curl -sS --max-time 30 -H "Authorization: Bearer $JOBS_MAILBOX_TOKEN" \
  "$JOBS_MAILBOX_URL/v1/leetype-log/items?after=<seq>&limit=50"
```

starting from `logSeq` and setting `after` to the highest `seq` in each
answer, never `seq + 1` (`seq` has gaps). An answer that isn't
`{"items":[…]}` means the mailbox failed: treat it as skipped (§0.3). Then:

- **For each item,** fetch it with
  `GET "$JOBS_MAILBOX_URL/v1/leetype-log/items/<name>"`, check the bytes'
  SHA-256 against the listing's `sha256`, check that `schema` is
  `some-ui.leetype-log/1` and that the name carries `session`. A file that
  fails any of these is a record problem (§5): name it and leave it out.
- **For a session with several copies,** the highest `.r<n>` (no suffix is
  `r1`) is the session; a copy whose session a review already read is read
  again in full, and what moved since is what its new events add.
- **Archived:** `GET "$JOBS_MAILBOX_URL/v1/leetype-log/archived?after=<logSeq>&limit=50"`
  lists files that went home before any run read them (live 30 days unread).
  Ask each back with `PUT "$JOBS_MAILBOX_URL/v1/leetype-log/wanted/<name>"`
  (no body); home puts it back within 15 minutes under a new `seq`, so the
  next run reads it. Name them in the summary.
- `logSeq` for this run's review is the highest `seq` listed, or the previous
  `logSeq` if nothing was, or if the mailbox was skipped.

Until home hands logs out (some-ui#2027), the folder is empty. Then, and for a
session no log names, the export's `leetypeSessions` (below) is the same
funnel, computed on the phone from its log by `summariesOf`: read it, and say
in the review that it was the source.

### The answers and takes (Drive)

The phone's study-context export lands in
`Study ledger/study-context/<YYYY-MM-DD>/`, and its LeetType answers are kept
for good in `LeetType/answers/<YYYY-MM-DD>/` (the SOP's section on it; the
owner chose this on 2026-10-20 so the keep-3 rule on study-context never
loses one). Read every folder of either dated on or after `answersThrough`.
From each folder's `context.json`:

- `leetypeAnswers`: per answer its `id`, the session `file` and record
  `screen`, the one-sentence `prompt`, the `rubric` shown after answering, the
  learner's `ticks`, and either `typed` or the take's audio file named in
  `audio` (`leetype-take-…`, beside `context.json`). A rubric point is text,
  or `{ "text", "covers" }` once a file says which rounds it states: judge its
  `text`.
- `leetypeTakes`: every take kept, with or without an answer noted. A take
  with no answer has no ticks or rubric: transcribe it and judge it against
  its record screen's rubric in the session file.
- `leetypeSessions`: the per-session funnel (above), used only where no log
  covers the session.

An answer is new when its `id` is in no review's `answers` list; the same
answer shows up in several exports until the phone lets it go, so judge it
once. Add back each `unheard` answer from the last review.

**Copy before it can go.** If the SOP's `LeetType/answers/` section asks it,
copy each study-context folder's LeetType answers and their audio, untouched
(`copy_file`, same names), into `LeetType/answers/<that folder's date>/`
when they are not already there, before reading them. Never move, rename or
trash the originals: the SOP's keep-3 rule is someone else's step.

**Hearing a take.** Transcribe each take's audio in this session only: for
example `pip install faster-whisper` and its `base.en` model on CPU, run over
the downloaded file in a scratch directory outside the checkout. Never send
the audio or its transcript anywhere, and never save a transcript to Drive or
the mailbox. A take you can't transcribe (no model installs, the file is
gone, the audio is unreadable) is `unheard`: list its answer's `id` in this
review's `unheard`, and the next run tries it again. Once its audio is no
longer in Drive at all, name it in the review as one that can't be judged
and drop it from the list.

### The session files they answer

Each answer and each log names its session `file`. Read it from the
mailbox's `leetype` folder (`GET "$JOBS_MAILBOX_URL/v1/leetype/items/<name>"`;
the body is `{"schema":"some-ui.leetype-session/1","file":<the session file>}`)
or Drive's `LeetType/sessions/`. A name held in both with different content
is a record problem (§5). From the file, for each round: its `rule` (an `M`
or `A` id, Rem. 7.4), the reading it `cites` (Rem. 10.3), its options and
their readings; for each record screen, its `prompt` and `rubric`.

### Earlier reviews

Read the newest review in `LeetType/reviews/` in full, so this one can say
what moved.

### Nothing new: end

If no log has a `seq` above `logSeq`, no answer is new, and no `unheard`
answer can now be heard, write nothing and end with the one-line summary
(§8). A week with no LeetType is not an error.

## 2. What it judges

All of this is judged, never counted from what the learner claimed.

### The spoken answers (Def. 9.5)

For each answer (a transcript, or the `typed` text), go through its rubric
point by point:

- **said**: the point is in the answer, with the quote that says it;
- **partly**: some of it is, with the quote, and what is missing;
- **missing**: it isn't there.

**The ticks are the learner's claim, never the grade** (Rem. 10.4). Where a
point is ticked and the answer doesn't support it, or unticked and the answer
does, note the gap. Never count a tick toward "can explain now". A spoken
answer's `strong` in the log is computed from ticks, so it is the same claim.

### How each round went (Prop. 9.4, Def. 9.4)

From the log's events (or `leetypeSessions`), per round, its funnel:

- **the struggle:** the first pick incorrect, the abstention, or a correct
  pick slower than twice the learner's median (Def. 9.4); each kept as what
  it was, never folded together;
- **the placement:** the readings placed after it, and what was done with each
  (opened, saved, read, skipped);
- **the return:** each return played after it, asked for or offered, and its
  answer;
- **assisted or solved** (LTY1, some-ui#2345): a return is _assisted_ when,
  since the round's last struggle, a take's rubric covering the round was
  shown (`rubric-shown`) or the round's worked confirmation was taken
  (`confirmation-taken`). An assisted return is an observation of the answer,
  not an unassisted commitment (Rem. 9.5, Axiom 9.2): it solves nothing, even
  where the phone's ledger unparks the round. A round is _solved_ by a
  correct, unhurried pick or unassisted return since its last struggle.
  `summariesOf` computes this, and each of its `returned` entries carries
  `assisted`; when your reading of the events and `summariesOf` disagree,
  `summariesOf` wins and the gap goes in the review as an app problem.

Report per round: struggled or not, placed what, read or not, returned how,
assisted or solved. A return never counts as a second instance of its rule
(Rem. 10.4: it is the same mechanism by construction); a return answered in a
later session is evidence of retention.

## 3. What it concludes

Group the answers and rounds by the rule their round names (`M1`–`M8`,
`A1`–`A10`, Rem. 7.4), and for each rule write:

- **Can explain now:** rubric points said clearly, each with the quote, and
  rounds solved unassisted.
- **Can't yet:** what is missing or only partly said, and rounds still
  parked or solved only with help. For each, the passage that answers it: the
  round's `cites` reading, or another source on the brief's reading list, by
  source, section and page.
- **What moved:** against the newest earlier review, which points went from
  missing or partly to said, and which rounds from parked or assisted to
  solved.

Then, across the rules:

- **Readings to place:** at most three, each with where to read (source,
  section, page or minutes) and a primer of one or two lines that says what
  to look for, never the answer (Prop. 9.4, Rem. 10.3).
- **Ticks against answers:** each gap from §2, one line each.

## 4. Limits on what it says

- The takes are the owner's own voice. They stay in Drive. Quote an answer
  only as far as a rubric point needs, never whole.
- Something wrong with the app (a screen that misbehaved, a log that doesn't
  add up, an event a reader ignores, a rubric that gives a round away) goes in
  the review under **App problems**, in plain words, for the owner to file.
  This run files nothing.

## 5. The review file

One Markdown file in `LeetType/reviews/`, named for the ISO week of the run's
Pacific date:

```sh
python3 -c "from datetime import datetime; from zoneinfo import ZoneInfo; y, w, _ = datetime.now(ZoneInfo('America/Los_Angeles')).isocalendar(); print(f'review-{y}-W{w:02d}.md')"
```

**Append-only.** A review is never edited, replaced, renamed or trashed. If
the week's name is already taken (a second run that week), or this run
corrects an earlier week's review, the file is `review-<YYYY>-W<ww>-r<n>.md`
with the next `n` from 2, complete in itself, saying in its first line what it
supersedes and why.

It opens with this front matter, which the next run reads (§0.4):

```yaml
---
week: 2026-W45
supersedes: null
logSeq: 0
answersThrough: 2026-11-08
answers: []
sessions: []
unheard: []
---
```

- `week`: the ISO week the file is named for.
- `supersedes`: the file name this one corrects, or `null`.
- `logSeq`: §1's: the highest `leetype-log` `seq` read, or the previous one.
- `answersThrough`: the latest export folder date read (`YYYY-MM-DD`), or the
  previous one.
- `answers`: the `id` of every answer this file judged.
- `sessions`: every log file name this file read.
- `unheard`: answer `id`s whose take couldn't be heard (§1).

Then the sections, in this order: **Sources** (the logs, export folders and
session files read, by name, and what was skipped and why), **How the
sessions went** (§2, per session and round), **By rule** (§3, per rule),
**Readings to place**, **Ticks against answers**, **App problems**, and
**Record problems** (a file that failed its checks, two copies that differ,
an answer that can't be judged). An empty section says "None."

Upload it with `contentMimeType` `text/markdown` and
`disableConversionToGoogleType` true. Confirm the result's mimeType is
`text/markdown`, its owner is paulgathondudev@gmail.com, and its size equals
your local file's byte count.

## 6. New session files: none before 2026-11-30

The first month writes the assessment only (owner, 2026-10-20; the month runs
from the 2026-10-30 yes). Before 2026-11-30 (Pacific), skip this step.

From then on, a run may write at most two new session files, for what §3
says the owner can't yet explain. They go to the mailbox's `leetype` folder
only, never to Drive: home serves them to the phone (some-ui#2026), and home is the
store. **A put is permanent:** a name holds its bytes for good, so each file
clears all of these first, in a scratch directory outside the checkout:

1. It is named `t<thread>-<NN>-<slug>.json`, the next `NN` of its thread
   unused in both Drive's `LeetType/sessions/` and the mailbox's `leetype`
   folder, live and archived.
2. It passes the lint with no findings. Build the package's dependencies
   once (`npx turbo run build --filter="@some-ui/leetype^..."`), then run
   `pnpm --filter @some-ui/leetype lint:session-file <absolute path>`. Every
   finding is fixed and the lint re-run; unknown `M`/`A` ids fail it.
3. Every passage is checked against its source document, not from memory
   (Rem. 10.3).
4. Every feedback line, passage and rubric is reviewed by a subagent playing
   the author-expert, story 6.2's pass, repeated for each file; the file
   changes until that review finds nothing.

Then put it, wrapped, as one scratch file built with `node` or `jq`:
`{"schema":"some-ui.leetype-session/1","file":<the session file>}`.

```sh
curl -sS --max-time 30 -X PUT -H "Authorization: Bearer $JOBS_MAILBOX_TOKEN" \
  -H "Content-Type: application/json" --data-binary @<file> -w '\n%{http_code}\n' \
  "$JOBS_MAILBOX_URL/v1/leetype/items/<name>"
```

`201` (added) and `200` (unchanged) are success. `409`: the name is taken;
take the next `NN` and put again. `422` names why it was refused: fix it if
the reason is in your file, else say so in the summary. Anything else: say so
and don't retry. Name each file put in the review's **Sources**.

## 7. What it may and may not touch

- **Writes only:** new files in Drive's `LeetType/reviews/` (§5); copies in
  `LeetType/answers/<date>/` where the SOP asks (§1); from 2026-11-30, new
  names in the mailbox's `leetype` folder (§6); and asks for archived
  `leetype-log` files back (§1).
- **Never** edits, replaces, renames, moves or trashes anything in Drive: no
  session file, no study-context export, nothing in `Study ledger/`, no take,
  and no review, its own included. Triage `Inbox/` per the SOP if it holds
  anything.
- **Never** puts a session file into Drive's `LeetType/sessions/`, and never
  puts to any mailbox folder but `leetype`.
- **Never** writes outside Drive and the mailbox: no GitHub issue, PR,
  comment or commit, nothing to home, no email.
- **Never** uploads, sends or saves a take's audio or its transcript anywhere.

## 8. Summary

End with a short summary, which the push notification carries: the review
file written (name, and its `logSeq` and `answersThrough`), or that nothing
was new; how many logs, answers and takes it read; the three readings placed;
each session file put and its status code; anything skipped and why (the
mailbox, the SOP section, an unheard take, an archived log asked back); and
the app problems the review names, one line each. If nothing was new, say so
in one line.
