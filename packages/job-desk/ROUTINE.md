# The daily jobs run

A scheduled task runs this every morning at 07:52 Pacific, in a fresh session
with the Google Drive connector, web search, GitHub access to
`paulgsc/some-ui` that can push one branch and open a PR, and a checkout of
it. It reads my résumé and what I said about yesterday's picks,
searches public job postings on two tracks, and leaves one file in Drive:
today's digest.
The phone opens that file, and later runs read it back to see what was
already picked.

The run writes one file to Drive, and at most one PR to the repo: a change to
one résumé composition, for a posting no composition leads with yet (§6). I
review and merge it; the run never does. It pushes nothing else and changes
nothing else in the repo.

Beside Drive there is the mailbox (§0.4), a small service that holds the same
files. The run also puts the digest there (§8) and reads my decisions and
scouts from it as well as from Drive (§2). Drive stays the first route. And
every run, one that stops early included, leaves a record there of what it
did (§9): the phone has no other way to tell a run that found nothing from
one that never finished.

The shapes are this package's schemas, and `src/sample.digest.json`
is a complete digest to copy. The limits (picks per track, open picks,
places, queries, excluded titles, posting age) are `src/policy.ts`. When this file and the
policy disagree, the policy wins and this file is the bug.

## 0. Before anything

Note when the run started, before anything else; it is the run record's
`startedAt` (§9):

```sh
date -u +%Y-%m-%dT%H:%M:%SZ
```

Wherever this file says to stop, write no digest, but still write the run
record (§9) and the summary (§10). Nothing ends a run before those two.

1. If this session has no Google Drive connector, stop (§9). Otherwise read
   the Google Doc titled `README — Drive SOP` in My Drive. It is the rule
   for where files go, and its `some-ui jobs/` section holds the folder ids.
   Every Drive result's owner must be paulgathondudev@gmail.com; if one isn't,
   stop (§9).
2. If this session can't run a web search and an HTTPS GET, stop (§9) and
   say so. Write no digest: a digest from yesterday's postings would read as
   today's.
3. List `some-ui jobs/Brief/`. If `digest-<today>.json` is already there,
   stop (§9) and say so. A digest is never replaced.
4. The mailbox. `JOBS_MAILBOX_URL` (no trailing slash) and `JOBS_MAILBOX_TOKEN`
   are set in this session's environment. If either is unset or empty, skip
   every mailbox step in this file, carry on with Drive alone, and say so in
   the summary. Otherwise check it once:

   ```sh
   curl -sS --max-time 30 -o /dev/null -w '%{http_code}\n' \
     -H "Authorization: Bearer $JOBS_MAILBOX_TOKEN" \
     "$JOBS_MAILBOX_URL/v1/brief/items?limit=1"
   ```

   `200` means it is usable. Anything else (`401` is a wrong token, `000` is no
   network): skip every mailbox step, carry on with Drive alone, and say so in
   the summary. A mailbox problem never stops the run and never changes what
   goes to Drive. Use only `curl` with that `Authorization` header, never print
   the token, and don't turn on shell tracing (`set -x`).

Today is the date in America/Los_Angeles.

## 1. The evidence

From the repo at `origin/main`, and from `paulgsc/server` at its `main` (a
shallow, read-only clone):

- `packages/ui/resume/src/react/generated/data.ts`: every composition, by
  variant, with its summary, skills, all project bullets, highlights, toolbox,
  education and additional experience. These variants are the only ones a
  `build` may name.
- `packages/ui/resume/src/canon/resume.meta.typ`: the provenance of each claim,
  the named gaps, and "Non-engineering employment history". I confirmed on
  2026-10-17 that its four jobs are true and may be cited: WIS (2024–present),
  CABA Design (2020–2023), Natera (2019–2020) and PayLocity (2017–2019).
- `packages/ui/resume/src/data/personal.typ`: location, work authorization and
  education.
- `packages/ui/resume/scripts/check-claims.mjs`: `FORBIDDEN_TERMS`, which never
  appear in a fit or a draft.

Every fit cites one of these. Its `source` names the repo and path
(`server · scripts/check_metric_contract.py`) or the job
(`personal · Natera, 2019–2020`). A fit restates a claim the evidence already
makes; it never adds one. A requirement the evidence doesn't meet goes in
`gaps`, and anything the posting asks for that I must not claim goes in
`dontClaim`.

Record both commits in `evidence`, and the some-ui commit as each build's
`ref`.

## 2. What I said since the last run

Every digest lists in `read` the Decisions and Scout files it took in. Read
every digest in `Brief/` and collect those names; the files in
`some-ui jobs/Decisions/` and `some-ui jobs/Scout/` that no digest names are
new. The phone offers a share again until I confirm it arrived, so a new file
can repeat one already read:

- a pick's decision, a debrief, an outcome or a disagreement whose `id` a file
  some digest names in `read` already carried is not new: skip it;
- a scout some digest already answered in `scouts` is not new: skip it;
- a voice note is new until some digest lists it in `transcribed`, even when an
  earlier file named it, since its audio may not have arrived the first time.
  So also transcribe each note a file already read names whose audio is now
  in `Decisions/` or `Scout/` and no digest lists, and take it in with the
  entry that names it.

If the mailbox is usable (§0.4), it is a second place to look. List its
`decisions` and `scout` folders, starting at `after=0`:

```sh
curl -sS --max-time 30 -H "Authorization: Bearer $JOBS_MAILBOX_TOKEN" \
  "$JOBS_MAILBOX_URL/v1/decisions/items?after=0&limit=50"
```

Each answer is `{"items":[{"seq","name","size","sha256","contentType","putAt","liveSince"}]}`,
oldest first. Ask again with `after` set to the highest `seq` in the answer,
until `items` is empty, then do the same for `scout`. An answer that is not
that object (an `{"error":…}`, or nothing at all) means the mailbox has failed
since §0.4: look no further in it, carry on with Drive alone, and say so in
the summary. A file whose name no digest names in `read` is new, exactly as
for Drive. Fetch each new one:

```sh
curl -sS --max-time 30 -H "Authorization: Bearer $JOBS_MAILBOX_TOKEN" \
  -o <scratch file> "$JOBS_MAILBOX_URL/v1/decisions/items/<name>"
```

`sha256sum <scratch file>` must equal the `sha256` its listing gave; a file that
doesn't match is skipped and named in the summary. Then merge the two sources
by file name: a name in both is one file, and if the bytes differ, use Drive's
and say so in the summary. Home is the only one that can put a file in these
mailbox folders, so the owner check in §0.1 doesn't apply to them. They never
name voice notes (home holds no audio), so a voice note is found in Drive only,
as above.

The listings show live files only. A file that has been in the mailbox for
months moves home (it is archived), and reading it answers `410`.
`GET $JOBS_MAILBOX_URL/v1/<folder>/archived?after=0&limit=50` lists them, paged
like the items; a file archived, put back and archived again is listed once
each time, under one name. A name there that no digest names in `read` is new,
as for the items. If this run needs one that Drive doesn't have, ask for it
once, with no body:

```sh
curl -sS --max-time 30 -X PUT -H "Authorization: Bearer $JOBS_MAILBOX_TOKEN" \
  -w '\n%{http_code}\n' "$JOBS_MAILBOX_URL/v1/<folder>/wanted/<name>"
```

`{"change":"live"}` means it is back already: fetch it from `items/<name>`
as above. `{"change":"asked"}` or `{"change":"unchanged"}` means home will put
it back within about 15 minutes. Don't wait for it: carry on without it, and
name it in the summary so the next run takes it in.

For each new file:

1. Check it with the checker (step 8). One that fails is skipped and named in
   the summary, never guessed at.
2. Transcribe every voice note it names (below, "The transcriber"). If it
   can't, carry on without the note and say so.
3. Take it in:
   - **Passed picks:** the reasons and notes tell me what to stop sending. A
     reason given twice is a rule for this run.
   - **Disagreements:** a set-aside posting I would have picked. Look it up
     again as §3 looks up a scout; if it is still open and its track has a
     free slot (below), it may be a pick today.
   - **Fit notes:** why I fit a pick I took, in a pick entry's `fit`. A note
     is new unless a decisions file some earlier digest lists in `read`
     already carried its `id`. For each pick with a new note that is still
     open in the queue (below; a `closed` entry is not), write it a redraft
     in `redrafts` (§8), from the pick's fits and what I said, every note of
     its `fit` read together, newest last: its cover letter, if its kit has
     one or its form takes one, and each question of its kit, with the
     `label` and `required` the kit gives it. A question the kit left to me
     (`draft: null`) gets a draft only when what I said answers it; the
     phone keeps the kit's own draft for any the redraft leaves `null`. What
     I said may add what the evidence doesn't hold, since it is mine to
     claim; it still never names one of `FORBIDDEN_TERMS`, a term of that
     pick's `dontClaim`, or a phone number or address. A pick no longer open
     gets no redraft: say so in the summary.
   - **Debriefs and outcomes:** how applying went and what came of it. Report
     them in the summary. A debrief's `result` is always there, but its
     `minutes` and `friction` may be `null`: I ended it in one tap and didn't
     say. Leave those out of any count or average and say how many went
     unsaid; never read a missing one as zero minutes or as smooth. Once
     there are 30 or more outcomes, compare them with
     the odds each pick was given and say in the summary whether the rubric
     reads high or low. Don't change the rubric yourself.

A pick is known by its fingerprint (each entry also names the digest day it
came from). When a later decisions file restates a pick, I changed my mind:
the newest entry is the decision that stands.

A posting picked in any earlier digest, or named in any decisions file, is
never picked again, unless a disagreement brought it back.

### The transcriber

Voice notes are webm (or ogg, m4a) files beside the file that names them.
Transcribe them in this run's own container, in a scratch directory outside
the checkout. Set it up once per run:

```sh
python3 -m venv /tmp/whisper && /tmp/whisper/bin/pip install -q faster-whisper
apt-get update -qq && apt-get install -y --no-install-recommends ffmpeg
```

Take one note at a time: bring it in, decode it, convert it and transcribe
it, keeping its transcript, before the next. Bring it into the container with
the Google Drive connector's `download_file_content`, by the note's file id. A
note is too large for the conversation, so the tool saves its result to a file
and names that file's path: JSON whose `content` is the audio in base64.
Decode it from there, and never paste a saved note's base64 into a command.
The audio may be webm, ogg or m4a; ffmpeg reads the format from the file
itself:

```sh
python3 -I -c 'import base64, json, sys; open(sys.argv[2], "wb").write(base64.b64decode(json.load(open(sys.argv[1]))["content"]))' <saved file> /tmp/whisper/note.audio
ffmpeg -loglevel error -y -i /tmp/whisper/note.audio -ar 16000 -ac 1 /tmp/whisper/note.wav
```

A note small enough to come back inline is a few seconds long, and the one
place base64 goes into a command: write the whole JSON result with a quoted
heredoc (`<<'EOF'`) to `/tmp/whisper/note.json` and run the same one-liner
with that as `<saved file>`.

Then transcribe the wav with this script, saved outside the checkout as
`/tmp/whisper/transcribe.py` and run as
`/tmp/whisper/bin/python -I /tmp/whisper/transcribe.py /tmp/whisper/note.wav`.
It passes the audio as a float32 array, never the path (the installed `av`
breaks on a path), and `vad_filter` keeps silence from coming back as "You"
or "Thank you.":

```python
import sys, wave
import numpy as np
from faster_whisper import WhisperModel

with wave.open(sys.argv[1]) as w:
    pcm = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16)
model = WhisperModel("small.en", device="cpu", compute_type="int8")
segments, _ = model.transcribe(pcm.astype(np.float32) / 32768, vad_filter=True)
print(" ".join(s.text.strip() for s in segments))
```

An empty transcript is a note with nothing said: say so in the summary.

### The queue

I work one batch before the next: applying takes effort, and applying
everywhere gets nothing back. So a run adds picks only into free slots, and
the picks I haven't finished hold theirs. The limit is `MAX_OPEN_PICKS` per
track (the same as `PICKS_PER_DAY`: 3 software, 2 adjacent), earlier
digests' picks included. A pick I leave untouched for `LAPSE_DAYS` days (3)
lapses and frees its slot, so the queue never turns into a backlog to clear.

1. Download every digest in `Brief/` and every decisions file in
   `Decisions/` that passes the checker (all of them, not only the new ones;
   a file step 1 skipped stays out) into one scratch folder, and from the
   repo root run:

   ```sh
   pnpm --filter @some-ui/job-desk build
   pnpm --filter @some-ui/job-desk queue --day <today> <folder>/*.json
   ```

   `<today>` is the day of the digest you are writing. It prints the picks
   still open (`open`), those that lapse today (`lapsed`), and each track's
   free slots (`free`), and names any file it couldn't read under `skipped`:
   say each in the summary. A pick is open while no shared decision answers
   it or it is `untouched`, or while it is `taken` with no debrief. One of
   those untouched lapses on its digest's day plus `LAPSE_DAYS`: `lapsed`
   lists each that no earlier digest's `queue.lapsed` names, and a later
   share that takes it opens it again. One `passed`, `archived` (an older
   phone let the batch go unreviewed) or debriefed is done. Only what
   reached Drive or the mailbox counts: a pick I decided on the phone and
   haven't shared is still open, or lapses.

2. Read each open pick's posting again, as §3 reads one. When it has closed
   (a Greenhouse or Lever 404, an Ashby `id` gone from its board), its slot
   is free: mark it `closed` and say so in the summary. Nothing else frees a
   slot but a lapse. A pick I took never lapses: one waiting ten days is
   mine to debrief. The run never writes a decision; only the phone does,
   and a lapse is not one.
3. Record it in the digest: `queue.open` lists every open pick with its
   `day`, `pickId`, `track` and `closed`, and `queue.lapsed` every pick
   `lapsed` printed, with its `day`, `pickId` and `track`. A lapse is
   recorded once, by the first digest after it, and never deleted.
4. Each track gets at most its `free` slots today, plus one for each of its
   picks you marked `closed` (`free` counts them as held), and never more
   than `PICKS_PER_DAY`. The checker holds the digest to this, and to
   recording its queue at all.
5. When a track has no free slot, run none of its queries in §3. When
   neither has one, search nothing: the digest has no picks and an empty
   `setAside`, and `seen` counts only the scouts it read. Either way, still
   take in what step 2 found, still answer every new scout (§3 to §5; with
   no slot a scout becomes no pick, so it is scored and gets a `review`),
   and still write the digest, so the phone shows the queue is full.

## 3. Search

Postings come from public sources that give anyone a posting's full text:
the Greenhouse, Lever and Ashby job boards, and Hacker News's monthly "Who is
hiring?" thread. Fetch each with an HTTPS GET (`curl`) and read the fields
named here; never take a field from a search result's snippet or from a
summary of a page. Fetch each Ashby board once per run, however many of its
postings you read: one can run to megabytes. Indeed and LinkedIn are never searched: their
pages refuse agents.

1. **Find on the boards.** For every query in `QUERIES` (the software list,
   then each adjacent family's) of a track with a free slot (§2, "The
   queue"), and every place in `LOCATIONS`, run one web search for the
   query and the place, unquoted, with the search limited to
   the domains `job-boards.greenhouse.io`, `boards.greenhouse.io`,
   `jobs.lever.co` and `jobs.ashbyhq.com`. Keep only results that name one
   posting, and drop any query string and a trailing `/apply` or
   `/application`. Keep the slug's case: Lever's is case-sensitive.

   - Greenhouse: `…greenhouse.io/<board>/jobs/<id>`;
   - Lever: `jobs.lever.co/<company>/<id>`;
   - Ashby: `jobs.ashbyhq.com/<org>/<id>`.

2. **Find on Hacker News.** Take the newest story by `whoishiring` titled
   "Ask HN: Who is hiring? (…)"
   (`https://hn.algolia.com/api/v1/search_by_date?tags=story,author_whoishiring`).
   Before this month's thread is up, that is last month's; §4's age rule
   sets aside its old posts. Search its posts once per query of a track
   with a free slot, `page` from 0 to `nbPages` − 1:
   `https://hn.algolia.com/api/v1/search?tags=comment,story_<id>&query=<query>&typoTolerance=false&hitsPerPage=50&page=<n>`.
   Keep top-level posts only, those whose `parent_id` is the story's id. A
   post that links a posting on one of the three boards is read there, as
   that posting. A post that lists several roles is one candidate per role.

3. **Read.** Read every candidate from its source:

   - **Greenhouse:**
     `https://boards-api.greenhouse.io/v1/boards/<board>/jobs/<id>`. Title
     `title`, company `company_name`, description `content` (HTML,
     entity-escaped), place `location.name`, posted `first_published`, apply
     link `absolute_url`. Add `?pay_transparency=true` for pay
     (`pay_input_ranges`, in cents).
   - **Lever:** `https://api.lever.co/v0/postings/<company>/<id>`. Title
     `text`, description `descriptionPlain`, `lists`, `additionalPlain` and
     `salaryDescriptionPlain` (pay and clearance terms are often only in the
     last two), pay `salaryRange`, places `categories.allLocations`, remote
     when `workplaceType` is `remote`, job type `categories.commitment`,
     posted `createdAt` (milliseconds), apply link `hostedUrl`.
   - **Ashby:**
     `https://api.ashbyhq.com/posting-api/job-board/<org>?includeCompensation=true`,
     the entry with that `id`. Title `title`, description `descriptionPlain`,
     pay `compensation.compensationTierSummary` (often null), places
     `location` and every `secondaryLocations[].location`, remote when
     `workplaceType` is `Remote` (never `isRemote`, which is true for most
     hybrid roles), job type `employmentType`, posted `publishedAt`, apply
     link `jobUrl`.
   - **A Hacker News post:** description `comment_text` (HTML,
     entity-escaped), posted `created_at`. Company, title and place come
     from its first line. The apply link is the first https link the post
     gives for applying (an email address is not one), else
     `https://news.ycombinator.com/item?id=<objectID>`.

   Lever and Ashby give no company name in their JSON: take it from the
   posting page's `<title>`, with its entities decoded, never from the URL.
   Lever's is "Company - Title", so the company is what precedes the
   trailing " - " and title; Ashby's is "Title @ Company". Write every
   company as it names itself, without a legal suffix (Inc., LLC, Corp.) or
   a country (USA), so the same company reads the same from every source.
   When a board reposts other employers' roles (Jobgether, say), the company
   is the employer the posting is for; one that doesn't name it is dropped. `postedOn` is the
   America/Los_Angeles day of the posted time.

   A Greenhouse or Lever 404, or an Ashby `id` missing from its board, means
   the posting has closed: drop it. Drop a candidate whose source can't be
   read, or that names no company, title or place, rather than guess.

4. **Keep** a posting only when one of its places is in `LOCATIONS`: remote
   and open to people in the US, or based in Berkeley, San Francisco or
   Oakland. A posting is remote when its `workplaceType` says so or one of
   its places does ("Remote (US)", "Open to US-based Remote"); either way
   the region must be the US. A remote role limited to another region
   ("Europe", "Hybrid - London") is not. Record as its `location` the
   `LOCATIONS` entry it matched ("Remote" for `remote`), the remote one
   first, so the same posting has one fingerprint from every source and
   every run. Drop the other postings before counting. A scout outside
   `LOCATIONS` is counted in `seen` and set aside by §4's rule for scouts,
   with `rule` "outside LOCATIONS".

Give each posting its `fingerprint()`. Postings with the same fingerprint are
one posting. The same company and title in several cities are one posting
too: keep the remote one, else the nearest to Berkeley. `seen` is the count of
distinct postings left.

**Scouts.** Each new scout from step 2 is a posting I found myself, and a
candidate like the rest, on the track and family I filed it under. When its
link is on a board above, read it there. Otherwise search those boards for
its title words and company, and read the match. Count each one found in
`seen`, once per fingerprint. When neither turns it up, its `postingText`
(what I pasted) stands in for the description and its link for the apply
link: take the company, title, location and posted date from that text, never
a guess. One whose text names no location or no posted date can't be
fingerprinted or aged, so it never becomes a pick; it is scored and answered
with a `review` only. With neither a match nor the text, its verdict is
`not-found` and it goes no further.

## 4. Set aside

Set a posting aside, with a one-line `why`, when:

- its title matches `EXCLUDED_TITLE`, or its description has customer calls,
  phone duties, a sales quota, escalation calls or a support rotation. I never
  take customer-facing or phone roles. Solutions work qualifies only when it
  is integration or internal-tools building with no quota and no calls;
- it was posted more than `MAX_POSTING_AGE_DAYS` days ago;
- it is part-time, an internship, fixed-term, temporary, a contract
  (Lever's "Full Time Contractor" too), gig work, or a staffing program with
  relocation or repayment terms. Lever's `commitment` and Ashby's
  `employmentType` say which; elsewhere the description does;
- it requires a security clearance or US citizenship. Work authorization is
  "Authorized to work in the US for any employer"; there is no clearance;
- it asks for five or more years, or a senior, staff or lead title;
- it was already decided (step 2). Count these in `seen`, but leave them out
  of `setAside`.

A scout a rule sets aside isn't listed in `setAside`: its verdict is
`disagree`, its `rule` names the rule in a few words, its note says how the
posting met it, and it has no `review`. For a posting already decided, the
`rule` is "already decided" and the note names the digest day and pick id
(or the decisions file) that decided it.

List at most `MAX_SET_ASIDE` (40) set-aside postings, those closest to being picked first.

## 5. Score

**Fit**, 0 to 1: list the posting's required qualifications, leaving out
"nice to have" ones. Score each 1 when a fit covers it, 0.5 when the evidence
is adjacent (the same skill in another setting), and 0 otherwise. Fit is the
total over the count, and `fitWhy` says "covers N of M requirements", counting
the halves as covered.

**Odds**, 0 to 1, the chance of a reply: start at 0.5, then

- −0.1 for each required year beyond two;
- +0.1 if posted in the last 7 days, −0.1 if 15 to 30 days ago;
- +0.05 if remote or within a commute of Berkeley;
- −0.1 if a computer-science degree is required with no "or equivalent";
  my degree is a B.S. in Mechanical Engineering;
- clamp to between 0.02 and 0.95.

`oddsWhy` names the factors that moved it. Both scores are judgments until the
outcomes calibrate them, and the digest says so by naming its reasons.

Rank each track's candidates by fit × odds and take up to the track's free
slots (§2, "The queue"), never more than `PICKS_PER_DAY`. On
the adjacent track, when two scores are within 0.05, prefer a family not yet
picked today. Fewer picks than the limit is fine; a weak pick is not.

A scout that makes the cut becomes a pick, and its verdict is `agree`; its
`pickId` is the id that pick gets (§8, step 1). Any other scout still scored is answered in full, since I chose
it: `agree` when its fit is `SCOUT_AGREE_FIT` (0.5) or more, `disagree`
otherwise. Its `review`
holds its scores, its gaps, and what to send if I apply anyway (`sends`, the
composition and layout §6's build rule would choose). The `note` says in a
line why it ranked where it did.

## 6. The résumé for each pick

- **Build** when an existing composition already leads with the evidence the
  posting wants. A software pick sends `backend`, `platform` or `fullstack`,
  whichever summary and skills match the posting best; an adjacent pick sends
  its family's composition (`data`, `qa` or `solutions`). Choose a layout
  that takes contact details: `safe` by default, `classic` for a modern ATS
  (Greenhouse, Lever, Ashby), `conventional` for traditional employers
  (government, healthcare, finance) and `vanilla` for an old parser (Taleo, a
  legacy iCIMS form).
- **Patch** when none does. An adjacent pick's patch changes its family's
  composition; a software pick's names the composition to change, or a new
  one. Give a `fallback` to send meanwhile (the same rule as a build),
  `pr: null` unless this run opens its PR (below), and in `change` what the
  composition would lead with, in a sentence or two, from evidence that
  exists.

### The résumé PR

A run opens at most `PATCH_PRS_PER_RUN` (one) PR, so I review one change at
a time. Its PRs carry the label `jobs-patch`, and only theirs do.

1. Search `paulgsc/some-ui` for PRs labelled `jobs-patch`. If one is open,
   open none today: a patch for the composition it changes may name it as
   its `pr`, and every other patch keeps `pr: null`.
2. Otherwise take the patch pick with the highest fit × odds whose `variant`
   is an existing composition, unless the latest `jobs-patch` PR for that
   composition was closed without merging: I turned that change down, so
   leave the composition to me and say so in the summary. A new composition
   stays proposed, with `pr: null`: adding one touches more than its own
   entries, and that is mine to write. Give every pick its id now (§8,
   step 1), so the branch and the PR name the id the digest will carry.
3. From `origin/main`, on the branch this session was given to work on (or
   `jobs/resume-<today>-<pick id>` if it was given none), change only that
   composition's entries in `packages/ui/resume/src/data/resume.typ`: its
   `summary`, `skills`, `keywords`, `platform` (the "Engineering practice"
   lines), the order and choice of its projects and bullets, its highlights
   and its toolbox. Each new or reworded line restates a line some
   composition in `resume.typ` already carries, or an entry under
   `= Provenance` in `src/canon/resume.meta.typ`; never a gap, a requirement
   or a revision note. A claim with no such source is never added; it goes in
   the pick's `gaps`. Never write a phone number, street address or other
   contact detail anywhere in the repo.

   In `resume.meta.typ`, add one line under `= Current revision` naming the
   change and the PR's composition, and, for an adjacent composition, the
   line's source in its list under "Software-adjacent compositions". Change
   nothing else there.

4. Check it from the repo root:

   ```sh
   pnpm install --frozen-lockfile
   apt-get update -qq && apt-get install -y --no-install-recommends poppler-utils
   npx turbo run build --filter="@some-ui/resume^..."
   CI=true pnpm --filter @some-ui/resume build
   pnpm --filter @some-ui/job-desk test
   ```

   `CI=true` makes a check that can't run fail instead of being skipped. Every
   check must pass; if one can't, open no PR and say why in the summary.
   Commit `src/react/generated/data.ts` as the build rewrote it.

5. Commit with a conventional header, lower case after the colon and at most
   100 characters (`feat(resume): lead qa with the android launch test`).
   Push that one branch, open the PR and label it `jobs-patch`. Its body
   follows `.github/pull_request_template.md`. It also names the posting
   that asked for the change, by title and company, and the digest day and
   pick id. For each new or reworded line it quotes the source it restates,
   with its file and line. Its Superseded section is "None: the composition
   is edited in place."
6. Put the PR's number in that pick's `pr`. Never merge it, never push to it
   again, and never touch any other branch or PR.

## 7. The kit

The kit is what I paste into the posting's own application form, so read that
form first. A form mixes its own questions with standard rows (name, email,
phone, résumé, links, location). A **question** here is only one of the
form's own that wants prose in my words; the standard rows are fields or
mine to type, and a choice or a short fact ("How did you hear about us?") is
an answer when the evidence settles it. Each board serves its form apart from
the posting:

- **Greenhouse:**
  `https://boards-api.greenhouse.io/v1/boards/<board>/jobs/<id>?questions=true`.
  Each entry of `questions` has a `label`, `required` and `fields[]`. Its own
  questions are those whose field `name` starts `question_`; one is free text
  when that field is a `textarea`, or an `input_text` that asks for prose
  rather than a link or a fact. The `cover_letter` entry is the cover letter.
  Skip `location_questions`, `compliance` and `demographic_questions`.
- **Ashby:** `POST https://jobs.ashbyhq.com/api/non-user-graphql?op=ApiJobPosting`
  with `content-type: application/json` and this body, the posting's board
  name and id filled in:

  ```json
  {
    "operationName": "ApiJobPosting",
    "variables": {
      "organizationHostedJobsPageName": "<org>",
      "jobPostingId": "<id>"
    },
    "query": "query ApiJobPosting($organizationHostedJobsPageName: String!, $jobPostingId: String!) { jobPosting(organizationHostedJobsPageName: $organizationHostedJobsPageName, jobPostingId: $jobPostingId) { applicationForm { sections { fieldEntries { ... on FormFieldEntry { isRequired field } } } } } }"
  }
  ```

  Each entry's `field` has a `title`, a `type` and a `path`. Its own
  questions are those whose `path` is neither a `_systemfield_` nor `phone`;
  one is free text when it is a `String` or `LongText` that asks for prose
  (not a link such as "LinkedIn Profile"). `cover_letter` is the cover letter.

- **Lever:** the posting's `applyUrl` page (HTML). Its standard rows are the
  `<div class="application-label">` ones outside the cards; "Additional
  information" (`name="comments"`) is the cover letter. Its own questions are
  in each hidden input named `cards[<id>][baseTemplate]`, whose `value` is
  entity-escaped JSON: each of its `fields` has a `text`, a `type` and
  `required`; one is free text when it is a `textarea`, or a `text` that asks
  for prose (not a preferred name or a pronunciation). Read the questions there only, not
  their labels in the page as well.
- **A Hacker News post** has no form: leave the questions, the cover letter
  and the pay expectation out.

A form that can't be read leaves them out too; say so in the summary. Then:

- **Fields:** email, GitHub and portfolio from the identity block of
  `packages/ui/resume/src/data/resume.typ`, and location from `personal.typ`.
  Never a phone number or street address: I type those myself, so no row is
  labelled for them.
- **Answers:** work authorization ("Yes, for any employer") and sponsorship
  ("Not needed") when the form asks, and any other choice the form offers
  that the evidence settles. Add nothing the evidence doesn't say. Never
  answer pronouns, demographics or an EEO question.
- **Questions:** every free-text question the form asks, in `questions`, with
  its `label` as the form words it and `required` as the form marks it. Each
  required one gets a `draft`; an optional one gets one when the pick's fits
  answer it, else `draft: null`. A draft is at most `MAX_ANSWER_WORDS` (150),
  or the form's own limit when it states a shorter one ("in 2–3 sentences").
- **Cover letter:** a `coverLetter` draft of at most `MAX_COVER_LETTER_WORDS`
  (250), only when the form takes one, as text or only as a file: I save the
  draft as one.
- **Compensation:** only when the form asks my pay expectation, which then
  goes here and not in `questions`, as the cover letter goes only in
  `coverLetter`. `ask` is a
  figure inside the posting's range, toward its top for a strong fit, or, when
  it states none, "Open to the range for this role". `why` says how, in a
  sentence.

Every draft is first person and built from the pick's `fits`, restating what
they say. It never claims a gap, a term in the pick's `dontClaim`, or one of
`FORBIDDEN_TERMS`, and never carries a phone number or address. The checker
holds each draft to its cap, every required question to a draft, every draft
to the terms above, and every draft and row to the contact details; the rest (a form's
shorter limit, first person, the gaps) is yours to hold.

## 8. Write it

1. Give each pick an `id`, unless "The résumé PR" (§6) already did: three
   letters of the company and four hex digits (`tid-7f2a`), unique in the
   digest. Never change one a PR already names.
2. Answer every scout read in step 2 in `scouts`, with the verdict, note, `rule`
   and `review` §3 to §5 gave it, and a scout that became a pick its
   `pickId` from step 1.
3. `read` names every Decisions and Scout file this run took in, from Drive or
   the mailbox, and `transcribed` every voice note it transcribed, by its file
   name. `redrafts` holds each
   redraft §2 wrote.
4. Save the digest as bare JSON to a scratch file and check it from the repo
   root (run `pnpm install` first if `node_modules` is missing):

   ```sh
   pnpm --filter @some-ui/job-desk build
   pnpm --filter @some-ui/job-desk check <file>
   ```

   It must print `[]`. Fix every finding and check again; never upload a
   digest with findings. A digest you can't make pass is not uploaded: the
   run stops (§9).

5. Upload it as `digest-<today>.json` into `some-ui jobs/Brief/`: bare JSON,
   `contentMimeType` `application/json`, `disableConversionToGoogleType`
   true. Confirm the result's mimeType is `application/json` and its fileSize
   equals the local file's byte count. If the upload fails, the run stops
   (§9): a digest that isn't in Drive doesn't go to the mailbox either.

6. If the mailbox is usable (§0.4), put the same bytes there, now that Drive
   has them. Use `--data-binary`, which sends the file exactly; `--data` strips
   its newlines:

   ```sh
   curl -sS --max-time 30 -X PUT \
     -H "Authorization: Bearer $JOBS_MAILBOX_TOKEN" \
     -H "Content-Type: application/json" \
     --data-binary @<file> -w '\n%{http_code}\n' \
     "$JOBS_MAILBOX_URL/v1/brief/items/digest-<today>.json"
   ```

   `201` (added) and `200` (unchanged) are both success. `409` means the
   mailbox already holds a different digest for today: say so in the summary,
   don't retry, and leave Drive as it is. Anything else: say so in the summary
   and carry on. After a `201` or a `200`, read it back; the two hashes must
   match, and if they don't, say so in the summary:

   ```sh
   curl -sS --max-time 30 -H "Authorization: Bearer $JOBS_MAILBOX_TOKEN" \
     "$JOBS_MAILBOX_URL/v1/brief/items/digest-<today>.json" | sha256sum
   sha256sum <file>
   ```

   The mailbox holds a name for good, with the bytes it was first given, so
   only a digest that passed step 4 and is in Drive (step 5) goes there.

Never edit, move, rename or trash anything under `some-ui jobs/`. Triage
`Inbox/` per the SOP if it holds anything.

## 9. The run record

Last, on every run, whatever happened, the run leaves one record in the
mailbox's `run` folder. It is how the phone says "couldn't finish" and why,
so it is written even when nothing else was. The shape is `JobsRunSchema` in
`src/run.ts`:

```json
{
  "schema": "some-ui.routine-run/1",
  "routine": "jobs",
  "startedAt": "2026-10-26T14:52:07Z",
  "finishedAt": "2026-10-26T15:01:40Z",
  "outcome": "partly",
  "found": { "postings": 7, "scouts": 1, "decisions": 2 },
  "added": [
    {
      "folder": "brief",
      "name": "digest-2026-10-26.json",
      "title": "2 picks from 7 postings"
    }
  ],
  "problems": ["One voice note couldn't be heard, so it waits for tomorrow."]
}
```

- `startedAt` is the time §0 noted; `finishedAt` is now, as you write it.
- `outcome` is `stopped` when no digest reached Drive (a stop in §0, a digest
  that wouldn't pass its check, a failed upload). It is `partly` when the
  digest reached Drive but something this run set out to do wasn't done: a
  file the checker turned down or whose bytes didn't match, a voice note
  that couldn't be transcribed, a form that couldn't be read, a résumé PR
  whose checks failed, the digest not reaching the mailbox. Otherwise it is
  `done`. Picking nothing is `done`: weak postings or full places are what
  the run found, not something it failed at.
- `found` is what the run read: `postings` is the digest's `seen` (0 when it
  searched nothing), `scouts` and `decisions` the new Scout and Decisions
  files it took in (§2).
- `added` is today's digest once it is in Drive, with a `title` saying in a
  few words what it holds ("2 picks from 7 postings", "No picks: your places
  were full"); empty when the run stopped.
- `problems` is empty for `done`, and otherwise says why, one plain sentence
  each, most important first: the phone shows the first one. Say what was
  or wasn't done in my terms, never how: no mailbox, status code, address,
  variable, file format or section of this file. "This session couldn't
  search the web, so there are no picks today." "Today's picks were already
  in Drive, so this run added none."

1. Save it as bare JSON to a scratch file named `run-jobs-<stamp>.json`,
   the stamp being `startedAt` without its `-` and `:`
   (`run-jobs-20261026T145207Z.json`, `runFileName`). Check it from the repo
   root, as §8 checks the digest:

   ```sh
   pnpm --filter @some-ui/job-desk build
   pnpm --filter @some-ui/job-desk check <scratch>/run-jobs-<stamp>.json
   ```

   It must print `[]`; fix every finding and check again. A record that
   can't be made to pass isn't put: say so in the summary.

2. If §0.4 hasn't run (the run stopped before it), run its check now. If the
   mailbox is usable, put the record, once:

   ```sh
   curl -sS --max-time 30 -X PUT \
     -H "Authorization: Bearer $JOBS_MAILBOX_TOKEN" \
     -H "Content-Type: application/json" \
     --data-binary @<scratch>/run-jobs-<stamp>.json -w '\n%{http_code}\n' \
     "$JOBS_MAILBOX_URL/v1/run/items/run-jobs-<stamp>.json"
   ```

   `201` (added) and `200` (unchanged) are both success. Anything else, or a
   mailbox that isn't usable: say so in the summary, and don't retry. A run puts one record, under the name its
   start gives it, and never a second.

## 10. Summary

End with: the queue (each open pick with its digest day, which postings
closed, each pick that lapsed, and each track's free slots); each pick with its track, scores and
résumé; the PR this run opened, or why it opened none; how many postings
were set aside, by reason; what each new decisions file and voice note said;
each redraft, by its pick, or why a fit note got none; each
scout's verdict; the calibration note, once there are enough outcomes; the
mailbox (whether the digest was added, was already there or was refused, and
why; the files taken in from it; any name whose bytes differed from Drive's; or
that it was skipped, and why); the run record (its outcome and problems, and
whether the mailbox took it); and anything skipped, with why.
