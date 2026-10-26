# The daily reflections run

A scheduled task runs this every morning at 09:00 Pacific, in a fresh session
with the Google Drive connector, the GitHub MCP tools and a checkout of
`paulgsc/some-ui`. It answers what the owner shares from their phone into
Google Drive. For each study reflection: a scene of word sets, one to read
aloud and one for the grammar lens (part A), and a GitHub issue for anything it
says about the app (part C). For each drama prompt: a drama (part B). Each
scene and drama also goes to the Jobs mailbox, where home takes it for the
phone's "From the routine" list. When fewer than three of the routine's lessons
wait unopened on the phone, it also writes stock scenes that answer no
reflection (part D), and every run leaves a record of itself in the mailbox
(step 12), which the phone shows as when the routine last ran and what it
brought.

The run works in Google Drive (the Google Drive connector), the checkout,
GitHub (the GitHub MCP tools, `mcp__github__*`; load them with ToolSearch if
they are deferred), and the mailbox (`curl`). It changes nothing in the repo:
no commits, no pushes, no PRs; the issues of part C are its only GitHub writes.
If the Google Drive connector is not available, stop and say so in the summary.

The scheduled task's prompt points at this file, so a change to the run is a
reviewed change here. The decks' shape and length are `deck-prompt.md`'s
(step 2). When this file and that prompt disagree, the prompt wins and this file
is the bug.

## Before anything

1. Find the Google Doc titled `README — Drive SOP` in My Drive (its parent is
   My Drive's root; ignore copies in Archive/) and read it before any write; it
   is the rule for where files go and what they are named, and wins over this
   file on that. Its "Read aloud/" and "Dramas/" sections describe these jobs.
   Check every Drive result's owner is paulgathondudev@gmail.com; if not, stop.

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
   wins.

2a. The mailbox. `JOBS_MAILBOX_URL` (no trailing slash) and
`JOBS_MAILBOX_TOKEN` are set in this environment. If either is unset or empty,
skip every mailbox step (6a, 10a, part D, 10b, 12, and "Voice notes" waits),
carry on with Drive alone, and say so in the summary. Otherwise check it once:

```sh
curl -sS --max-time 30 -o /dev/null -w '%{http_code}\n' \
  -H "Authorization: Bearer $JOBS_MAILBOX_TOKEN" \
  "$JOBS_MAILBOX_URL/v1/scene/items?limit=1"
```

`200` means it is usable. Anything else (`401` is a wrong token, `404` a
mailbox not yet taking scenes, `000` no network): skip every mailbox step,
carry on with Drive alone, and say so in the summary. A mailbox problem never
stops the run and never changes what goes to Drive. Use only `curl` with that
`Authorization` header, never print the token, and don't turn on shell tracing
(`set -x`). Drive stays the record; the mailbox carries a copy home.

### Voice notes

Home hears the voice notes, and the run reads what home heard: never the
audio. Install no speech model and download no note's audio, in any part.
Each transcript is a file in the mailbox's `transcript` folder,
`transcript-<note>-<n>.json`, holding
`{"schema":"some-ui.voice-transcript/1","note","of","ref","at","text","language","model","heardAt"}`:
`note` is the phone's id for the note, and `language` is Whisper's code (`en`
or `ko`).

Once per run, list the folder, live and archived, as 10b lists a folder. Then:

- **A reflection's note** is an entry in `<base>.json` whose `kind` is `voice`
  (its audio, if the phone shared it, is the `<base>_voice-*` file the entry's
  `file` names); its `id` is the note's id. Its transcript is the live
  `transcript-<id>-<n>.json` with the highest `<n>`, compared as a number.
- **A drama prompt's scene notes** (`drama-<stamp>.voice-<n>.<ext>` beside the
  prompt) went home under the prompt's stamp, but their names don't carry it.
  Fetch each live transcript no reflection claims, once per run, and match a
  prompt to the ones whose body has `"of": "scene"` and
  `"ref": "drama-<stamp>"`, one note per distinct `note` (the highest `<n>` of
  each). They all carry the prompt's time, so their order is unknown: say so in
  the summary when there are several.
- **Each transcript you use:** fetch it with
  `GET "$JOBS_MAILBOX_URL/v1/transcript/items/<name>"`, check the bytes' SHA-256
  against the listing's `sha256` and the body's `schema` and `note`, and read
  its `text`.
- **Archived:** a reflection's note with no live transcript but an archived
  one is asked back (`PUT "$JOBS_MAILBOX_URL/v1/transcript/wanted/<name>"`, no
  body, the highest `<n>`). For a drama prompt with too few matches, ask back
  the archived transcripts put (their `putAt`) between a day before the
  prompt's stamp and seven days after it, at most ten a run; a later run
  matches them by body.

A note home hasn't heard is one with no transcript to use (for a drama prompt,
fewer distinct notes than voice files beside it), including one asked back
this run. Its reflection or prompt waits, so what was said is read once home
has heard it: don't answer it this run, and skip it in step 3 or 7 so it
doesn't use up that step's limit. Count it in the run record's
`voice.waiting` (step 12).

A note reaches home only while the phone keeps voice notes on home, and a
drama prompt's notes are sent once, when it is shared. So once its voice file
(or, without one, the reflection's file) has been in Drive for two days, and
nothing is coming back for it (this run asked none back for it, and
`GET "$JOBS_MAILBOX_URL/v1/transcript/wanted"` lists no open ask for it: a
reflection's by its note's name, and for a drama prompt any open ask), stop
waiting: answer the reflection or prompt from what it says in writing, and
count it in `voice.missed`. For a prompt with nothing written
but its notes, write the drama its request block describes.

If the transcript listing isn't the object 10b describes, every voice note
waits, whatever its age, and `voice.unread` is `true`. If 2a skipped the
mailbox, they wait the same way, and that goes in the summary only, since
step 12 doesn't run. Voice notes never go to the mailbox from this run.

## Part A: word sets

3. List `Study ledger/reflections`, `Read aloud/sets`, and each dated folder in
   `Read aloud/archive` (folder ids are in the SOP's table). `Read aloud/sets`
   holds one folder per scene, named `TOPIK <level> · <genre> · <title>`, each
   with `read-aloud.json` and `lens.json`; a retired scene sits whole, with its
   description, in `Read aloud/archive/<date>/`. Listings show each folder's
   description. A reflection is `<base>.json`; it is answered when a scene
   folder whose description is `answers: <base>` holds both files, in
   `Read aloud/sets` or under `Read aloud/archive/`: a retired scene stays
   answered and is never written again. A folder whose description is
   `stock: <base>` (part D) answers no reflection. Take the unanswered ones,
   newest first, skipping any that wait on a voice note ("Voice notes"), at
   most three this run. If there are none, go to part B.

4. For each: read the reflection JSON and what home heard in each of its voice
   notes ("Voice notes" above; one home hasn't heard makes the reflection
   wait). Do part C for it now, before you write anything,
   then choose its context and write the pair, both following the deck prompt
   exactly:

   - context: a `genre` from the deck prompt's table, a K-drama genre unless the
     note asks for everyday life (vary it from the scenes already in
     `Read aloud/sets`), and a `premise`, one English sentence that fits what
     the note mentions about studying; every line of both decks belongs in that
     scene;
   - level: the one the learner asked for in the note, else the level the
     session was studied at (TOPIK 1-2 -> read-aloud level 1-2, higher -> 3);
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
     `packages/some-content/prompts/read-aloud-generator/sets/*.json` or from any
     deck under `Read aloud/` (scenes and archive alike) unless it is the same
     dictionary form (same `lemma`); do reuse it when it is.

   If the reflection's scene folder exists with one file, write only the other,
   in the same context (read the existing one for it), and skip part C: that
   reflection was triaged when its first deck was written.

5. Check each deck the way the phone will. Save the deck as bare JSON to a
   scratch file outside the checkout and run, from `packages/ui/topik`,
   `node scripts/check-deck.mjs <absolute path of the file>`. Its first line
   must be `[]`; anything else lists findings: fix every one and re-check;
   never upload a deck with findings. Its second line must show the practice
   you meant, your context, and the lines the app kept: for a read-aloud deck,
   at least the count the deck prompt's table gives its level and
   `lens lines: 0`; for a lens deck, `lens lines: N of N` with
   N at least 6.

6. If the reflection has no scene folder yet, create it in `Read aloud/sets`
   (mimeType application/vnd.google-apps.folder), named
   `TOPIK <level> · <genre> · <title>` where `<level>` is the decks' highest
   line level, and set its description to `answers: <base>` with update_file;
   otherwise use the folder it has. Upload the decks it lacks into it as
   `read-aloud.json` and `lens.json`: bare JSON (no code fence),
   contentMimeType application/json, disableConversionToGoogleType true.
   Confirm each result's mimeType is application/json and its fileSize equals
   your local file's byte count. The folder with both files marks the
   reflection answered and triaged, so upload the second file only after part C
   for it is done, or has failed with the reason in the summary.

6a. Once the folder holds both files, put the scene to the mailbox. Write one
scratch file holding
`{"schema":"some-ui.routine-scene/1","answers":"<base>","title":"<the scene folder's name>","decks":[<the read-aloud deck>,<the lens deck>]}`,
each deck the JSON you uploaded, unchanged (build it with `node` or `jq` from
the two deck files, not by hand), then:

```sh
curl -sS --max-time 30 -X PUT -H "Authorization: Bearer $JOBS_MAILBOX_TOKEN" \
  -H "Content-Type: application/json" --data-binary @<file> -w '\n%{http_code}\n' \
  "$JOBS_MAILBOX_URL/v1/scene/items/scene-<base>.json"
```

`201` (added) and `200` (unchanged) are both success. `409` means another scene
already holds that name (two reflections can share a base): put the same file
as `scene-<base>-2.json`, then `-3`, up to `-9`, until one answers `201` or
`200`. `422` names why the file was refused: if the reason is in your envelope,
fix it and put again; otherwise say so in the summary. Anything else: say so in
the summary and carry on; step 10b puts it on a later run.

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

7. List `Dramas/requests` (folder id in the SOP). A prompt is
   `drama-<stamp>.prompt.md`; it is answered when `drama-<stamp>.json` sits
   beside it. Take the unanswered ones, oldest first, skipping any that wait
   on a voice note, at most two this run. If there are none, go to part D.

8. For each: read the prompt (download_file_content; it is plain markdown) and
   read what home heard in each voice note beside it ("Voice notes" above; one
   home hasn't heard makes the prompt wait) before you write anything. Those
   transcripts stand in for the prompt's "listen to them first": the spoken
   scene is what the learner asked for. Then do what the prompt asks: write the drama as one scene tree,
   following the prompt exactly (it carries the tree prompt, the request, and
   the last drama to continue from). If the prompt names a last drama, read
   that drama's `.json` from `Dramas/played/` or `Dramas/requests/` to keep its
   cast and their registers.

9. Check each drama the way the phone will. Save the drama as bare JSON to a
   scratch file outside the checkout and run, from `packages/ui/topik`,
   `node scripts/check-drama.mjs <absolute path of the file>`. It must print
   `[]`. Anything else lists findings by path: fix every one and re-check;
   never upload a drama with findings.

10. Upload each as `drama-<stamp>.json` into `Dramas/requests`, next to its
    prompt: bare JSON (no code fence), contentMimeType application/json,
    disableConversionToGoogleType true. Confirm the result's mimeType is
    application/json and its fileSize equals your local file's byte count.
    Never edit, rename or move a prompt or a voice note. Then apply the SOP's
    Dramas/requests lifecycle: when a prompt's last drama names an older set's
    title, move every `drama-<oldstamp>.*` file of that older set to
    `Dramas/played/` with update_file, and list each move in the summary.

10a. Put each drama you uploaded to the mailbox: a scratch file holding
`{"schema":"some-ui.routine-drama/1","answers":"drama-<stamp>","tree":<the drama you uploaded, unchanged>}`
(built with `node` or `jq`, not by hand), put as in 6a to
`"$JOBS_MAILBOX_URL/v1/drama/items/drama-<stamp>.json"`. `201` and `200` are
success. `409` means the mailbox already holds a different drama under that
stamp: say so in the summary and don't retry. `422` and anything else as in 6a.

## Part D: keep three lessons ready

D1. Skip this part if 2a skipped the mailbox. List the mailbox's `opened`
folder as 10b lists a folder (live items only), then read the newest file (the
highest `seq`) with `GET "$JOBS_MAILBOX_URL/v1/opened/items/<name>"`:
`{"schema":"some-ui.routine-opened/1","opened":["scene/<name>","drama/<name>",...],"at":...}`.
These are the lessons the phone had opened when home filed it.

D2. List the mailbox's `scene` and `drama` folders (live items, paged as in
10b). A lesson is unopened when it was put in the last 30 days (its `putAt`)
and `<folder>/<name>` is not in the newest `opened` list. If no `opened` file
exists yet, count as unopened only the lessons put in the last 7 days. This
run's own puts are listed too, and count.

D3. If fewer than 3 are unopened, write 3 minus that many stock scenes, at most
3 this run. A stock scene is a word set pair written, checked, uploaded and put
exactly as in steps 4 to 6a, with these differences:

- it answers no reflection: there is no voice note and no part C; its
  base is `<today>_stock_<n>` (today as YYYY-MM-DD, America/Los_Angeles; n = 1,
  2 or 3, the first not already used by a folder in `Read aloud/sets` or a name
  in the mailbox's `scene` folder);
- its folder in `Read aloud/sets` is named as any scene's, with the description
  `stock: <base>` instead of `answers: <base>`;
- context: a genre not used by the last three scenes in `Read aloud/sets`, and a
  premise of your own that a learner at that level would enjoy;
- level: the level in the name of the newest folder in `Read aloud/sets` whose
  description is `answers:` or `stock:`, else 1;
- `from`: `kept ready on <Mon D>`;
- in 6a's envelope, `answers` is `<base>`, and the name is `scene-<base>.json`.

## Catching up, and the run record

10b. Catch the mailbox up with Drive. List its `scene` and `drama` folders,
live and archived:

```sh
curl -sS --max-time 30 -H "Authorization: Bearer $JOBS_MAILBOX_TOKEN" \
  "$JOBS_MAILBOX_URL/v1/<folder>/items?after=0&limit=50"
```

and the same with `archived` in place of `items`. Each answer is
`{"items":[{"seq","name",…}]}`, oldest first; ask again with `after` set to the
highest `seq` in the answer until `items` is empty. An answer that is not that
object means the mailbox has failed: skip the rest of this step and say so. A
scene folder in `Read aloud/sets` whose description is `answers: <base>` or
`stock: <base>` and that holds both files is in the mailbox when a listed name
is `scene-<base>.json` or `scene-<base>-<n>.json`; a `drama-<stamp>.json` in
`Dramas/requests` or `Dramas/played` is in it when `drama-<stamp>.json` is
listed. Put the ones that are not, as in 6a and 10a, reading their files from
Drive (download_file_content), newest first, at most five scenes and five
dramas this run. Only folders whose description is `answers: <base>` or
`stock: <base>` are the routine's: never put the Starter or Level one scenes,
and never put anything from `Read aloud/archive/`. This step reads Drive and
writes only to the mailbox.

11. Never edit, move, rename or trash anything in `Study ledger/`, `Archive/` or
    `Read aloud/archive/`, nor the Starter or Level one scenes in
    `Read aloud/sets`, nor any scene folder you did not create this run. Triage
    `Inbox/` per the SOP if it holds anything.

12. Record this run in the mailbox. Skip only if 2a skipped the mailbox;
    otherwise this step runs even when the run stops early. Note the UTC time
    when you started this run, and write one scratch file with `node` or `jq`,
    not by hand:

```json
{
  "schema": "some-ui.routine-run/1",
  "routine": "reflections",
  "startedAt": "<when this run started, ISO-8601 UTC>",
  "finishedAt": "<now, ISO-8601 UTC>",
  "outcome": "done | partly | stopped",
  "found": {
    "reflections": "<unanswered reflections found in step 3>",
    "prompts": "<unanswered drama prompts found in step 7>"
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
- `added`: only files whose mailbox put answered `201` this run (6a, 10a, 10b,
  D3), each under the exact name it went under. `[]` when you added nothing.
- `outcome`: `done` when you answered everything you found and stocked what D3
  asked for (finding nothing counts as done); `partly` when something was left
  for a later run, skipped or failed; `stopped` when the run ended early.
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
with 6a's curl. `201` and `200` are success; anything else goes in the summary
and is not retried.

## Summary

13. End with a short summary: which reflections you answered, and for each its
    scene folder's name, genre, premise, level and `from`, with the checker's
    second line for each deck; the issues you filed (number, title), the
    existing ones you matched, any feedback you did not file and why; which
    drama prompts you answered, each drama's title, level and what it
    continues; each mailbox put (name and status code), and if the mailbox was
    skipped, why; part D's count of unopened lessons and each stock scene
    written (folder name, genre, premise, level); the run record's put and its
    status code; for each voice note, its transcript's name and `text`, or that
    home hasn't heard it;
    and anything you skipped and why. If nothing was new anywhere, say so in
    one line.
