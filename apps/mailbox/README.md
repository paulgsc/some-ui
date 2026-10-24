# @some-ui/mailbox

A Cloudflare Worker and a D1 database where the cloud routines and the home server leave each
other files. For the Jobs wing: the daily **digest** (`brief`), the phone's **decisions**
(`decisions`) and its **scouts** (`scout`). For study: the reflections routine's **word sets**
(`scene`) and **dramas** (`drama`), which home serves to the phone. Each side reaches it with
its own token, so the files move between them without a hand-carried step.

## Why it exists

The Jobs routine runs in the cloud at 07:52 Pacific. It cannot reach the home server, which
answers only on the home network. Home can make outbound requests, so both sides meet here:

```
cloud routine ──PUT brief──▶ [ mailbox ] ◀──GET brief── home ◀── phone (while Jobs is open, at home)
cloud routine ◀─GET decisions, scout── [ mailbox ] ◀──PUT decisions, scout── home ◀── phone
cloud routine ──PUT scene, drama──▶ [ mailbox ] ◀──GET scene, drama── home ◀── phone (Korean study)
```

The phone talks to home only. Home carries no audio (`docs/identity.md` in `paulgsc/server`,
invariant 16), so voice notes do not travel here; they keep going to Drive by the share sheet.
Drive stays in use alongside this until the owner retires it for Jobs.

## What it keeps

One row per file, in the folder it belongs to. A name holds one body for good: putting the
same bytes again changes nothing, and putting other bytes under a held name is refused, even
after the file is archived. Each row records who put it (`routine` or `home`), when, and the
SHA-256 of its bytes.

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

## API

Every request needs `Authorization: Bearer <token>`. Every answer is JSON, or the stored bytes.

| Request                                                  | Answer                                                                                                                                                                                                                                                                                             |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /v1/:folder/items?after=<seq>&limit=<n>`            | `200 {"items":[{"seq","name","size","sha256","contentType","putAt","liveSince"}]}`, live files only, oldest first, `seq > after` (default 0), `limit` 1–50 (default 50). Metadata only. A whole number outside those bounds is `422`. `liveSince` is when it was put back from home, else `putAt`. |
| `GET /v1/:folder/items/:name`                            | `200` with the stored bytes, `Content-Type` as stored and `ETag: "<sha256>"`; `410 {"error":"archived","archivedAt"}` if it moved home; `404` if never held.                                                                                                                                       |
| `PUT /v1/:folder/items/:name` (body = the file's bytes)  | `201 {"change":"added","seq"}`; `200 {"change":"unchanged","seq"}` for the same bytes; `409 {"error":"conflict"}` for other bytes under a held name; `413` when the body is over the cap; `422 {"error":"…why…"}` when the name or content is refused.                                             |
| `PUT /v1/:folder/items/:name` by `archive`               | Puts an archived file's own bytes back: `201 {"change":"restored","seq"}`; `200 {"change":"unchanged","seq"}` if it is live; `409` for other bytes; `404` if never archived. The body is checked as any put's is.                                                                                  |
| `DELETE /v1/:folder/items/:name`, `If-Match: "<sha256>"` | Archives it: `200 {"change":"archived"}`, or `"unchanged"` if it already was; `412` if the live bytes are other ones; `422` if it has been live under 30 days; `404` if never held; `428` without a lower-case hex `If-Match`.                                                                     |
| `GET /v1/:folder/archived?after=<seq>&limit=<n>`         | `200 {"items":[{"seq","name","size","sha256","contentType","putAt","archivedAt"}]}`, oldest first by the `seq` each had while live. Paged as above.                                                                                                                                                |
| `PUT /v1/:folder/wanted/:name` (no body)                 | Asks home to put an archived file back: `202 {"change":"asked"}`; `200 {"change":"unchanged"}` if already asked; `200 {"change":"live"}` if it is there now; `404` if never archived.                                                                                                              |
| `GET /v1/:folder/wanted?limit=<n>`                       | `200 {"items":[{"name","askedAt"}]}`, the open asks, oldest first.                                                                                                                                                                                                                                 |
| anything else                                            | `404`; a method the path does not take is `405` with `Allow`. A missing or wrong token is `401`, a token that may not do this is `403`, and storage failing is `503`.                                                                                                                              |

The folders are `brief`, `decisions`, `scout`, `scene` and `drama`.

**`seq` only grows, and it has gaps.** SQLite hands out a number for every put that reaches the
table, including a put of a name already held (`unchanged` or `conflict`), which stores nothing.
So after a few repeats the next new file can jump ahead (for example `seq 1`,
then six repeats, then `seq 8`). Page with `after` set to the highest `seq` you have seen, never
`after + 1`.

### Who may do what

| Secret          | Role      | May                                                                                            |
| --------------- | --------- | ---------------------------------------------------------------------------------------------- |
| `ROUTINE_TOKEN` | `routine` | read every folder; put `brief`, `scene` and `drama`; list what is archived and ask for it back |
| `HOME_TOKEN`    | `home`    | read `brief`, `scene` and `drama`; put `decisions` and `scout`                                 |
| `ARCHIVE_TOKEN` | `archive` | read every folder; archive a file and put an archived one back; list the open asks             |

The routine role is every scheduled routine's: the Jobs digest and the study reflections each
put to their own folders.

Home holds two tokens. `archive` is apart from `home` so the token home uses every pass cannot
drop a byte. A secret that is unset or empty authenticates no one, and one value set for two
roles authenticates no one. Letting the phone read `brief` from here directly would be another
role, and it is the owner's call, so it is not built.

### What a put must satisfy

- **Name**, anchored to its folder: `brief` takes `digest-YYYY-MM-DD.json`; `decisions` takes
  `decisions-YYYY-MM-DD.json` or `decisions-YYYY-MM-DD-<n>.json`; `scout` takes
  `scouts-YYYYMMDDTHHMMSS.json`; `scene` takes `scene-<reflection>.json` or
  `scene-<reflection>-<n>.json`, named for the reflection it answers
  (`YYYY-MM-DD_<session>_<id>`, which two reflections can share); `drama` takes `drama-<stamp>.json`,
  named for its prompt (`drama-YYYYMMDDTHHMMSSmmmZ`). Anything else, voice-note names
  included, is `422`.
- **Content type** `application/json` (parameters such as `charset` are ignored), and the body
  must be UTF-8 JSON with no byte-order mark.
- **Schema**: the top-level `schema` must be `some-ui.job-digest/1`, `some-ui.job-decisions/1`,
  `some-ui.job-scouts/1`, `some-ui.routine-scene/1` or `some-ui.routine-drama/1` to match the
  folder. The Worker checks that and nothing deeper; the readers validate the full shape.
- **A scene** is `{"schema":"some-ui.routine-scene/1","answers":"<reflection>","title":"<the
scene folder's name>","decks":[<read-aloud deck>,<lens deck>]}`, each deck exactly as the
  phone's word set check takes it. **A drama** is `{"schema":"some-ui.routine-drama/1",
"answers":"drama-<stamp>","tree":<the drama, as the phone's scene check takes it>}`.
- **Size**: at most 1,048,576 bytes. A declared `Content-Length` over that is refused before
  the body is read, and a body that declares nothing is cut off as it passes the cap. Real
  files are under 20 KB.

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
  CPU. I have not measured whether it fits in 10 ms; files are a few KB in practice.

A missing or wrong token is answered before any query runs, so a request without a token does
not spend D1 quota.

## Gray-area invariants

Each is written for review, one hunk at a time (`REVIEW.md`; `CLAUDE.md`, "Gray-area
invariants"). One line of each is in the doc comment of `src/core.ts`. The sections below say
how each was checked when this workspace landed.

**MB1: An item never changes, and leaves `item` only into `archived`.**

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

**MB2: Roles.**

- _Claim:_ the `ROLES` table in `src/core.ts` is the only place a token is mapped to what it
  may do, and it holds exactly three roles: `routine` (get every folder, put `brief`, `scene`
  and `drama`, ask every folder), `home` (get `brief`, `scene` and `drama`, put `decisions` and
  `scout`) and `archive` (get and move every folder; owner, 2026-10-23, and `scene` and
  `drama` the same day). Every request passes `authenticate` and then one of `serve`'s
  `may(grant.get | put | ask | move)` checks before anything reaches the store.
- _Falsified by_ a hunk that adds, removes or renames a role; adds a folder to, or removes one
  from, any role's `get`, `put`, `ask` or `move` list; changes which secret a role reads, or
  lets `authenticate` read another secret or accept an unset, empty or shared one; edits,
  loosens or removes a `may` check in `serve`, or changes which right a listing or method is
  checked against; lets `handle` reach `serve` or the store without a grant; adds a method to
  a route in `METHODS`; or renames, moves or deletes the `ROLES` table; when the PR
  description does not name the owner's decision to do so.
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
  may not put, and only the archive role archives.

**MB3: No token reaches the repo or a log.**

- _Claim:_ tokens exist only as Worker secrets; nothing committed holds one, and the single
  `console` call logs an error's message, never a request, a header or a body.
- _Falsified by_ a hunk that writes a token-like value into `wrangler.jsonc` (a `vars` entry,
  say) or any committed file; that adds a test fixture that looks like a real token (the tests'
  are `test-…`); that adds an `eslint-disable` of `no-console`, or a `console.*` call, whose
  arguments are or read from a `Request`, `Headers` or body; that changes what `report` passes
  to `console.error` from the error's `message`; or that removes `.dev.vars` from this
  workspace's `.gitignore`, or deletes or moves that file.
- _Scope:_ `apps/mailbox`.
- _Why not enforced:_ **mechanical; not yet a rule.** `no-console` is on repo-wide, so a second
  call needs a visible `eslint-disable`, which is what the falsifier watches. Whether a string
  is a real token is a reading, and no secret scanner runs over this workspace.
- _Checked at landing:_ one `console` call (`src/index.ts`, `report`, the error's `message`);
  no `vars` in `wrangler.jsonc`; no token-shaped string in the workspace.

**MB4: The Cloudflare account has no payment method.** _Not reviewable_: it is account state, so
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
migrations it has not applied, and a migration that fails is rolled back whole. For archiving (`0002_archive.sql`), also put `ARCHIVE_TOKEN` (step 4) and give the
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
