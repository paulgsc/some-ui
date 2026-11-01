# The daily reflections run

A scheduled task runs this every morning at 09:00 Pacific, in a fresh session
with the GitHub MCP tools, the mailbox (2a) and a checkout of
`paulgsc/some-ui`, and with the Google Drive connector when it has one. It
answers the study reflections the owner writes on their phone and the drama
prompts they ask for there, which home keeps and hands it through the Jobs
mailbox, and those the owner shared from their phone into Google Drive before.
For each study reflection: a scene of word sets, one to read aloud and one for
the grammar lens (part A), and a GitHub issue for anything it says about the
app (part C). For each drama prompt: a drama (part B). Each scene and drama
goes home through the mailbox, and home keeps it for the phone's "From the
routine" list. When fewer than three of the routine's lessons wait unopened on
the phone, it also writes stock scenes that answer no reflection (part D), and
every run leaves a record of itself in the mailbox (step 12), which the phone
shows as when the routine last ran and what it brought.

Home is the record of everything this run reads and writes: the reflections,
the prompts, the transcripts of their voice notes, and the scenes and dramas
that answer them. After each pass home leaves the reflections bookkeeping in
the mailbox as its index (2b); when it stands, the run reads it instead of
counting.

The run works in the mailbox (`curl`), the checkout, GitHub (the GitHub MCP
tools, `mcp__github__*`; load them with ToolSearch if they are deferred), and
Google Drive (the Google Drive connector) when it has it. It changes nothing in
the repo: no commits, no pushes, no PRs; the issues of part C are its only
GitHub writes.

**What still needs Drive, and why.** The run does its whole job without the
Drive connector except for these, and says in the summary which it couldn't
do:

- **Copies for refreshing away from home** (6a, 10a). Away from home the
  phone can't reach home, so "Open new words from storage" picks a scene's
  word sets from `Read aloud/sets`, and "Open a scene from storage" a drama
  from `Dramas/requests` (the owner's decision D4, paulgsc/some-ui#2183).
  Each copy is of a scene or drama home already holds. The run reads Drive
  for what the mailbox's live files don't give it (one asked back from home
  arrives after the run): a drama older than the live ones (step 8), and,
  while home's index doesn't stand, every deck under `Read aloud/` for step
  4's word ids, since a copy doesn't say whether home's scene is still
  live.
- **Reflections and prompts only Drive holds:** a phone on an APK without
  HF3 and HF4 shares them to `Study ledger/reflections` and `Dramas/requests`
  instead of sending them home, and Drive keeps each one shared there. A run
  without Drive leaves them waiting for one with it.
- **Scenes only Drive holds:** the routine's scene folders home doesn't
  (2b's `lacking`): scenes retired before the mailbox opened, and scenes
  whose folder an earlier run wrote and whose mailbox put failed. Their decks
  are read for word ids (step 4), and each answers the reflection its folder
  names. A run without Drive can't read them, so a word id it writes may
  already mean another word in one of them: it says so in the summary.
- **The `Inbox/` triage** (step 11).

The scheduled task's prompt points at this file, so a change to the run is a
reviewed change here. The decks' shape and length are `deck-prompt.md`'s
(step 2). When this file and that prompt disagree, the prompt wins and this file
is the bug.

## Before anything

First run `node -e 'console.log(new Date().toISOString())'` and keep what it
prints: it is when this run started (2b's `--now`, step 12's `startedAt`).

1. If this session has the Google Drive connector, find the Google Doc titled
   `README — Drive SOP` in My Drive (its parent is My Drive's root; ignore
   copies in Archive/) and read it before any Drive write; it is the rule for
   where files go and what they are named, and wins over this file on that.
   Its "Read aloud/" and "Dramas/" sections describe these jobs. Check every
   Drive result's owner is paulgathondudev@gmail.com; if one isn't, leave
   Drive alone for the rest of the run, as if the connector were missing, and
   say so in the summary. Without the connector, skip every Drive step in
   this file (each says "with Drive") and say so in the summary: what that
   leaves undone is "What still needs Drive" (above), and nothing else.

2. In the repo, on `origin/main`
   (`git fetch origin main && git checkout --detach origin/main`), run
   `pnpm install` from the repo root, then build what the checkers load:
   `npx turbo run build --filter="@some-ui/topik^..."` (topik's dependencies,
   under a minute). Then read this file, `packages/some-content/prompts/read-aloud-generator/index.md`
   (all of it), the deck prompt
   `packages/ui/topik/src/lib/topik/read-aloud/deck-prompt.md` (all of it: the
   practice, the context and its genres, the levels and how many lines each
   one's pool takes, the lens), `docs/makjang/README.md` ("The loop through the
   learner's drive"), the opening of `CLAUDE.md` ("What this repository is: two
   mandates") and its "The phone and the desktop web are separate surfaces",
   and `apps/mailbox/README.md` ("What a put must satisfy" and the API table).
   Where a repo doc names word-set files differently from the SOP, the SOP
   wins. The two loops through a learner's drive in those docs are for other
   learners (the owner's decision D5); this run answers the owner through
   home, and where they say a folder's description marks a reflection
   answered, this file says how this run tells.

2a. The mailbox. `JOBS_MAILBOX_URL` (no trailing slash) and
`JOBS_MAILBOX_TOKEN` are set in this environment. Check it once:

```sh
curl -sS --max-time 30 -o /dev/null -w '%{http_code}\n' \
  -H "Authorization: Bearer $JOBS_MAILBOX_TOKEN" \
  "$JOBS_MAILBOX_URL/v1/scene/items?limit=1"
```

`200` means it is usable. Use only `curl` with that `Authorization` header,
never print the token, and don't turn on shell tracing (`set -x`). If either
variable is unset or empty, or the check answers anything else (`401` is a
wrong token, `404` a mailbox not yet taking scenes, `000` no network), this run
can't reach home: write nothing anywhere, skip parts A to D, step 11 (the
`Inbox/` triage) and step 12, and say so in the summary. A scene or drama
Drive alone held would never reach the phone's list, since no step puts
Drive's files home, so what waits is answered by the next run that reaches
the mailbox.

To list a folder:

```sh
curl -sS --max-time 30 -H "Authorization: Bearer $JOBS_MAILBOX_TOKEN" \
  "$JOBS_MAILBOX_URL/v1/<folder>/items?after=0&limit=50"
```

and, for its archived files, the same with `archived` in place of `items`.
Each answer is `{"items":[{"seq","name","size","sha256","contentType","putAt","liveSince"}]}`,
oldest first; ask again with `after` set to the highest `seq` in the answer
until `items` is empty. An answer that is not that object means the mailbox
has failed: skip what needed that listing and say so in the summary.

2b. Home's index. If the mailbox is usable, list its `index` folder:

```sh
curl -sS --max-time 30 -H "Authorization: Bearer $JOBS_MAILBOX_TOKEN" \
  "$JOBS_MAILBOX_URL/v1/index/items?after=0&limit=50"
```

The mailbox keeps one index per routine, the newest: take the item whose name
starts `index-reflections-` (if a listing ever shows two, the greater name is
the newer). The index is home's view of what it holds, not a record, so there
is no older one to read or ask for. Fetch it from `index/items/<name>` as
"Voice notes" fetches a transcript, and check its `sha256`. A `404` means home
put a newer one since the listing: list again, once.

It stands for this run when it reads as a reflections index and the time this
run started is before its `validUntil` (or its `validUntil` is `null`). Don't
judge that by eye: save the index, and, with Drive, every scene folder in
`Read aloud/sets` and in each dated folder of `Read aloud/archive` (step 3
lists them; download nothing) as
`[{"name":"<folder name>","description":"<its description>"},...]` (without
Drive, `[]`), both in scratch files outside the checkout, and run, from
`packages/ui/topik`:

```sh
node scripts/stands.mjs --now <when this run started> <absolute path of the index> <absolute path of the folders>
```

Give it the start time you kept before step 1.

It prints `stands`, `why` (each reason it doesn't, in the owner's terms) and
`lacking`: the bases of the routine's scene folders Drive holds that home
doesn't ("What still needs Drive"). Only a folder an earlier run wrote
carries such a base, in its description (`answers: <base>` or
`stock: <base>`); this run writes none (6a), since each folder it writes is a
copy of a scene home holds. Without Drive, `lacking` is
empty because nothing was listed, not because home holds every scene.

When the index doesn't stand, or there is none, do the bookkeeping as written
below, from the mailbox (and, with Drive, from what only Drive holds), and say
why in the summary in the owner's terms ("Home hadn't caught up, so this run
counted the lessons itself"). When it stands, each step below says what it
replaces ("When home's index stands"). The run never redoes or second-guesses
what the index says. A name in the index's `skipped` is a file home couldn't
read: say so in the summary.

### Voice notes

Home hears the voice notes, and the run reads what home heard: never the
audio. Install no speech model and download no note's audio, in any part.
Each transcript is a file in the mailbox's `transcript` folder,
`transcript-<note>-<n>.json`, holding
`{"schema":"some-ui.voice-transcript/1","note","of","ref","at","text","language","model","heardAt"}`:
`note` is the phone's id for the note, and `language` is Whisper's code (`en`
or `ko`).

Once per run, list the folder, live and archived, as 2a says. Then:

- **A reflection's note** is an entry in `<base>.json` whose `kind` is `voice`
  (its audio, if the phone shared it, is the `<base>_voice-*` file the entry's
  `file` names); its `id` is the note's id. Its transcript is the live
  `transcript-<id>-<n>.json` with the highest `<n>`, compared as a number.
  For a session read from the mailbox (step 3), its spoken reflections are
  the live transcripts whose body has `"of": "reflection"` and whose `ref` is
  the session's id, one note per distinct `note` (the highest `<n>` of each),
  in the order of their `at`.
- **A drama prompt's scene notes** are named by its `Scene, spoken` line, in
  the order they were said (`drama-<stamp>.voice-<n>.<ext>`, in the order of
  `<n>`). The prompt names each one's id in a line under its agent note,
  `<!-- notes: {"<voice file name>":"<id>",...} -->` (the JSON between
  `notes: ` and ` -->`). Each note's transcript is found by its id, as a
  reflection's is. A prompt shared to Drive has the voice files beside it; a
  prompt read from the mailbox has none, and its notes are only these names
  and ids: never look for their audio.
- **A drama prompt shared before the phone named ids** has voice files beside
  it and no `notes` line. Their notes went home under the prompt's stamp, but their names don't carry it:
  fetch each live transcript no reflection or prompt claims by id, once per
  run, and match an older prompt to the ones whose body has `"of": "scene"`
  and `"ref": "drama-<stamp>"`, one note per distinct `note` (the highest
  `<n>` of each). They all carry the prompt's time, so their order is
  unknown: say so in the summary when there are several.
- **Each transcript you use:** fetch it with
  `GET "$JOBS_MAILBOX_URL/v1/transcript/items/<name>"`, check the bytes' SHA-256
  against the listing's `sha256` and the body's `schema` and `note`, and read
  its `text`.
- **Archived:** a note with an id (a reflection's, or one a prompt's `notes`
  line names) with no live transcript but an archived one is asked back by
  its own name (`PUT "$JOBS_MAILBOX_URL/v1/transcript/wanted/<name>"`, no
  body, the highest `<n>`).
  For an older prompt with too few matches, ask back the archived transcripts
  put (their `putAt`) between a day before the prompt's stamp and seven days
  after it, at most ten a run; a later run matches them by body.

**When home's index stands (2b)**, a reflection group or a drama prompt read
from the mailbox has its notes in the index (step 3's `reflections`, step 7's
`prompts`): its `notes`, each the phone's `note` id (and, for a prompt, the
voice `file` its `notes` line names) and its newest `transcript` (`name` and
`sha256`, or `null` while home hasn't heard it), and its `voice`. Its
`voice.state` is `heard` (every note has a transcript, or it has none),
`waiting` (one hasn't, and its two days, from `voice.since` to `voice.until`,
aren't over: it waits, as below) or `missed` (they are over: answer it from
what it says in writing, as below). Don't list the `transcript` folder or work
out the wait for these: fetch each transcript by that name as "Each transcript
you use" says, and check its bytes against that `sha256` as well. A missing
one is asked back as "Archived" says, and then it waits. A reflection or
prompt read from Drive keeps the rules above.

A note home hasn't heard is one with no transcript to use (for an older drama
prompt, fewer distinct notes than voice files beside it), including one asked
back this run. Its reflection or prompt waits, so what was said is read once
home has heard it: don't answer it this run, and skip it in step 3 or 7 so it
doesn't use up that step's limit. Count it in the run record's
`voice.waiting` (step 12).

A note reaches home from a paired phone once it is kept (a drama prompt's
scene notes too, before the prompt is shared), and from a phone that isn't
paired not until it is. So once its voice file
(or, without one, the reflection's file) has been in Drive for two days, or,
for a reflection or prompt read from the mailbox, its file has been there for
two days (its `putAt`; a reflection group's newest), and
nothing is coming back for it (this run asked none back for it, and
`GET "$JOBS_MAILBOX_URL/v1/transcript/wanted"` lists no open ask for it: a
note with an id by its transcript's name, and for an older drama prompt any
open ask), stop waiting: answer the reflection or prompt from what it says in writing, and
count it in `voice.missed`. For a prompt with nothing written
but its notes, write the drama its request block describes.

If the transcript listing isn't the object 2a describes, every voice note
waits, whatever its age, and `voice.unread` is `true`; those notes count in
neither `waiting` nor `missed`, since whether home heard them is unknown.
Voice notes never go to the mailbox from this run.

## Part A: word sets

3. List the mailbox's `reflection` folder (live items, paged as 2a says)
   and, with Drive, `Study ledger/reflections`, `Read aloud/sets` and each
   dated folder in `Read aloud/archive` (folder ids are in the SOP's table).

   A reflection is answered when a scene home holds carries its base: the
   mailbox's `scene` folder, live or archived (list both as 2a says), names
   `scene-<base>.json` or `scene-<base>-<n>.json`. A stock scene (part D)
   answers no reflection. Drive's scene folders answer too, for the scenes
   home doesn't hold. `Read aloud/sets` holds one folder per scene, named
   `TOPIK <level> · <genre> · <title>`, each with `read-aloud.json` and
   `lens.json`; a retired scene sits whole, with its description, in
   `Read aloud/archive/<date>/`. Listings show each folder's description. A
   folder an earlier run wrote has the description `answers: <base>` (or
   `stock: <base>`, answering no reflection), and one that holds both files
   answers that base, in `Read aloud/sets` or under `Read aloud/archive/`: a
   retired scene stays answered and is never written again. A folder with no
   such description answers nothing: it is a copy (6a), or not the routine's.
   A reflection Drive holds is `<base>.json`, answered as any other.

   A written reflection in the mailbox is `reflection-<id>.json`, holding
   `{"schema":"some-ui.reflection/1","reflection","session","at","text"}`:
   the phone's id for it, the session it is about, when it was written and
   the typed line. Fetch each with
   `GET "$JOBS_MAILBOX_URL/v1/reflection/items/<name>"` and check its bytes'
   SHA-256 against the listing's `sha256` and the body's `schema` and
   `reflection`, as for a transcript. One whose `reflection` is the `id` of
   an entry in a `<base>.json` in `Study ledger/reflections` belongs to that
   file: it was shared there first, so it is answered with that file and
   never again. Without Drive that can't be told, so each is taken as one of
   the others; say so in the summary, since a reflection shared to Drive
   before the phone sent it home may then be answered twice. The others are
   grouped by session and by the day of their
   `at` in `America/Los_Angeles`, and each group is one reflection to
   answer. Its base is `<day>_reflection_<session8>`, where `<session8>` is
   the session's last 8 letters, digits or `-`, as written: every id the phone
   or home makes now starts `session-`, so its first 8 are the same for all of
   those (RB1). The scene's `answers` and mailbox name carry it exactly as a
   Drive file's base does. Earlier runs took the first 8, so a
   scene may carry a group's earlier base, `<day>_reflection_` and the
   session's first 8 (`<day>_reflection_session-` for most): that scene
   answers the group only when no other group of that day still in the
   listing, answered or not, has the same earlier base, and otherwise none of
   them. A group whose session has no letter, digit or `-` can't be named, so
   leave it out of what follows, skip it, and say so in the summary. Don't
   work either base out by eye: save every group the listing's
   reflections make, answered or not, as
   `[{"day":"<day>","session":"<session>"},...]` in a scratch file outside the
   checkout and run, from `packages/ui/topik`,
   `node scripts/base.mjs <absolute path of the file>`. The file takes the
   reflections a Drive file holds too, grouped as the others are, though they
   are still answered with their file: home's index counts every group it
   gathered (paulgsc/server
   `apps/servers/file_host/src/mailbox/index/reflections.rs`, `waiting_groups`),
   and whether an earlier base names one group turns on all of that day's. It
   prints each group with its `base` and its `earlier` base,
   which is `null` when a scene under it answers none. A group is answered by
   a scene that carries its `base`, or its `earlier` base when that isn't
   `null`. If it says the groups don't read, fix what it names and run it
   again; if the command or path was wrong, fix that and run it again; if it
   fails any other way, stop part A, say why in the summary, and go to part B. A group whose newest `at` is under two hours old waits for the
   next run, since more of that session may be on its way; a reflection
   written on the same day after its group was answered is not answered
   again (say so in the summary). Its spoken reflections ("Voice notes",
   above) belong to it when their transcript's `at` falls on the same day.
   The routine cannot ask an archived reflection back, so a group whose
   reflections have left the listing waits no more and is not counted.

   **When home's index stands (2b)**, the mailbox's side of this step is its
   `reflections`: each group of written reflections no scene home holds
   answers, newest first, with its `base`, `session`, `day`, the names of its
   reflections in the order they were written, `newestAt`, and `settled`
   (`false` while its newest is under two hours old: it waits for the next
   run). Don't list the `reflection` folder or group the reflections
   yourself: fetch each named one as above. A reflection is answered when its
   base is in the index's `answered.scenes` or a scene folder in Drive answers
   it as above; a group whose reflections a Drive reflection file holds
   belongs to that file, as above.

   Take the unanswered ones, from the mailbox and from Drive together,
   newest first, skipping any that wait on a voice note ("Voice notes"), at
   most three this run. If there are none, go to part B.

4. For each: read the reflection (a Drive file's JSON, or a mailbox group's
   typed lines in the order of their `at`) and what home heard in each of its
   voice notes ("Voice notes" above; one home hasn't heard makes the reflection
   wait). Do part C for it now, before you write anything,
   then choose its context and write the pair, both following the deck prompt
   exactly:

   - context: a `genre` from the deck prompt's table, a K-drama genre unless the
     note asks for everyday life (vary it from the latest scenes home holds),
     and a `premise`, one English sentence that fits what the note mentions
     about studying; every line of both decks belongs in that scene. The
     scenes to vary from are this run's own and, when home's index stands
     (2b), its `recent` (the latest three, newest first, each with its
     `genre`), or otherwise the three newest live items in the mailbox's
     `scene` folder (fetch each; its `title` names its genre);
   - level: the one the learner asked for in the note, else the session's
     level (TOPIK 1-2 -> read-aloud level 1-2, higher -> 3; only a Drive file
     carries one); for a mailbox group, the level in the title of the newest
     scene home holds, else 1. That newest scene is this run's own newest,
     else, when home's index stands (2b), the first of its `recent` with a
     `level`, or otherwise the newest live item in the mailbox's `scene`
     folder;
   - the read-aloud deck: `practice: "read-aloud"`, one pool sized for a
     sitting, as many lines as the deck prompt's table gives the deck's level
     and a few over, no `lens` on any line, `id` kebab-case and unique (e.g. a slug of
     the title plus the reflection's date);
   - the lens deck: `practice: "lens"`, about 8 lines (the deck prompt leaves a
     lens deck's size to the request, and this is the run's), every one with a `lens`
     (misforms from the mistake catalogue, each wrong in its line, with
     `decides`, and a cue and situations where they help), `id` the read-aloud
     deck's plus `-lens`;
   - both: the same `title` (the scene in a few words), `context` and `from`
     (what it answers in the learner's own words, under 200 characters, e.g.
     `your note on Oct 13: "move to level two"`, or `your session on Oct 13`);
     a `role` on each written word and a `tense` on each line where the form
     shows one;
   - do not reuse a word id from
     `packages/some-content/prompts/read-aloud-generator/sets/*.json`, from any
     deck of a scene home holds, or from a scene only Drive holds, unless it
     is the same dictionary form (same `lemma`); do reuse it when it is. When
     home's index stands (2b), those decks are its `words` (each id with its
     `lemma`, from every deck home holds), with Drive the decks of the folders
     in its `lacking` (download those only), the Starter and Level one scenes
     (the repo's `sets/*.json` above) and this run's own decks. Otherwise they
     are every live item in the mailbox's `scene` folder, with Drive every
     deck under `Read aloud/` (scenes and archive alike), the repo's sets and
     this run's own; say in the summary that a scene home has archived was
     read only through its Drive copy, or, without Drive, not at all.

   If an earlier run's scene folder for the reflection (its description
   `answers: <base>`) holds one file only, that run stopped between its two
   uploads after it triaged the reflection: skip part C for it, and write the
   pair in the same context and under the same title as that file (read it
   for it), so step 6's title is the folder's name. Its Drive copy finishes
   that folder (6a).

5. Check each deck the way the phone will. Save the deck as bare JSON to a
   scratch file outside the checkout and run, from `packages/ui/topik`,
   `node scripts/check-deck.mjs <absolute path of the file>`. Its first line
   must be `[]`; anything else lists findings: fix every one and re-check;
   never upload a deck with findings. Its second line must show the practice
   you meant, your context, and the lines the app kept: for a read-aloud deck,
   at least the count the deck prompt's table gives its level and
   `lens lines: 0`; for a lens deck, `lens lines: N of N` with
   N at least 6.

6. Put the scene to the mailbox: that is how it goes home, and a put that
   answers `201` or `200` marks the reflection answered and triaged, so put
   it only after part C for it is done, or has failed with the reason in the
   summary. Its title is `TOPIK <level> · <genre> · <title>`, where `<level>`
   is the decks' highest line level. Write one scratch file holding
   `{"schema":"some-ui.routine-scene/1","answers":"<base>","title":"<its title>","decks":[<the read-aloud deck>,<the lens deck>]}`,
   each deck the JSON you checked, unchanged (build it with `node` or `jq`
   from the two deck files, not by hand), then:

   ```sh
   curl -sS --max-time 30 -X PUT -H "Authorization: Bearer $JOBS_MAILBOX_TOKEN" \
     -H "Content-Type: application/json" --data-binary @<file> -w '\n%{http_code}\n' \
     "$JOBS_MAILBOX_URL/v1/scene/items/scene-<base>.json"
   ```

   `201` (added) and `200` (unchanged) are both success. `409` means another
   scene already holds that name (two reflections can share a base): put the
   same file as `scene-<base>-2.json`, then `-3`, up to `-9`, until one
   answers `201` or `200`. `422` names why the file was refused: if the
   reason is in your envelope, fix it and put again; otherwise say so in the
   summary. Anything else: say so in the summary and carry on. A scene that
   isn't home gets no Drive copy (6a), and its reflection stays unanswered,
   so a later run answers it again; part C files nothing twice, since C3
   finds the issues this run filed.

6a. With Drive, once step 6 answered `201` or `200`, copy the scene to Drive
for refreshing away from home: create a folder in `Read aloud/sets` (mimeType
application/vnd.google-apps.folder) named by the scene's title, with no
description, and upload the two decks into it as `read-aloud.json` and
`lens.json`: bare JSON (no code fence), contentMimeType application/json,
disableConversionToGoogleType true. Confirm each result's mimeType is
application/json and its fileSize equals your local file's byte count. A copy
that fails goes in the summary; the scene is home's either way, and no later
run makes the copy. For a scene that finishes an earlier run's folder (step
4's last paragraph), make no new folder: upload only the deck that folder
lacks into it, under its name there, and leave its description as it is.

## Part C: product feedback (done for each reflection inside step 4)

C1. Sort what the reflection says, statement by statement, typed lines and
transcripts alike. About studying (level, pace, what was hard, what to practise
next): it shapes the pair. About the app or the repo's tools (a bug, something
confusing, a control in the wrong place, a missing feature, how a screen should
work): it is product feedback. One statement can be both. File only what the
note clearly asks for; a line too garbled or too tentative to be sure of is not
filed, and goes in the summary instead, paraphrased.

C2. The repo and its issues are public, and the reflection is the owner's
personal data. An issue states the product change in your own words. Never
quote a note or a transcript, and never include study results, answers, levels,
moods, session dates or file names from `Study ledger`. Name the source only as
"a study reflection".

C3. Before filing, search the repo's issues, open and closed (`search_issues`
with the change's key words), for one that already covers it. An open one: file
nothing, and name it in the summary. A closed one the note says is still wrong:
file a new issue that links it.

C4. File one issue per distinct change, in the repo's style (see recent
issues): a plain title saying what is wrong or wanted; a body with what the
owner meets today, what they want instead, which surface it is on (the phone
APK or the desktop web: they are separate surfaces), acceptance criteria as a
checklist, and a last line "Source: a study reflection, triaged by the
scheduled routine." Label it `from-reflection` (if that label is refused, file
without it and say so) and with the area labels the repo uses (`bug`, `story`,
a workspace name), and with `kind:story` or `kind:defect` (the repo's
`CLAUDE.md`, "Two kinds of pull request"). When the change spans several steps
or workspaces, file an `epic` issue for the whole and its steps as sub-issues
of it (`sub_issue_write`). At most four new issues a run: file the clearest,
and list the rest in the summary for the owner.

C5. Start no session yourself and don't comment on the issues you file. Now
and then the owner has a session reconcile the open `from-reflection` issues
and fold them into the Residual Ledger; the label is how it finds them.

C6. If the GitHub tools are not available, or a call is refused, file nothing
more: put each piece of feedback, paraphrased, in the summary so the owner can
file it, and still write the pair.

## Part B: dramas

7. List the mailbox's `prompt` folder (live items, paged as 2a says), the
   mailbox's `drama` folder (live and archived, as 2a says), and, with Drive,
   `Dramas/requests` and `Dramas/played` (folder ids in the SOP). A prompt
   the phone asked for is `drama-<stamp>.prompt.json` in the mailbox, holding `{"schema":"some-ui.drama-prompt/1","prompt","text"}`:
   its stamp (`drama-<stamp>`, which the name carries) and its markdown,
   exactly what a Drive share held as `drama-<stamp>.prompt.md`. Fetch each
   with `GET "$JOBS_MAILBOX_URL/v1/prompt/items/<name>"`, and check its
   bytes' SHA-256 against the listing's `sha256` and the body's `schema` and
   `prompt`, as for a transcript. A prompt shared before is
   `drama-<stamp>.prompt.md` in `Dramas/requests`. One stamp found in both
   is one prompt. A prompt is answered when the mailbox's `drama` folder
   lists `drama-<stamp>.json`, live or archived, or, for a drama an earlier
   run left in Drive alone, when that name sits in `Dramas/requests` or
   `Dramas/played`. The routine cannot ask an archived prompt back, so one
   that has left the listing unanswered waits no more and is not counted (say so in the summary). Take the unanswered ones,
   from the mailbox and from Drive together, oldest first, skipping any
   that wait on a voice note, at most two this run. If there are none, go
   to part D.

   **When home's index stands (2b)**, the mailbox's side of this step is its
   `prompts`: each drama prompt no drama home holds answers, oldest first,
   by its `name` here and its stamp (`prompt`), with its `notes` and `voice`.
   Don't list the `prompt` or `drama` folders to join them: fetch each named
   one as above. A prompt is answered when its stamp is in the index's
   `answered.dramas` or, with Drive, Drive holds its drama as above.

8. For each: read the prompt (a mailbox file's `text`, or a Drive file with
   download_file_content; either is plain markdown) and
   read what home heard in each voice note beside it, in the order the prompt
   names them ("Voice notes" above; one home hasn't heard makes the prompt
   wait) before you write anything. Those transcripts stand in for the
   prompt's "listen to them first": the spoken scene is what the learner
   asked for. Then do what the prompt asks: write the drama as one scene tree,
   following the prompt exactly (it carries the tree prompt, the request, and
   the last drama to continue from). If the prompt names a last drama, read
   that drama to keep its cast and their registers: the `tree` of the
   mailbox's `drama` item whose title the prompt names (fetch live ones,
   newest first), or, for one older than the live items, its `.json` in
   `Dramas/requests/` or `Dramas/played/`, with Drive. If neither has it,
   keep to what the prompt says of it.

9. Check each drama the way the phone will. Save the drama as bare JSON to a
   scratch file outside the checkout and run, from `packages/ui/topik`,
   `node scripts/check-drama.mjs <absolute path of the file>`. It must print
   `[]`. Anything else lists findings by path: fix every one and re-check;
   never upload a drama with findings.

10. Put each drama to the mailbox: that is how it goes home. Write a
    scratch file holding
    `{"schema":"some-ui.routine-drama/1","answers":"drama-<stamp>","tree":<the drama you checked, unchanged>}`
    (built with `node` or `jq`, not by hand), and put it as in step 6 to
    `"$JOBS_MAILBOX_URL/v1/drama/items/drama-<stamp>.json"`. `201` and `200`
    are success. `409` means the mailbox already holds a different drama
    under that stamp: say so in the summary and don't retry. `422` and
    anything else as in step 6: a drama that isn't home gets no Drive copy,
    and its prompt waits for a later run.

10a. With Drive, once step 10 answered `201` or `200`, copy the drama to Drive
for refreshing away from home: upload it as `drama-<stamp>.json` into
`Dramas/requests`, next to its prompt if Drive holds it (a prompt from the
mailbox has none there, and the drama goes in alone): bare JSON (no code
fence), contentMimeType application/json, disableConversionToGoogleType true.
Confirm the result's mimeType is application/json and its fileSize equals your
local file's byte count. A copy that fails goes in the summary. Never edit,
rename or move a prompt, a voice note or a drama: home keeps which prompts are
answered.

## Part D: keep three lessons ready

D1. List the mailbox's `opened` folder as 2a says (live items only), then read
the newest file (the highest `seq`) with `GET "$JOBS_MAILBOX_URL/v1/opened/items/<name>"`:
`{"schema":"some-ui.routine-opened/1","opened":["scene/<name>","drama/<name>",...],"at":...}`.
These are the lessons the phone had opened when home filed it.

D2. List the mailbox's `scene` and `drama` folders (live items, paged as 2a
says). A lesson is unopened when it was put in the last 30 days (its `putAt`)
and `<folder>/<name>` is not in the newest `opened` list. If no `opened` file
exists yet, count as unopened only the lessons put in the last 7 days. This
run's own puts are listed too, and count.

**When home's index stands (2b)**, D1 and D2 are its `unopened`: `count`
lessons put in the last 30 days that the newest `opened` list doesn't name (in
the last 7 days while there is none), `lessons` naming each as
`<folder>/<name>`, and `opened` the list it went by. Add this run's own puts
(steps 6 and 10), which it doesn't count yet, and list none of the
`opened`, `scene` and `drama` folders for it.

D3. If fewer than 3 are unopened, write 3 minus that many stock scenes, at most
3 this run. A stock scene is a word set pair written, checked, put and copied
exactly as in steps 4 to 6a, with these differences:

- it answers no reflection: there is no voice note and no part C; its
  base is `<today>_stock_<n>` (today as YYYY-MM-DD, America/Los_Angeles; n = 1,
  2 or 3, the first not already used by a name in the mailbox's `scene`
  folder, live or archived, or, when home's index stands (2b), a base in its
  `answered.scenes`);
- its title is formed as any scene's (step 6), and so is its Drive copy (6a);
- context: a genre not used by the last three scenes home holds (as step 4
  finds them) and this run's own, newest first, and a premise of your own
  that a learner at that level would enjoy;
- level: the level in the title of the newest scene home holds (as step 4
  finds it), else 1;
- `from`: `kept ready on <Mon D>`;
- in step 6's envelope, `answers` is `<base>`, and the name is `scene-<base>.json`.

## The run record

11. With Drive: never edit, move, rename or trash anything in `Study ledger/`,
    `Archive/`, `Dramas/` or `Read aloud/archive/`, nor the Starter or Level
    one scenes in `Read aloud/sets`, nor any scene folder you did not create
    this run, except the deck 6a uploads into an earlier run's half-written
    folder. Triage `Inbox/` per the SOP if it holds anything.

12. Record this run in the mailbox. Skip only if 2a skipped the mailbox;
    otherwise this step runs even when the run stops early. Take the start time
    you kept before step 1, and write one scratch file with `node` or `jq`,
    not by hand:

```json
{
  "schema": "some-ui.routine-run/1",
  "routine": "reflections",
  "startedAt": "<the start time you kept before step 1>",
  "finishedAt": "<now, ISO-8601 UTC>",
  "outcome": "done | partly | stopped",
  "found": {
    "reflections": "<unanswered reflections found in step 3>",
    "prompts": "<unanswered drama prompts found in step 7, mailbox and Drive>"
  },
  "added": [
    {
      "folder": "scene",
      "name": "scene-<base>.json",
      "title": "<scene folder name>"
    },
    {
      "folder": "drama",
      "name": "drama-<stamp>.json",
      "title": "<the drama's title>"
    }
  ],
  "problems": ["<one plain sentence per thing you could not do>"],
  "voice": { "waiting": 0, "missed": 0, "unread": false },
  "nextBy": "<tomorrow 10:00 America/Los_Angeles, as ISO-8601 UTC>"
}
```

- `found`: every unanswered one you found, including any beyond this run's
  limit, each a number.
- `added`: only files whose mailbox put answered `201` this run (6, 10, D3),
  each under the exact name it went under. `[]` when you added nothing.
- `outcome`: `done` when you answered everything you found and stocked what D3
  asked for (finding nothing counts as done); `partly` when something was left
  for a later run, skipped or failed; `stopped` when the run ended early. A
  run without Drive is not `partly` for that alone: what it leaves undone
  ("What still needs Drive") goes in the summary.
- `problems`: written for the owner, in their terms: what was not done, and
  why, such as "One drama couldn't be made playable, so that prompt waits for
  the next run." The phone shows the first one, so put the one that matters
  most first. Never quote a note, and never name a status code, a token, a
  URL, a file id or a tool. `[]` when there were none. What became of the
  voice notes goes in `voice`, never here: the phone says each of those
  states in its own words and with its own mark.
- `voice`: what became of the voice notes in what you found ("Voice notes"):
  `waiting`, how many reflections and drama requests wait for home to hear
  one; `missed`, how many you answered without one home never heard; and
  `unread`, whether the transcript listing couldn't be read. Write it on
  every run, zeros and `false` included, so a run that says nothing of them
  is never mistaken for one where all was heard.
- `nextBy`: compute it with `node` (`Intl` knows daylight saving), not by hand.

Put it as
`"$JOBS_MAILBOX_URL/v1/run/items/run-reflections-<startedAt as YYYYMMDDTHHMMSSZ>.json"`
with step 6's curl. `201` and `200` are success; anything else goes in the summary
and is not retried.

## Summary

13. End with a short summary: which reflections you answered, and for each its
    scene's title, genre, premise, level and `from`, with the checker's
    second line for each deck; the issues you filed (number, title), the
    existing ones you matched, any feedback you did not file and why; which
    drama prompts you answered, each drama's title, level and what it
    continues; each mailbox put (name and status code), and if the mailbox was
    skipped, why; part D's count of unopened lessons and each stock scene
    written (title, genre, premise, level); the run record's put and its
    status code; for each voice note, its transcript's name and `text`, or that
    home hasn't heard it; Drive (whether this session had it, each copy made
    or failed, each reflection, prompt or scene read from it because only
    Drive holds it, or, without it, what that left undone); and anything you
    skipped and why. If nothing was new anywhere, say so in
    one line.

## What review holds

**RB1: a reflection group's base tells its sessions apart.**

The rule is a test's: `src/lib/topik/reflection-base/index.test.ts`, "RB1",
holds `baseOf`, `earlierBaseOf` and `groupBases` (the session id's last 8
letters, digits or `-`; an earlier-base scene answers a group only when no
other group of that day still in the listing, answered or not, has the same
earlier base) over each id form, and
`apps/www/src/lib/tenant/__tests__/session-id.test.ts`, "RB1", holds that the
last 8 of every id `newSessionId` makes are random. What follows is the one
part no test can see.

- _Claim:_ step 3 has the run take every group's base from
  `scripts/base.mjs`, and `scripts/base.mjs` prints
  `groupBases(readGroups(<the file>))` of the module it loads,
  `src/lib/topik/reflection-base/index.ts`, or says that the groups don't
  read.
- _Falsified by_ a hunk in this file's step 3 that has the run work out a base
  any other way, or that drops or changes the earlier-base clause; a hunk in
  `scripts/base.mjs` that prints anything else or loads another module; or a
  hunk that deletes, renames or moves `scripts/base.mjs` without step 3
  following it.
- _Scope:_ this file's step 3 and `scripts/base.mjs`.
- _Why not enforced:_ the run follows this file by hand, so whether it calls
  the script is something only a reader of this file can check.
- _Tolerance:_ a group that arrives late for a day whose other groups have all
  left the listing, when one of them was answered under the earlier base, is
  taken as answered by that scene. Earlier-base scenes are written only by runs
  from HF3 (#2396, 2026-10-31) until RB1 reached main, and a reflection leaves
  the listing only once home archives it, at least 30 days on, so such a group
  would have to arrive more than a month late.
