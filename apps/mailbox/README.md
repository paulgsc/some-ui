# @some-ui/mailbox

A Cloudflare Worker and a D1 database where the cloud routines and the home server leave each
other files. For the Jobs wing: the daily **digest** (`brief`), the phone's **decisions**
(`decisions`) and its **scouts** (`scout`). For study: the reflections routine's **word sets**
(`scene`) and **dramas** (`drama`), which home serves to the phone, and a **run record** for
each of the routine's runs (`run`): what it found and added, so the phone can say when the
routine last ran and whether it brought anything new. Home leaves it which of those lessons the
phone opened (`opened`), names only, so it keeps three ready. For LeetType: the **session
files** a routine writes (`leetype`), which home serves to the phone, and
each finished session's **log** as home holds it (`leetype-log`), so a routine can read how the
sessions went. For voice notes: what home heard in each one (`transcript`), text only, so the
routines read it instead of hearing the audio themselves. For the routines' bookkeeping: an
**index** per routine (`index`), which home computes from what it holds after each pass (for
the Jobs routine, the queue, what is new since the last digest and each waiting note's newest
transcript), so a routine reads it instead of rebuilding it. The index is a view of what home
keeps, so only the latest of each routine's stays. For the reflections routine: each **written
reflection** home keeps (`reflection`), its text only, and each **drama prompt** (`prompt`),
the next scene's prompt as the phone asked for it, its markdown only. Each side reaches it with
its own token, so the files move between them without a hand-carried step.

## Why it exists

The Jobs routine runs in the cloud at 07:52 Pacific. It cannot reach the home server, which
answers only on the home network. Home can make outbound requests, so both sides meet here:

```
cloud routine ──PUT brief──▶ [ mailbox ] ◀──GET brief── home ◀── phone (while Jobs is open, at home)
cloud routine ◀─GET decisions, scout── [ mailbox ] ◀──PUT decisions, scout── home ◀── phone
cloud routine ──PUT scene, drama, run──▶ [ mailbox ] ◀──GET scene, drama, run── home ◀── phone (Korean study)
cloud routine ◀──GET opened── [ mailbox ] ◀──PUT opened── home ◀── phone (a lesson opened)
cloud routine ──PUT leetype──▶ [ mailbox ] ◀──GET leetype── home ◀── phone (LeetType sessions)
cloud routine ◀──GET leetype-log── [ mailbox ] ◀──PUT leetype-log── home ◀── phone (Send to home)
cloud routine ◀──GET transcript── [ mailbox ] ◀──PUT transcript── home ◀── phone (a voice note)
cloud routine ◀──GET index── [ mailbox ] ◀──PUT index── home (after each pass, when it changed)
cloud routine ◀──GET reflection── [ mailbox ] ◀──PUT reflection── home ◀── phone (a written reflection)
cloud routine ◀──GET prompt── [ mailbox ] ◀──PUT prompt── home ◀── phone (Ask for the next scene)
```

The phone talks to home only. The mailbox carries no audio: home keeps the audio
(`docs/identity.md` in `paulgsc/server`, invariant 23; paulgsc/server#461), hears it on its own
CPU, and puts only the text here. Drive stays in use alongside this until the owner retires it.

## What it keeps

One row per file, in the folder it belongs to. A name holds one body for good: putting the
same bytes again changes nothing, and putting other bytes under a held name is refused, even
after the file is archived. Each row records who put it (`routine` or `home`), when, and the
SHA-256 of its bytes.

The one exception is home's index (`index`). It is a view home recomputes from the records it
keeps, not a record (owner, 2026-10-31, [paulgsc/server#509](https://github.com/paulgsc/server/issues/509#issuecomment-6547096403)), so the
mailbox keeps only the newest of each routine. When home puts a new one, the ones before it go
in the same transaction, and an index older than the live one is not taken (`409`). Nothing
archives an index, and the routine cannot ask for an old one.

### Archiving: home keeps the record, the mailbox stays small

The mailbox is where the routine and home meet, not where the record lives: home keeps that.
So a file that has been live for a long time moves home, and the mailbox keeps only a row
about it (owner, 2026-10-23):

1. Home's `archive` token reads the file and home stores its bytes (`mailbox_archive` in
   `paulgsc/server`).
2. Home then asks the mailbox to archive it, naming the bytes it holds by their SHA-256
   (`DELETE` with `If-Match`). The mailbox moves the file's metadata into `archived` and drops
   its bytes in one transaction. A file goes only once it has been live for 30 days
   (`ARCHIVE_MIN_AGE_DAYS`); home's own policy waits longer.
3. Reading an archived file answers `410` with when it was archived, and `GET
/v1/:folder/archived` lists them. When the routine wants one again it asks
   (`PUT /v1/:folder/wanted/:name`). On its next pass (within 15 minutes) home puts the same
   bytes back under a new `seq`, and the ask closes. Only the archived bytes can go back.
   A file put back counts its 30 days again from its return.

Nothing is deleted for good: the bytes are home's before the mailbox lets them go, and the
`archived` row stays.

A written reflection (`reflection`) and a drama prompt (`prompt`) are archived the same way,
except that home lists each folder only once a file it put there is old enough, and the routine
cannot ask for one back (see "Who may do what"). Home's index is not archived (above, "What it keeps"): home can compute
the same bytes again from what it keeps.

## API

Every request needs `Authorization: Bearer <token>`. Every answer is JSON, or the stored bytes.

| Request                                                  | Answer                                                                                                                                                                                                                                                                                                                                                  |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /v1/:folder/items?after=<seq>&limit=<n>`            | `200 {"items":[{"seq","name","size","sha256","contentType","putAt","liveSince"}]}`, live files only, oldest first, `seq > after` (default 0), `limit` 1–50 (default 50). Metadata only. A whole number outside those bounds is `422`. `liveSince` is when it was put back from home, else `putAt`.                                                      |
| `GET /v1/:folder/items/:name`                            | `200` with the stored bytes, `Content-Type` as stored and `ETag: "<sha256>"`; `410 {"error":"archived","archivedAt"}` if it moved home; `404` if never held.                                                                                                                                                                                            |
| `PUT /v1/:folder/items/:name` (body = the file's bytes)  | `201 {"change":"added","seq"}`; `200 {"change":"unchanged","seq"}` for the same bytes; `409 {"error":"conflict"}` for other bytes under a held name, or `409 {"error":"a newer index of this routine is held"}` for an index older than the live one; `413` when the body is over the cap; `422 {"error":"…why…"}` when the name or content is refused. |
| `PUT /v1/:folder/items/:name` by `archive`               | Puts an archived file's own bytes back: `201 {"change":"restored","seq"}`; `200 {"change":"unchanged","seq"}` if it is live; `409` for other bytes; `404` if never archived. The body is checked as any put's is.                                                                                                                                       |
| `DELETE /v1/:folder/items/:name`, `If-Match: "<sha256>"` | Archives it: `200 {"change":"archived"}`, or `"unchanged"` if it already was; `412` if the live bytes are other ones; `422` if it has been live under 30 days; `404` if never held; `428` without a lower-case hex `If-Match`.                                                                                                                          |
| `GET /v1/:folder/archived?after=<seq>&limit=<n>`         | `200 {"items":[{"seq","name","size","sha256","contentType","putAt","archivedAt"}]}`, oldest first by the `seq` each had while live. Paged as above.                                                                                                                                                                                                     |
| `PUT /v1/:folder/wanted/:name` (no body)                 | Asks home to put an archived file back: `202 {"change":"asked"}`; `200 {"change":"unchanged"}` if already asked; `200 {"change":"live"}` if it is there now; `404` if never archived.                                                                                                                                                                   |
| `GET /v1/:folder/wanted?limit=<n>`                       | `200 {"items":[{"name","askedAt"}]}`, the open asks, oldest first.                                                                                                                                                                                                                                                                                      |
| anything else                                            | `404`; a method the path does not take is `405` with `Allow`. A missing or wrong token is `401`, a token that may not do this is `403`, and storage failing is `503`.                                                                                                                                                                                   |

The folders are `brief`, `decisions`, `scout`, `scene`, `drama`, `run`, `opened`, `leetype`,
`leetype-log`, `transcript`, `index`, `reflection` and `prompt`.

**`seq` only grows, and it has gaps.** SQLite hands out a number for every put that reaches the
table, including a put of a name already held (`unchanged` or `conflict`), which stores nothing.
So after a few repeats the next new file can jump ahead (for example `seq 1`,
then six repeats, then `seq 8`). Page with `after` set to the highest `seq` you have seen, never
`after + 1`.

### Who may do what

| Secret          | Role      | May                                                                                                                                                                      |
| --------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ROUTINE_TOKEN` | `routine` | read every folder; put `brief`, `scene`, `drama`, `run` and `leetype`; list what is archived and ask for it back, in every folder but `index`, `reflection` and `prompt` |
| `HOME_TOKEN`    | `home`    | read `brief`, `scene`, `drama`, `run` and `leetype`; put `decisions`, `scout`, `opened`, `leetype-log`, `transcript`, `index`, `reflection` and `prompt`                 |
| `ARCHIVE_TOKEN` | `archive` | read every folder; archive a file, put an archived one back and list the open asks, in every folder but `index`                                                          |

The routine role is every scheduled routine's: the Jobs digest, the study reflections and,
once it is scheduled, the LeetType review each put to their own folders.

The routine cannot list archived reflections or ask one back. Home holds every reflection it
puts (`written_reflection` in `paulgsc/server`), so it archives one by what it put, listing the
folder only once one is old enough, and never answers an ask for it: a pass with nothing to do
then makes no request for `reflection` at all. A reflection archived before the routine
answered it is no longer offered to the routine; home still keeps it. Home holds every drama
prompt it puts too (`drama_prompt` in `paulgsc/server`).

Home holds two tokens. `archive` is apart from `home` so the token home uses every pass cannot
drop a byte. A secret that is unset or empty authenticates no one, and one value set for two
roles authenticates no one. Letting the phone read `brief` from here directly would be another
role, and it is the owner's call, so it is not built.

### What a put must satisfy

- **Name**, anchored to its folder: `brief` takes `digest-YYYY-MM-DD.json`, and, from the
  routine's one-time backfill (MB2, below), a pre-mailbox `decisions-YYYY-MM-DD.json`,
  `decisions-YYYY-MM-DD-<n>.json` (`<n>` from 2 to 99, no leading zero, as the phone numbers
  a later share that day) or `scouts-YYYYMMDDTHHMMSS.json` (a time on the clock) under its
  Drive name, only for a real calendar day from 2026-10-17, the first day the phone could
  share one, through 2026-10-22, the day before the mailbox opened, and each with its own
  schema (`some-ui.job-decisions/1` or `some-ui.job-scouts/1`); `decisions` takes
  `decisions-YYYY-MM-DD.json` or `decisions-YYYY-MM-DD-<n>.json`; `scout` takes
  `scouts-YYYYMMDDTHHMMSS.json`; `scene` takes `scene-<reflection>.json` or
  `scene-<reflection>-<n>.json`, named for the reflection it answers
  (`YYYY-MM-DD_<session>_<id>`, which two reflections can share); `drama` takes `drama-<stamp>.json`,
  named for its prompt (`drama-YYYYMMDDTHHMMSSmmmZ`); `run` takes
  `run-<routine>-YYYYMMDDTHHMMSSZ.json`, named for the routine (lower-case letters) and when the
  run started, in UTC; `opened` takes `opened-YYYYMMDDTHHMMSSmmmZ.json`, named for when home
  filed it; `leetype` takes `t<thread>-<NN>-<slug>.json`, the name the Drive SOP gives a
  session file (a slug of lower-case words joined by `-`, so a fix's `-r2` fits it); and
  `leetype-log` takes `log-<session>.json`, named for the phone's id for the session (1 to 64
  letters, digits, `-` or `_`, as home's log takes it), or `log-<session>.r<n>.json` for a
  later copy of a session home holds more of; and `transcript` takes
  `transcript-<note>-<n>.json`, named for the note's id (1 to 64 letters, digits, `-`, `_`, `.`
  or `:`, as home's `PUT /api/v1/voice-notes/:id` takes it, sent unencoded: the Worker does not
  decode `%3A`) and `<n>`, home's number for that transcript, from 1 with no leading zero. `<n>`
  must differ for every transcript of the note across every model (home decides it once, as the
  note's next, when it files the transcript; never its `attempt`, which starts again at 1 for
  each model), so a better model's transcript goes under a new name rather than meeting a `409`,
  and the highest `<n>` is the newest; and `index` takes `index-<routine>-YYYYMMDDTHHMMSSmmmZ.json`,
  named for the routine (lower-case letters) and when home computed it, in UTC to the
  millisecond, so each change goes under a new name, the greatest name is the newest, and the
  folder holds one per routine; and `reflection` takes `reflection-<id>.json`, named for the
  phone's id for the written reflection (1 to 64 letters, digits, `-` or `_`, as home's
  `PUT /api/v1/routine/reflections/:id` takes it); and `prompt` takes
  `drama-YYYYMMDDTHHMMSSmmmZ.prompt.json`, named for the prompt's stamp as the phone names it
  (the moment it was asked for, in UTC to the millisecond, as home's
  `PUT /api/v1/routine/prompts/:stamp` takes it), so the drama that answers it is the
  `drama` folder's `drama-<stamp>.json`.
  Anything else, an audio file's name included, is `422`.
- **Content type** `application/json` (parameters such as `charset` are ignored), and the body
  must be UTF-8 JSON with no byte-order mark.
- **Schema**: the top-level `schema` must be `some-ui.job-digest/1`, `some-ui.job-decisions/1`,
  `some-ui.job-scouts/1`, `some-ui.routine-scene/1`, `some-ui.routine-drama/1`, `some-ui.routine-run/1`,
  `some-ui.routine-opened/1`, `some-ui.leetype-session/1`, `some-ui.leetype-log/1`, `some-ui.voice-transcript/1`, `some-ui.routine-index/1`, `some-ui.reflection/1` or `some-ui.drama-prompt/1` to match the folder. The Worker checks that and nothing deeper, except for a transcript, an index, a reflection and a prompt (below); the readers validate the full shape.
- **A scene** is `{"schema":"some-ui.routine-scene/1","answers":"<reflection>","title":"<the
scene folder's name>","decks":[<read-aloud deck>,<lens deck>]}`, each deck exactly as the
  phone's word set check takes it. **A drama** is `{"schema":"some-ui.routine-drama/1",
"answers":"drama-<stamp>","tree":<the drama, as the phone's scene check takes it>}`. **A run**
  is `{"schema":"some-ui.routine-run/1","routine","startedAt","finishedAt",
"outcome":"done"|"partly"|"stopped","found":{…},"added":[{"folder","name","title"}],
"problems":["<a plain sentence>"]}`: what that run found, the files it put, and what it could
  not do. `routine` names the routine, as the file's name does, and decides what `found` counts:
  the reflections routine's (`{"reflections","prompts"}`, read by Topik's
  `adapter/routine-runs`) or the jobs routine's (`{"postings","scouts","decisions"}`, its
  `added` today's `brief`; `@some-ui/job-desk`'s `JobsRunSchema`, `ROUTINE.md` §9). The
  reflections routine's also carries `"voice":{"waiting","missed","unread"}`, what became of the
  voice notes in what it found (topik's `ROUTINE.md`, step 12). Each reader
  leaves out the other routine's runs. **An opened
  filing** is `{"schema":"some-ui.routine-opened/1","opened":["scene/<name>","drama/<name>"],
"at"}`: every listed lesson the phone had opened when it filed, as home builds it
  (paulgsc/server `PUT /routine/opened`). **A LeetType session** is
  `{"schema":"some-ui.leetype-session/1","file":<the session file, as the phone's session-file
check takes it>}`: the file itself has no `schema` key, so it travels wrapped. **A LeetType
  log** is `{"schema":"some-ui.leetype-log/1","session","file","events":[<every event of the
session, as home holds it>]}`: the events in their home form (paulgsc/server
  `docs/identity.md` invariant 18), so no spoken answer's ticks, nothing said or typed, and no
  audio. **A transcript** is `{"schema":"some-ui.voice-transcript/1","note","of","ref","at",
"text","language","model","heardAt","words"}`: the note's phone id (the id in its exported file name,
  `<base>_voice-<at>-<id>`, in a Jobs voice entry, and in a drama prompt's `notes` line), what
  it belongs to (`of` is `reflection` with `ref` its session, `jobs` with the pick or scout, `scene` with the drama prompt's
  stamp, or `studio` with a Studio take's `<project>:<shot>:<take>`), when it was recorded, what home heard, the language heard (Whisper's code, `en` or
  `ko`), the model that heard it, and when; and `words`, each word heard as
  `{"text","startMs","endMs","p","language"}`: its time in milliseconds from the note's start,
  how sure the model was of it, 0 to 1, and the language it was heard in (Whisper's code).
  `p` and `language` are left out where home has none for the word; a word's text has no
  length cap, since Whisper's word runs to the next space. `words` may be absent (a transcript
  filed before it was carried), holds at most 12,000 words, and takes no other key per word. Unlike the other folders, the Worker holds this
  shape itself, because the one thing a transcript must never be is audio: a body with any
  other key is `422`, a name that does not carry the body's `note` is `422`, and so is a body
  that carries audio or names a Drive file, with the reason (`a transcript carries no audio` or
  `a transcript names no Drive file`). That catches an extra key that names audio, bytes or
  base64, or a Drive or file id; and, anywhere in the body's text as sent (a key given twice
  included), a `data:<type>/<subtype>` URI, a Drive link, or a run of 256 or more base64
  characters once line breaks are taken out, longer than any id a transcript holds and longer
  than any word of speech. It cannot catch audio spelled some other way (a `\u`-escaped
  `data:`, say), or a bare Drive id in any field, which looks like any other id. **An index**
  is home's bookkeeping for one routine, deterministic from what home holds (paulgsc/server
  `mailbox::index`, paulgsc/server#509): the same rows give the same bytes, and home keeps no
  copy. Home puts a new one only when something it counts arrives or an open pick lapses: a
  new day alone moves nothing else, so a day with neither puts none. Its `routine` names the routine, as the file's
  name does; `jobs` is the only one so far. The Jobs index is
  `{"schema":"some-ui.routine-index/1","routine":"jobs","day","validThrough","asOf","from","skipped","queue","new","notes","picked"}`:
  `day`, the day in America/Los_Angeles home computed it on; `validThrough`, the last day its
  queue holds with nothing new arriving (the day before the first open pick no decision answers
  would lapse), or `null` when no open pick can lapse, so it stands from `day` through
  `validThrough`; `asOf`, when home last took in something it
  counts, or `null`; `from`, every digest, decisions and scouts file it was computed from, by
  name, and which of those decisions and scouts files came from the routine's backfill rather
  than from the phone (`{"digests","decisions","scout","backfill"}`); `skipped`, those that do not read as their schema;
  `queue`, as `@some-ui/job-desk`'s `queueOf` and `freeSlots` give it on `day`
  (`{"open":[{"day","pickId","track","fingerprint","title","company","applyUrl"}],"lapsed":[…],"free":{"software","adjacent"}}`);
  `new`, each decisions and scouts file no digest names in `read`, with the entries in it that a
  file some digest read already carried (`{"decisions":[{"name","repeats"}],"scout":[{"name","answered"}]}`);
  `notes`, each voice note a file names that no digest lists in `notesDone`, with the phone's id
  for it and the name and SHA-256 of its newest transcript here (`[{"file","in","note","transcript"}]`);
  and `picked`, every posting a digest picked or a decisions file names, by fingerprint.
  `packages/job-desk/ROUTINE.md` says how the routine reads it. The Worker holds its shape as it
  holds a transcript's: those keys and no other, a `day` that is a calendar day
  (`YYYY-MM-DD`, and `2026-02-30` is not one), a `validThrough` that is a calendar day no
  earlier than `day` or `null`, an `asOf` that is an
  instant or `null`, `from`, `queue` and `new` objects, `skipped`, `notes` and `picked` lists, a
  name that carries the body's `routine`, and no audio or Drive link, by the same tests, each
  refusal with its reason (`an index carries no audio` or `an index names no Drive file`).
  Nothing in it is audio or points at audio: notes are named by their file name and id, and
  transcripts by their name here.
- **A written reflection** is `{"schema":"some-ui.reflection/1","reflection","session","at","text"}`:
  the phone's id for it (which the name carries), the session it is about (the phone's id for
  it, as a reflection transcript's `ref` names it), when it was written, and the typed line.
  That is the routine's minimum (paulgsc/some-ui#2174, decision D2): no answer to the one-tap
  questions, no time into the session, no session name, no audio. The Worker holds this shape
  itself, as it holds a transcript's: every key is required, any other key is `422`
  (`a reflection carries no audio: a spoken one goes as its transcript` when it names audio,
  `a reflection names no Drive file` when it names Drive), a name that does not carry the
  body's `reflection` is `422`, and so is a body whose text as sent carries a `data:` URI, a
  Drive link or a run of 256 or more base64 characters, by the transcript's tests.
- **A drama prompt** is `{"schema":"some-ui.drama-prompt/1","prompt","text"}`: the prompt's
  stamp (`drama-YYYYMMDDTHHMMSSmmmZ`, which the name carries) and the next scene's prompt as
  the phone wrote it, the markdown a Drive share carried as `drama-<stamp>.prompt.md`: the
  note for an agent, the line naming each scene note's id, and the tree prompt with its
  request and the last drama. That is the routine's minimum (paulgsc/some-ui#2174, decision
  D2): no audio and no Drive link. A scene note is named by its id only; what home heard in
  it is its `transcript`. The Worker holds this shape itself, as it holds a reflection's:
  every key is required, and any other key is `422`. One that names audio is refused with
  `a prompt carries no audio: its scene notes go as their transcripts`, and one that names
  Drive with `a prompt names no Drive file`. A name that does not carry the body's `prompt` is `422`, and so is a body whose text
  as sent carries a `data:` URI, a Drive link or a run of 256 or more base64 characters, by
  the transcript's tests. A prompt is about 40 KB today, most of it the tree prompt; home
  takes one of at most 256 KiB of text, so a file is well under the cap.
- **Size**: at most 1,048,576 bytes. A declared `Content-Length` over that is refused before
  the body is read, and a body that declares nothing is cut off as it passes the cap. Real
  files are under 20 KB, except LeetType session files: Thread 1's first file is 30 KB
  for two rounds, and the ten-round draft was 140 KB. A Jobs index grows with what it names
  for good (`from` and `picked`: a file name or a fingerprint, tens of bytes, for every file
  and pick), so a few hundred bytes a day; only the latest is kept, and home puts none over
  the cap.

## Limits

This runs on the Workers Free plan and D1 Free plan. Past a daily limit the plan fails the
operation; it does not bill (see MB4).

- Workers Free: 100,000 requests a day, 10 ms of CPU per request.
- D1 Free: 500 MB a database, 100,000 rows written and 5 million read a day, 2,000,000 bytes
  a row, 50 queries per invocation. Each request here uses at most five (an archive or a put
  back runs its statements as one batch, then reads why it changed nothing, when it did not).
  Archiving keeps the database to the files of the last few months; at a few KB a day it
  would take decades to fill without it.
- Past a D1 daily limit its queries fail until 00:00 UTC; the Worker answers `503` for
  that time. The 07:52 Pacific run is far from that reset.
- D1 hands a BLOB back as an array of byte values, so reading a body near the 1 MiB cap costs
  CPU. I have not measured whether it fits in 10 ms; files are far below it in practice
  (the sizes are under "What a put must satisfy").

A missing or wrong token is answered before any query runs, so a request without a token does
not spend D1 quota.

## Gray-area invariants

Each is written for review, one hunk at a time (`REVIEW.md`; `CLAUDE.md`, "Gray-area
invariants"). One line of each is in the doc comment of `src/core.ts`. The sections below say
how each was checked when this workspace landed.

**MB1 (retired): An item never changes, and leaves `item` only into `archived`.**

- _Claim:_ in `apps/mailbox`, no source file or migration updates or replaces an `item` row;
  the only statement that deletes one is the archive's, which names only items whose row
  `archived` already holds with the SHA-256 the request named in `If-Match`; and an archived
  name never takes other bytes. The adapter writes `item` with an `INSERT … ON CONFLICT
(folder, name) DO NOTHING` (a put adds nothing under an archived name, in the same
  statement) and that `DELETE`. `item` carries three triggers: `BEFORE UPDATE` aborts;
  `item_leaves_only_into_archived` aborts a `DELETE` unless `archived` holds a row with the
  item's `seq`, folder, name and SHA-256; `item_keeps_an_archived_name` aborts an `INSERT`
  of other bytes under an archived name. `archived` and `restored` carry triggers that abort
  every `UPDATE` and `DELETE`. The only other delete is of an answered ask in `wanted`, and
  the only insert into `archived` is the archive's.
- _Falsified by_ a hunk that drops, renames or weakens any of those triggers (a later
  migration that drops a trigger or one of the tables included, other than `0003_folders.sql`'s
  rebuild, which recreates them); that deletes or moves the
  migrations that create them, or changes `migrations_dir` in `wrangler.jsonc` so they no
  longer apply; that adds an `UPDATE`, `INSERT OR REPLACE`, `REPLACE INTO` or
  `ON CONFLICT … DO UPDATE` against `item`, `archived` or `restored`, a `DELETE` other than
  the two in `store.ts`, or an `INSERT INTO archived` other than `ARCHIVE_SQL`, anywhere in
  `src/` or `migrations/`; that changes `put`'s `INSERT_SQL` away from `DO NOTHING` or drops
  its `NOT EXISTS (… archived …)` condition; that drops the `sha256 = ?3` condition from
  `ARCHIVE_SQL` or `DROP_BYTES_SQL`, drops the latter's `seq IN (SELECT seq FROM archived …)`,
  or runs the two outside one batch; that lets `archive` in `core.ts` pass anything but the
  `If-Match` hash as that SHA-256; that rebuilds `item` again other than as `0003_folders.sql`
  does (every row and seq copied, the sequence carried past every archived seq, all three
  triggers recreated in the same migration); or that deletes or loosens the trigger cases, the
  rebuild test or the scan in `__tests__/store.test.ts`.
- _Scope:_ `apps/mailbox`.
- _Why not enforced:_ the triggers and `store.test.ts` enforce `UPDATE` and `DELETE` (each case
  fails if its trigger is removed). They do **not** enforce `INSERT OR REPLACE`: SQLite runs the
  delete trigger for the row a `REPLACE` removes only when `recursive_triggers` is on, and it is
  off by default. I checked this on SQLite 3.49.1 through sql.js: `INSERT OR REPLACE` replaced
  the row (seq 1 became 2, the hash changed) and neither trigger fired. I have not checked
  D1 itself. So in the database the `REPLACE` half rests on this falsifier. In the code, a
  test in `store.test.ts` scans the comment-stripped `src/*.ts` and every migration for those
  statements and for a dropped trigger; it cannot see SQL built at run time or typed into
  Cloudflare's dashboard, and a type cannot see SQL at all. Closing it in the database would take a `BEFORE INSERT`
  guard on every held name and a `put` that reads before it writes, which changes the table's
  design (`item_keeps_an_archived_name` guards archived names only). The owner
  chose to leave the gap (2026-10-21) rather than add that guard, so a hunk that adds a
  `REPLACE` is what a reviewer is watching for, and it is a violation if one lands.
- _Checked at landing:_ the only SQL in `src/` is the one `INSERT … DO NOTHING` and four
  `SELECT`s in `store.ts`; the words UPDATE, DELETE and REPLACE appear there only in comments.
  _Checked at the 2026-10-23 amendment (archiving, the owner's decision):_ `store.ts` has two
  `DELETE`s (the archive's on `item`, and an answered ask on `wanted`), no `UPDATE` or
  `REPLACE`, one `INSERT INTO archived` (`ARCHIVE_SQL`), and every `INSERT` is `DO NOTHING`
  or a plain insert into `restored`; each of the seven triggers has a case in
  `store.test.ts` that fails without it. _Checked at the rebuild (`0003_folders.sql`,
  2026-10-23):_ after every migration `item` has the same three triggers; the rebuild test
  keeps every row and seq and carries the sequence past archived seqs, with items live, with
  none live, and on a table never used; and workerd's D1 (`wrangler d1 migrations apply
--local`) applied it with the same result. Remote D1 was not tried: if it refuses the
  `sqlite_sequence` update, the migration rolls back whole and nothing changes.
- _Retired:_ 2026-10-31, when the owner decided home's index is a view, not a record
  ([paulgsc/server#509](https://github.com/paulgsc/server/issues/509#issuecomment-6547096403)):
  an index now leaves `item` with no `archived` row once a newer one of its routine is live,
  so "only into `archived`" no longer holds. MB5 (below) carries the claim with that
  exception; everything MB1's checks found above still holds outside the `index` folder.

**MB5: An item never changes, and leaves `item` only into `archived`, or, for home's index, once a newer one of its routine is live.**

- _Claim:_ in `apps/mailbox`, no source file or migration updates or replaces an `item` row;
  the only statements that delete one are the archive's, which names only items whose row
  `archived` already holds with the SHA-256 the request named in `If-Match`, and an index
  put's, which drops only the `index` items of the put's routine older than the newest
  (`DROP_OLDER_INDEXES_SQL`, in the same batch as the put); and an archived name never takes
  other bytes. The adapter writes `item` with an `INSERT … ON CONFLICT
(folder, name) DO NOTHING` (a put adds nothing under an archived name, in the same
  statement) and those `DELETE`s. `item` carries three triggers: `BEFORE UPDATE` aborts;
  `item_leaves_only_into_archived` aborts a `DELETE` unless `archived` holds a row with the
  item's `seq`, folder, name and SHA-256, or the item is in `index` and a greater-named
  `index` item of the same routine (the name less its last 24 characters) is live;
  `item_keeps_an_archived_name` aborts an `INSERT`
  of other bytes under an archived name. `archived` and `restored` carry triggers that abort
  every `UPDATE` and `DELETE`. The only other delete is of an answered ask in `wanted`, and
  the only insert into `archived` is the archive's.
- _Falsified by_ a hunk that drops, renames or weakens any of those triggers (a later
  migration that drops a trigger or one of the tables included, other than `0003_folders.sql`'s
  rebuild, which recreates them, and `0004_index_view.sql`, which recreates
  `item_leaves_only_into_archived` with the index's exception alone); that widens that
  exception past the `index` folder or past items a newer index of the same routine
  outranks, or changes `DROP_OLDER_INDEXES_SQL` likewise, runs it outside the put's batch, or
  runs it for another folder; that deletes or moves the
  migrations that create them, or changes `migrations_dir` in `wrangler.jsonc` so they no
  longer apply; that adds an `UPDATE`, `INSERT OR REPLACE`, `REPLACE INTO` or
  `ON CONFLICT … DO UPDATE` against `item`, `archived` or `restored`, a `DELETE` other than
  the three in `store.ts`, or an `INSERT INTO archived` other than `ARCHIVE_SQL`, anywhere in
  `src/` or `migrations/`; that changes `put`'s `INSERT_SQL` away from `DO NOTHING` or drops
  its `NOT EXISTS (… archived …)` condition; that drops the `sha256 = ?3` condition from
  `ARCHIVE_SQL` or `DROP_BYTES_SQL`, drops the latter's `seq IN (SELECT seq FROM archived …)`,
  or runs the two outside one batch; that lets `archive` in `core.ts` pass anything but the
  `If-Match` hash as that SHA-256; that rebuilds `item` again other than as `0003_folders.sql`
  does (every row and seq copied, the sequence carried past every archived seq, all three
  triggers recreated in the same migration); or that deletes or loosens the trigger cases, the
  rebuild test or the scan in `__tests__/store.test.ts`.
- _Scope:_ `apps/mailbox`.
- _Why not enforced:_ the triggers and `store.test.ts` enforce `UPDATE` and `DELETE` (each case
  fails if its trigger is removed). They do **not** enforce `INSERT OR REPLACE`: SQLite runs the
  delete trigger for the row a `REPLACE` removes only when `recursive_triggers` is on, and it is
  off by default. I checked this on SQLite 3.49.1 through sql.js: `INSERT OR REPLACE` replaced
  the row (seq 1 became 2, the hash changed) and neither trigger fired. I have not checked
  D1 itself. So in the database the `REPLACE` half rests on this falsifier. In the code, a
  test in `store.test.ts` scans the comment-stripped `src/*.ts` and every migration for those
  statements and for a dropped trigger; it cannot see SQL built at run time or typed into
  Cloudflare's dashboard, and a type cannot see SQL at all. Closing it in the database would take a `BEFORE INSERT`
  guard on every held name and a `put` that reads before it writes, which changes the table's
  design (`item_keeps_an_archived_name` guards archived names only). The owner
  chose to leave the gap (2026-10-21) rather than add that guard, so a hunk that adds a
  `REPLACE` is what a reviewer is watching for, and it is a violation if one lands.
- _Checked at landing (`0004_index_view.sql`, 2026-10-31, the owner's decision that the index
  is a view, not a record, [paulgsc/server#509](https://github.com/paulgsc/server/issues/509#issuecomment-6547096403)):_
  `store.ts` has three `DELETE`s (the archive's and `DROP_OLDER_INDEXES_SQL` on `item`, and an
  answered ask on `wanted`) and still no `UPDATE` or `REPLACE`; `DROP_OLDER_INDEXES_SQL`
  returns the names it drops, so a put learns it was superseded from its own batch; after
  every migration `item` has the same three triggers; `store.test.ts` has a trigger case that
  lets an index go only while a newer one of its routine is live, and runs the index put
  against the in-memory store and the adapter alike. The rest is as MB1's last check found it.

**MB2: Roles.**

- _Claim:_ the `ROLES` table in `src/core.ts` is the only place a token is mapped to what it
  may do, and it holds exactly three roles: `routine` (get every folder, put `brief`, `scene`,
  `drama`, `run` and `leetype`, ask every folder but `index`, `reflection` and `prompt`), `home`
  (get `brief`, `scene`, `drama`, `run` and `leetype`, put `decisions`, `scout`, `opened`,
  `leetype-log`, `transcript`, `index`, `reflection` and `prompt`) and `archive` (get every folder, move
  every folder but `index`; owner, 2026-10-23, and `scene` and `drama` the same day; `run` and
  `opened` 2026-10-24; `leetype` and `leetype-log` 2026-10-24 too; `transcript` 2026-10-25;
  `index` 2026-10-31, paulgsc/server#509, and kept out of `ask` and `move` the same day, since
  it is a view and not a record; `reflection` 2026-10-26, paulgsc/some-ui#2174 decision D2, and
  kept out of `ask` so home lists nothing of it while nothing is due; `prompt` the same day
  and decision, paulgsc/some-ui#2179, kept out of `ask` for the same reason). The routine's `brief` also takes its one-time backfill: a Jobs decisions or
  scouts file under its Drive name, only as the phone names one (`sharedDay`: a real calendar
  day, a decisions share number from 2 to 99, a scouts stamp at a real time) and only for a
  day from 2026-10-17, when the phone could first share one, through 2026-10-22, the day
  before the mailbox opened (`FOLDERS`' `backfill`, `FIRST_SHARED`, `MAILBOX_OPENED`), so the
  files it can add there are a closed set. Every request passes `authenticate` and then one of `serve`'s
  `may(grant.get | put | ask | move)` checks before anything reaches the store.
- _Falsified by_ a hunk that adds, removes or renames a role; adds a folder to, or removes one
  from, any role's `get`, `put`, `ask` or `move` list; changes which secret a role reads, or
  lets `authenticate` read another secret or accept an unset, empty or shared one; edits,
  loosens or removes a `may` check in `serve`, or changes which right a listing or method is
  checked against; lets `handle` reach `serve` or the store without a grant; adds a method to
  a route in `METHODS`; renames, moves or deletes the `ROLES` table; or adds a `backfill`
  folder to any folder, loosens `SHARED_NAMES` or `sharedDay`, moves `FIRST_SHARED` or
  `MAILBOX_OPENED`, or lets `kindOf` take a backfill name `sharedDay` does not read or for a
  day outside them; when the PR description does not name the owner's decision to do so.
- _Scope:_ `apps/mailbox/src/core.ts` and `wrangler.jsonc`.
- _Why not enforced:_ `__tests__/core.test.ts` pins today's matrix (every role against every
  folder and method), but a hunk that changes the table and the test together passes it. A test
  cannot know the owner agreed.
- _Checked at landing:_ `ROLES` has two entries; no code outside `authenticate` reads a token;
  `serve` has one `grant.get` check and one `grant.put` check, each returning `403`; `handle`
  calls `serve` only with a non-null grant. _Checked at the 2026-10-23 amendment:_ `ROLES`
  has three entries; every branch of `serve` that reaches the store passes a `may` check that
  returns `403`; `core.test.ts` pins every role against every collection. _Checked at the scene and
  drama amendment (2026-10-23):_ `ROLES` has three entries; `core.test.ts` pins `scene` and
  `drama` for every role: the routine puts, reads, lists archived and asks, home reads and
  may not put, and only the archive role archives. _Checked at the run amendment
  (2026-10-24, the owner's ask that the routine say when it ran and what it added):_ `ROLES`
  has three entries; `core.test.ts` pins `run` as it pins `scene` and `drama`. _Checked at the
  opened amendment (2026-10-24, the owner's choice that the routine keep three lessons ready):_
  `ROLES` has three entries; `core.test.ts` pins `opened`: home puts it and may not read it, the
  routine reads it and may not put it, and archive moves it. _Checked at the LeetType amendment
  (2026-10-24, the owner's choice that LeetType's session files and logs go through the
  mailbox, both folders):_ `ROLES` has three entries; `core.test.ts` pins `leetype` (the
  routine puts it, home reads it and may not put it) and `leetype-log` (home puts it and may
  not read it, the routine reads it and may not put it), and archive moves both. _Checked at
  the transcript amendment (2026-10-25, the owner's choice that home hears the voice notes and
  hands the routines text, paulgsc/server#460):_ `ROLES` has three entries; `core.test.ts` pins
  `transcript`: home puts it and may not read it, the routine reads it and may not put it, and
  archive moves it. _Checked at the index and backfill amendment (2026-10-31, the owner's HF7,
  paulgsc/server#509, "after each mailbox pass, home puts an index file per routine to the
  mailbox", and the decision on its asks,
  [paulgsc/server#509](https://github.com/paulgsc/server/issues/509#issuecomment-6547096403): "yes on 1 and 2, and
  let's go with the recommended option A for 3"):_ `ROLES` has three entries; `core.test.ts`
  pins `index`: home puts it and may not read it, and the routine reads it and may not put
  it; the routine's `ask` and the archive role's `move` are `RECORDS`, every folder but
  `index`, and `core.test.ts` pins that no role archives `index`, lists it as archived or
  asked for, or asks for it; `brief`'s `backfill` is the `decisions` and `scout` folders'
  own rules, taken only for a name `sharedDay` reads as a day from `FIRST_SHARED`
  (2026-10-17) to before `MAILBOX_OPENED` (2026-10-23), and `core.test.ts` pins the first
  and last days taken and the days either side, impossible dates and times, share numbers
  the phone never writes, the schemas, and that only the routine puts one. _Checked at the
  reflection amendment (the owner's decision D2 on paulgsc/some-ui#2174, 2026-10-26: written
  reflections reach the routine by the mailbox as the routine's minimum, as spoken
  transcripts do; paulgsc/some-ui#2178):_ `ROLES` has three entries; `core.test.ts` pins
  `reflection`: home puts it and may not read it, the routine reads it and may neither put
  it, list it as archived nor ask it back (`ASKED`, every record but `reflection`), and the
  archive role reads and moves it. _Checked at the drama prompt amendment (the same decision
  D2: drama prompts go to the mailbox as the routine's minimum; paulgsc/some-ui#2179):_
  `ROLES` has three entries; `core.test.ts` pins `prompt` as it pins `reflection`: home puts
  it and may not read it, the routine reads it and may neither put it, list it as archived
  nor ask it back (`ASKED`, every record but `reflection` and `prompt`), and the archive role
  reads and moves it.

**MB3: No token reaches the repo or a log.**

- _Claim:_ tokens exist only as Worker secrets; nothing committed holds one, and the single
  `console` call logs an error's message, never a request, a header or a body.
- _Falsified by_ a hunk that writes a token-like value into `wrangler.jsonc` (a `vars` entry,
  say) or any committed file; that adds a test fixture that looks like a real token (the tests'
  are `test-…`); that lets what `report` logs come from a request, a header or a body in a way
  the rule below cannot see (reassigning its parameter before the call, or a second function
  named `report`); that removes `.dev.vars` from this workspace's `.gitignore`, or deletes or
  moves that file; or that turns `log-guard/console-reports-message-only` off or narrows it, in
  this workspace's `eslint.config.js` or in `logGuardConfig`
  (`packages/eslint/src/configs/log-guard.config.ts`).
- _Scope:_ `apps/mailbox`.
- _Why not enforced:_ the logging half is a lint rule. `log-guard/console-reports-message-only`
  (`logGuardConfig` in `@some-ui/eslint-kit`, on in this workspace's `eslint.config.js`) fails any
  use of `console`, bare or read or destructured from `globalThis`, outside a function named
  `report`, and any argument of its call other than a string or the error's `message`;
  `no-console` still asks for a visible disable at the call. What stays a reading: whether a
  string committed anywhere is a real token (no secret scanner runs over this workspace), and
  whether an error's message can carry one.
- _Checked at landing:_ one `console` call (`src/index.ts`, `report`, the error's `message`);
  no `vars` in `wrangler.jsonc`; no token-shaped string in the workspace. _Checked when the rule
  landed (2026-10-25, #2042):_ `src/` passes it; `report` logging `String(error)` fails it.

**MB4 (not reviewable): The Cloudflare account has no payment method.** It is account state, so
no diff can show it. It is listed so a reviewer knows the cost model rests on it. With a card
on file, Workers or D1 use past the free limits can bill instead of failing. Confirming it is
step 1 of the deploy below.

## Deploy

There is no deploy workflow. Run the commands from the repo root: `pnpm --filter
@some-ui/mailbox exec wrangler …` runs this workspace's pinned wrangler inside `apps/mailbox`,
where `wrangler.jsonc` is (run `pnpm install` once first). A bare `npx wrangler` from the root
finds no config, so everything after step 2 needs it.

**Who runs it.** Setting it up (steps 1, 2 and 4) is the owner's: the account, the database and
the secrets. Updating it (below) can be done by a Claude cloud session in the owner's
environment, which carries `CLOUDFLARE_API_TOKEN` (a token with D1 Edit and Workers Scripts
Edit on the one account) and `CLOUDFLARE_ACCOUNT_ID`. So a session that merges a change to
this workspace runs the update itself rather than handing it to the owner. Such a session:

- checks first that both are set without printing them (`[ -n "$CLOUDFLARE_API_TOKEN" ]`), then
  runs `pnpm --filter @some-ui/mailbox exec wrangler whoami`;
- never runs `wrangler secret`, and never prints a token;
- after deploying, checks that each folder the routine reads answers `200` and prints only
  the status codes (`GET $JOBS_MAILBOX_URL/v1/<folder>/items?limit=1` with
  `JOBS_MAILBOX_TOKEN`).

`.claude/settings.json` lets `wrangler deploy` run without a prompt; `migrations apply` still
asks.

1. Create a Cloudflare account. **Add no payment method**, and confirm Billing lists none (MB4).
2. `npx wrangler login`, then `npx wrangler d1 create some-ui-mailbox`. Put the printed
   `database_id` into `wrangler.jsonc`. It is not a secret. Keep the binding named `DB`:
   wrangler's suggested snippet calls it `some_ui_mailbox`, which the Worker does not read.
3. `pnpm --filter @some-ui/mailbox exec wrangler d1 migrations apply some-ui-mailbox --remote`.
4. Make three long random tokens, for example `openssl rand -base64 32` three times, and run
   `pnpm --filter @some-ui/mailbox exec wrangler secret put ROUTINE_TOKEN` and the same with
   `HOME_TOKEN` and `ARCHIVE_TOKEN`. An `ARCHIVE_TOKEN` left unset only means nothing is
   archived.
5. `pnpm --filter @some-ui/mailbox exec wrangler deploy`, and note the URL,
   `https://some-ui-mailbox.<subdomain>.workers.dev`.
6. Smoke test with the routine's token:

   ```sh
   curl -i -X PUT -H "Authorization: Bearer $ROUTINE" -H "Content-Type: application/json" \
     --data '{"schema":"some-ui.job-digest/1"}' $URL/v1/brief/items/digest-2000-01-01.json   # 201
   ```

   Repeat it for `200 unchanged`. Send other bytes under that name for `409`. The item stays
   for good, which is fine: it is dated 2000.

### Updating a deployed mailbox

Run step 3 again, then step 5, from `origin/main`: `migrations apply` runs only the
migrations it has not applied, and a migration that fails is rolled back whole. Apply a new
migration before deploying the code that needs it: `0004_index_view.sql` (the index keeps only
the latest) must be in before the Worker whose index put drops the one before, or that put
fails with `503` until it is. For archiving (`0002_archive.sql`), also put `ARCHIVE_TOKEN` (step 4) and give the
same value to home as `MAILBOX_ARCHIVE_TOKEN`.

## Working on it

```sh
pnpm --filter @some-ui/mailbox lint        # eslint, prettier, tsc
pnpm --filter @some-ui/mailbox test
pnpm --filter @some-ui/mailbox knip
pnpm --filter @some-ui/mailbox deploy:dry  # bundles the Worker; needs no account
```

- `src/core.ts` is the request-to-answer logic with no I/O; `src/store.ts` is the storage port
  and the D1 adapter; `src/index.ts` only wires the bindings in.
- `core.test.ts` runs all of `core.ts` against an in-memory store. `store.test.ts` applies the
  real migration to real SQLite (sql.js) and runs one set of cases against the in-memory store
  and the D1 adapter, so the stand-in cannot drift from the real one.
- The tests use sql.js rather than `@cloudflare/vitest-pool-workers`: that pool needs
  `vitest ^4.1`, and this repo runs vitest 5.
