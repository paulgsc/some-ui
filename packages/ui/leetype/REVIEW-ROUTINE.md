# The weekly LeetType review

A scheduled task runs this every Sunday at 18:47 Pacific, in a fresh session
with the Google Drive connector, the Drive service account
(`DRIVE_SA_KEY_B64`) and a checkout of `paulgsc/some-ui`. It reads how the
week's LeetType sessions went (the session logs home leaves in the mailbox)
and what the owner said in their spoken answers (the takes the phone's
study-context export leaves in Drive), judges both against the session files
they answer, and writes one assessment to Drive: what the owner can now
explain, what they can't yet, which readings to place, and what moved since
the last one.

The design and every decision behind it are in some-ui#1927: the design
(2026-10-19), the defaults (2026-10-20), the mailbox update (2026-10-24) and
the owner's yes to scheduling (2026-10-30). Epic some-ui#2025 holds the rest
of LeetType's mailbox work.

What the run writes, all of it:

- one new Markdown file in Drive's `LeetType/reviews/` (§5);
- copies of the week's LeetType exports into `LeetType/answers/<date>/` (§1);
- the moves the SOP's `Inbox/` triage asks for (§7);
- asks for archived `leetype-log` files back (`wanted`, §1);
- after the first four weeks' reviews, at most two new session files in the
  mailbox's `leetype` folder (§6).

Nothing else, anywhere: no GitHub issue, PR or comment, no commit, nothing to
home, no email (§7).

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
     exist, write no review this run and say so in the summary (§8). Don't
     create the folder: SOP rule 2 gives a folder its section first, and both
     are the owner's. The copy into `LeetType/answers/` (§1) still happens.

2. **The repo.** In the checkout, on `origin/main`
   (`git fetch origin main && git checkout --detach origin/main`), run
   `pnpm install` from the repo root, then build the LeetType package's
   dependencies once: `npx turbo run build --filter="@some-ui/leetype^..."`
   (§2 and §6 run its code). Then read this file;
   `packages/ui/leetype/src/types/session-file.ts` (what a session file
   holds: rounds, their `rule` and `cites`, reading screens, record screens
   with their `prompt` and `rubric`);
   `packages/ui/leetype/src/lib/leetype/session-log/model.ts` (the events,
   and `summariesOf`, which computes the funnel this run reports); and
   `apps/mailbox/README.md` ("API" and "What a put must satisfy"). From the
   canon, read Def. 1.9, Rem. 7.4, Axiom 9.2, Def. 9.4, Def. 9.5, Prop. 9.4,
   Rem. 9.5, Rem. 10.3 and Rem. 10.4: §2 and §3 judge by them.

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

4. **The takes' audio.** Audio comes out of Drive through the session's
   service account (`DRIVE_SA_KEY_B64`, read-only), byte for byte, checked
   against Drive's `md5Checksum`; never through the connector's base64 (§1,
   "Hearing a take"). **Owner prerequisite:** the service account has reader
   access to `Study ledger/study-context/` and `LeetType/answers/`. If
   `DRIVE_SA_KEY_B64` is unset, or the account can't see a take, the take is
   `unheard` (§1), and the summary says which access is missing. Never print
   the key.

5. **Where the last run stopped.** A scheduled session keeps no files between
   runs, so the run's place is kept in the reviews themselves. List
   `LeetType/reviews/` and read the front matter (§5) of every `review-*.md`
   in it:
   - `logSeq`: the highest `logSeq` across them. Logs with a higher `seq` are
     new. With no review yet, it is `0`.
   - `answersThrough`: the latest `answersThrough` across them. Export folders
     dated on or after it are read. With no review yet, every folder is.
   - `answers` and `takes`: the union of their lists. An answer whose `id`, or
     an answerless take whose take `id`, is in them was judged before.
   - `sessions`: the union of their `sessions` entries, each a log name
     (`log-<session>[.r<n>].json`) and the session `file` it is for. A log
     whose name is in it is never counted as new, and it is how an archived
     log is found again (§1).
   - `sessionsDigest`: from the review of the latest ISO week, its newest
     revision (the highest `-r<n>`, no suffix being the first; between two
     files of the same name, the later `createdTime`).
   - `unheard`: the union of the latest week's files' `unheard`, less any id
     a review's `answers` or `takes` holds.
   - **How many weeks:** the number of distinct weeks the files are named for
     (a week's revisions count once). §6 reads it.

## 1. Inputs

### The session logs (mailbox `leetype-log`)

Home puts each finished session's log into `leetype-log` (some-ui#2027). Each
file is `log-<session>.json`, or `log-<session>.r<n>.json` for a later copy
of a session home holds more of, and its body is
`{"schema":"some-ui.leetype-log/1","session","file","events":[…]}`: every
event of the session in its home form (`HomeEvent` in
`packages/ui/leetype/src/lib/leetype/session-log/home.ts`). A spoken answer
arrives without its ticks, and nothing in the log is audio, said or typed.

List the folder from the start, paged until `items` is empty:

```sh
curl -sS --max-time 30 -H "Authorization: Bearer $JOBS_MAILBOX_TOKEN" \
  "$JOBS_MAILBOX_URL/v1/leetype-log/items?after=<seq>&limit=50"
```

starting from `after=0` and setting `after` to the highest `seq` in each
answer, never `seq + 1` (`seq` has gaps). An answer that isn't
`{"items":[…]}` means the mailbox failed: treat it as skipped (§0.3). List
`GET "$JOBS_MAILBOX_URL/v1/leetype-log/archived?after=0&limit=50"` the same
way. Then:

- **New logs** are the items, live or archived, with a `seq` above `logSeq`
  whose name is in no review's `sessions`. An archived one (its ask went
  unanswered, or the mailbox was down for 30 days) is asked back as below and
  held until it is.
- **Each log you read,** fetch with
  `GET "$JOBS_MAILBOX_URL/v1/leetype-log/items/<name>"`, check the bytes'
  SHA-256 against the listing's `sha256`, that `schema` is
  `some-ui.leetype-log/1`, and that the name carries `session`. A log that
  fails any of these is a record problem (§5).
- **A file's whole history.** A return this week answers a struggle that may
  be weeks old. So for each session file a new log names (its `file`), read
  every log of that file, earlier weeks' included: the live items whose body
  names it (fetch every live item's body once to learn its `file`), and the
  archived logs an earlier review's `sessions` lists for it. An archived log
  (logs go home after 30 days live) is asked back with
  `PUT "$JOBS_MAILBOX_URL/v1/leetype-log/wanted/<name>"` (no body); home puts
  it back within 15 minutes. Until it is back, that file's new logs are
  **held**: not judged this run, and not counted in `sessions`. A held log,
  or an ask the mailbox refuses, is a record problem (§5), named every run
  until it is judged.
- **A session with several copies:** only its highest `.r<n>` (no suffix is
  `r1`) is fed to `summariesOf`, since a later copy holds every event of an
  earlier one.
- **`logSeq`** for this run's review: the highest `seq` such that every new
  log at or below it was read, checked and judged. A log that failed its
  checks or is held stops it there, so the next run reads from that log
  again; with nothing new, or the mailbox skipped, it stays the previous
  value.

Until home hands logs out (some-ui#2027), the folder is empty. Then, and for
a session no log names, the export's `leetypeSessions` (below) is the same
funnel, computed on the phone by `summariesOf`: report it, and say in the
review that it was the source.

### The answers and takes (Drive)

The phone's study-context export lands in
`Study ledger/study-context/<YYYY-MM-DD>/`, where the SOP keeps only the
newest three folders. **Copy before it can go:** for every export folder
whose `context.json` has a non-empty `leetypeAnswers` or `leetypeTakes`, copy
its `context.json` and every `leetype-take-*` file, untouched (`copy_file`,
same names), into `LeetType/answers/<that folder's date>/` when they are not
there yet, then list that folder and check each copy is there with the same
size. This is the SOP's rule (owner, 2026-10-20: option 2) and runs on every
run, even one that writes no review. Never move, rename or trash an
original: the keep-3 rule is someone else's step.

Then read every folder of `Study ledger/study-context/` and
`LeetType/answers/` dated on or after `answersThrough`. From each
`context.json`:

- `leetypeAnswers`: per answer its `id`, the session `file` and record
  `screen`, the one-sentence `prompt`, the `rubric` shown after answering, the
  learner's `ticks`, and either `typed` or the take's audio file named in
  `audio` (`leetype-take-…`, beside `context.json`). A rubric point is text,
  or `{ "text", "covers" }` once a file says which rounds it states: judge its
  `text`.
- `leetypeTakes`: every take kept, with or without an answer noted. A take
  that no answer names is **answerless**: it has no ticks or rubric, so
  transcribe it and judge it against its record screen's rubric in the
  session file. It is keyed by its take `id`.
- `leetypeSessions`: the per-session funnel, used only where no log covers
  the session (above).

An answer is new when its `id` is in no review's `answers`; an answerless take
when its take `id` is in no review's `takes`. The same answer shows up in
several exports until the phone lets it go, so each is judged once. Add back
each `unheard` entry from the last review.

**Hearing a take.** Download the audio with the service account, never the
connector, into a scratch directory outside the checkout, and check its MD5
against Drive's `md5Checksum` for the file. For example, with
`pip install google-auth requests`:

```python
import base64, hashlib, json, os, sys, requests
from google.oauth2 import service_account
from google.auth.transport.requests import Request

creds = service_account.Credentials.from_service_account_info(
    json.loads(base64.b64decode(os.environ["DRIVE_SA_KEY_B64"])),
    scopes=["https://www.googleapis.com/auth/drive.readonly"])
creds.refresh(Request())
h = {"Authorization": f"Bearer {creds.token}"}
file_id, out = sys.argv[1], sys.argv[2]  # the take's Drive id, a scratch path
API = f"https://www.googleapis.com/drive/v3/files/{file_id}"
meta = requests.get(API, headers=h, params={"fields": "md5Checksum"}).json()
body = requests.get(API, headers=h, params={"alt": "media"}).content
assert hashlib.md5(body).hexdigest() == meta["md5Checksum"], "md5 differs"
open(out, "wb").write(body)
```

Transcribe it in this session only (for example `pip install faster-whisper`
and its `base.en` model on CPU). Never send the audio or its transcript
anywhere, and never save a transcript to Drive or the mailbox. A take you
can't hear (no service account or no access, no model installs, the audio is
unreadable) is `unheard`: list it in this review's `unheard` with where it is
(§5), and the next run tries it again. Once its audio is in neither
`Study ledger/study-context/` nor `LeetType/answers/`, name it in the review
as one that can't be judged and drop it from the list.

### The session files they answer

Each answer and each log names its session `file`. Read it from the
mailbox's `leetype` folder (`GET "$JOBS_MAILBOX_URL/v1/leetype/items/<name>"`;
the body is `{"schema":"some-ui.leetype-session/1","file":<the session file>}`)
or Drive's `LeetType/sessions/`. A name held in both with different content
is a record problem (§5). From the file: for each round, its `rule` (an `M`
or `A` id, Rem. 7.4) and the reading screen it `cites` (Rem. 10.3); for each
reading screen (`type: "reading"`), its `source` (title, author, `where`,
`minutes`) and `primer`; for each record screen, its `prompt` and `rubric`.

### Earlier reviews

Read the review of the latest ISO week (its newest revision) in full, so this
one can say what moved.

### Nothing new: end

The run has something new when any of these holds: a new log it can judge, a
new answer, a new answerless take, an `unheard` take that can now be heard,
or a `leetypeSessions` whose SHA-256 differs from `sessionsDigest` (§5).
Otherwise it writes no review and ends with the one-line summary (§8). A week
with no LeetType is not an error. It still does the archived asks and the
copy into `LeetType/answers/` above.

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

### How each round went (Prop. 9.4): the code decides, the review reports

The funnel is computed, never judged by hand. For each session file a new log
names, run `summariesOf` over every log of that file (§1), in their home form:
save this as `summarize.mts` in your scratch directory and run it from the
checkout's root:

```ts
// pnpm --filter @some-ui/leetype exec tsx <this file> <checkout> <log.json>...
import { readFileSync } from "node:fs"
import { pathToFileURL } from "node:url"

const [checkout, ...files] = process.argv.slice(2)
const model = `${checkout}/packages/ui/leetype/src/lib/leetype/session-log/model.ts`
const { summariesOf } = await import(pathToFileURL(model).href)
const events = files.flatMap(
  (file) => JSON.parse(readFileSync(file, "utf8")).events
)
console.log(JSON.stringify(summariesOf(events), null, 2))
```

Report what it prints, per round: the first pick and whether it was a
struggle (Def. 9.4; slowness is the events' own `slow`), the readings placed
and what was done with each, each return and whether it was `assisted`, and
whether the round is `solved`. What counts as assisted is LTY1's
(some-ui#2345): what showed a round's answer since its last struggle (a
take's rubric covering it, its worked confirmation, a correct replay's
reveal), with a struggled return opening the window again. An assisted
return is an observation, not an unassisted commitment (Rem. 9.5, Axiom 9.2).
Don't restate or second-guess the rule: where the output looks wrong against
the events, report the output and name the doubt under **App problems**.

A return never counts as a second instance of its rule (Rem. 10.4: it is the
same mechanism by construction); a return answered in a later session is
evidence of retention.

## 3. What it concludes

Group the answers and rounds by the rule their round names (`M1`–`M8`,
`A1`–`A10`, Rem. 7.4), and for each rule write:

- **Can explain now:** rubric points said clearly, each with the quote, and
  rounds `summariesOf` reports solved.
- **Can't yet:** what is missing or only partly said, and rounds still
  unsolved or solved only by an assisted return. For each, the passage that
  answers it: the reading screen the round `cites`, or another reading screen
  in the session files, by its `source` (title, `where`, minutes).
- **What moved:** against the latest earlier review, which points went from
  missing or partly to said, and which rounds became solved.

Then, across the rules:

- **Readings to place:** at most three, each a reading screen from the
  session files, with its `source` and a primer of one or two lines that says
  what to look for, never the answer (Prop. 9.4, Rem. 10.3).
- **Ticks against answers:** each gap from §2, one line each.

## 4. Limits on what it says

- Something wrong with the app (a screen that misbehaved, a log that doesn't
  add up, a funnel that looks wrong against its events, a rubric that gives a
  round away) goes in the review under **App problems**, in plain words, for
  the owner to file. This run files nothing.

## 5. The review file

One Markdown file in `LeetType/reviews/`, named for the ISO week of the run's
Pacific date:

```sh
python3 -c "from datetime import datetime; from zoneinfo import ZoneInfo; y, w, _ = datetime.now(ZoneInfo('America/Los_Angeles')).isocalendar(); print(f'review-{y}-W{w:02d}.md')"
```

**Append-only.** A review is never edited, replaced, renamed or trashed.
Run §6 first, so **Sources** can name its puts. Just before uploading, list
`LeetType/reviews/` again. If a file for the week is there (a second run that
week), the file is `review-<YYYY>-W<ww>-r<n>.md` with the next `n` from 2.
A revision is complete in itself: it carries the full state, everything the
file it revises said and what this run adds, and its first line says what it
supersedes and why. Answers and takes are keyed by id, so an overlap between
two files is harmless.

It opens with this front matter, which the next run reads (§0.5):

```yaml
---
week: 2026-W45
supersedes: null
logSeq: 0
answersThrough: 2026-11-08
sessionsDigest: null
answers: []
takes: []
sessions: []
unheard: []
---
```

- `week`: the ISO week the file is named for.
- `supersedes`: the file name this one revises, or `null`.
- `logSeq`: §1's: the highest `seq` up to which every new log was read,
  checked and judged.
- `answersThrough` (`YYYY-MM-DD`): the earliest export folder date holding
  an answer or take this run read but neither judged nor listed in
  `unheard`; with none, the latest folder date read; with no folder read,
  the previous value.
- `sessionsDigest`: the SHA-256 of the newest export's `leetypeSessions`, as
  `JSON.stringify` of the parsed value, or `null` with none.
- `answers`: the `id` of every answer this file judged.
- `takes`: the take `id` of every answerless take this file judged.
- `sessions`: every log this file judged, as `{ name, file }`: its name and
  the session file its body names (held logs are left out).
- `unheard`: each take that couldn't be heard, as
  `{ id, kind: answer | take, folder: <export date>, file: <audio file name> }`.

Then the sections, in this order: **Sources** (the logs, export folders and
session files read, by name; the logs held and the archived ones asked back;
what was skipped and why), **How the sessions went** (§2, per session and
round, from `summariesOf`), **By rule** (§3, per rule), **Readings to place**,
**Ticks against answers**, **App problems**, and **Record problems** (a file
that failed its checks, two copies that differ, a take that can't be judged).
An empty section says "None."

Upload it with `contentMimeType` `text/markdown` and
`disableConversionToGoogleType` true. Confirm the result's mimeType is
`text/markdown`, its owner is paulgathondudev@gmail.com, and its size equals
your local file's byte count. Then list `LeetType/reviews/` once more: if
another file now has the same name (a run racing this one), name both in the
summary. If a check fails, don't retry under the same name: write the next
`-r<n>` revision and say so in the summary.

## 6. New session files: none for the first four reviews

The first reviews write the assessment only (owner, 2026-10-20: "the
assessment only for the first month"). Until `LeetType/reviews/` holds
reviews for four distinct weeks (§0.5), skip this step.

From then on, a run may write at most two new session files, for what §3
says the owner can't yet explain. They go to the mailbox's `leetype` folder
only, never to Drive: home serves them to the phone (some-ui#2026), and home
is the store. **A put is permanent:** a name holds its bytes for good, so
each file clears all of these first, in a scratch directory outside the
checkout:

1. It is named `t<thread>-<NN>-<slug>.json`, the next `NN` of its thread
   unused in both Drive's `LeetType/sessions/` and the mailbox's `leetype`
   folder, live and archived.
2. It passes the lint: `pnpm --filter @some-ui/leetype lint:session-file
<absolute path>` exits `0` and prints `OK`. On a single file it also prints
   a `Rem. 10.3 (5): …` line about the whole corpus; that line is expected and
   is not a finding. Every other line is: fix it and run the lint again.
   Unknown `M`/`A` ids fail it.
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
and don't retry. Name each file put in the review's **Sources** (this step
runs before §5's upload).

## 7. What it may and may not touch

- **Writes only** what the list at the top names: a new file in
  `LeetType/reviews/` (§5); copies into `LeetType/answers/<date>/` (§1); the
  moves the SOP's `Inbox/` triage asks for, if `Inbox/` holds anything; the
  `wanted` asks for archived logs (§1); and, after four weeks' reviews, new
  names in the mailbox's `leetype` folder (§6).
- **Never** edits, replaces, renames or trashes anything in Drive, and moves
  nothing but what the `Inbox/` triage asks: no session file, no
  study-context export, nothing in `Study ledger/`, no take, and no review,
  its own included.
- **Never** puts a session file into Drive's `LeetType/sessions/`, and never
  puts to any mailbox folder but `leetype`.
- **Never** writes outside Drive and the mailbox: no GitHub issue, PR,
  comment or commit, nothing to home, no email.
- **Never** uploads, sends or saves a take's audio or its transcript anywhere
  outside the owner's Drive (the copies in §1) and this session's scratch
  directory, and never prints the mailbox token or the service account key. The takes
  are the owner's own voice: the review quotes an answer only as far as a
  rubric point needs, never whole.

## 8. Summary

End with a short summary, which the push notification carries: the review
file written (its name, and in plain words which session's log and which
export date it read up to), or that nothing was new; how many logs, answers and takes it read, and the logs held; the
three readings placed; the exports copied into `LeetType/answers/`; each
session file put and its status code; anything skipped and why (the mailbox,
the SOP section, the service account's access, an unheard take, an archived
log asked back); and the app problems the review names, one line each. If
nothing was new, say so in one line.
