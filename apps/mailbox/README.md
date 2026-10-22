# @some-ui/mailbox

A Cloudflare Worker and a D1 database that hold three kinds of file for the Jobs wing: the
daily **digest** (`brief`), the phone's **decisions** (`decisions`) and its **scouts**
(`scout`). The cloud routine and the home server each reach it with their own token, so the
files move between them without a hand-carried step.

## Why it exists

The Jobs routine runs in the cloud at 07:52 Pacific. It cannot reach the home server, which
answers only on the home network. Home can make outbound requests, so both sides meet here:

```
cloud routine ──PUT brief──▶ [ mailbox ] ◀──GET brief── home ◀── phone (while Jobs is open, at home)
cloud routine ◀─GET decisions, scout── [ mailbox ] ◀──PUT decisions, scout── home ◀── phone
```

The phone talks to home only. Home carries no audio (`docs/identity.md` in `paulgsc/server`,
invariant 16), so voice notes do not travel here; they keep going to Drive by the share sheet.
Drive stays in use alongside this until the owner retires it for Jobs.

## What it keeps

One row per file, in the folder it belongs to, kept for good. A name holds one body: putting
the same bytes again changes nothing, and putting other bytes under a held name is refused.
Each row records who put it (`routine` or `home`), when, and the SHA-256 of its bytes.

## API

Every request needs `Authorization: Bearer <token>`. Every answer is JSON, or the stored bytes.

| Request                                                 | Answer                                                                                                                                                                                                                                                 |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /v1/:folder/items?after=<seq>&limit=<n>`           | `200 {"items":[{"seq","name","size","sha256","contentType","putAt"}]}`, oldest first, `seq > after` (default 0), `limit` 1–50 (default 50). Metadata only. A whole number outside those bounds is `422`.                                               |
| `GET /v1/:folder/items/:name`                           | `200` with the stored bytes, `Content-Type` as stored and `ETag: "<sha256>"`; `404` if absent.                                                                                                                                                         |
| `PUT /v1/:folder/items/:name` (body = the file's bytes) | `201 {"change":"added","seq"}`; `200 {"change":"unchanged","seq"}` for the same bytes; `409 {"error":"conflict"}` for other bytes under a held name; `413` when the body is over the cap; `422 {"error":"…why…"}` when the name or content is refused. |
| anything else                                           | `404`; a method the path does not take is `405` with `Allow`. A missing or wrong token is `401`, a token that may not do this is `403`, and storage failing is `503`.                                                                                  |

The folders are `brief`, `decisions` and `scout`.

### Who may do what

| Secret          | Role      | May                                       |
| --------------- | --------- | ----------------------------------------- |
| `ROUTINE_TOKEN` | `routine` | read all three folders; put `brief`       |
| `HOME_TOKEN`    | `home`    | read `brief`; put `decisions` and `scout` |

A secret that is unset or empty authenticates no one, and one value set for both roles
authenticates neither. There is no third role. Letting the phone read `brief` from here
directly would be one, and it is the owner's call, so it is not built.

### What a put must satisfy

- **Name**, anchored to its folder: `brief` takes `digest-YYYY-MM-DD.json`; `decisions` takes
  `decisions-YYYY-MM-DD.json` or `decisions-YYYY-MM-DD-<n>.json`; `scout` takes
  `scouts-YYYYMMDDTHHMMSS.json`. Anything else, voice-note names included, is `422`.
- **Content type** `application/json` (parameters such as `charset` are ignored), and the body
  must be UTF-8 JSON with no byte-order mark.
- **Schema**: the top-level `schema` must be `some-ui.job-digest/1`, `some-ui.job-decisions/1`
  or `some-ui.job-scouts/1` to match the folder. The Worker checks that and nothing deeper;
  the readers validate the full shape.
- **Size**: at most 1,048,576 bytes. A declared `Content-Length` over that is refused before
  the body is read, and a body that declares nothing is cut off as it passes the cap. Real
  files are under 20 KB.

## Limits

This runs on the Workers Free plan and D1 Free plan. Past a daily limit the plan fails the
operation; it does not bill (see MB4).

- Workers Free: 100,000 requests a day, 10 ms of CPU per request.
- D1 Free: 500 MB a database, 100,000 rows written and 5 million read a day, 2,000,000 bytes
  a row, 50 queries per invocation. Each request here uses at most two.
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

**MB1: An item is never rewritten or removed by this code.**

- _Claim:_ in `apps/mailbox`, no source file or migration updates, deletes or replaces an
  `item` row: the adapter's only write is
  `INSERT … ON CONFLICT (folder, name) DO NOTHING`, and the table carries two `BEFORE`
  triggers that abort an `UPDATE` or a `DELETE`.
- _Falsified by_ a hunk that drops, renames or weakens either trigger (a later migration that
  drops a trigger or the table included); that adds an `UPDATE`, `DELETE`, `INSERT OR REPLACE`,
  `REPLACE INTO` or `ON CONFLICT … DO UPDATE` against `item` anywhere in `src/` or
  `migrations/`; that changes `put` in `store.ts` away from `DO NOTHING`; or that deletes or
  loosens the trigger cases in `__tests__/store.test.ts`.
- _Scope:_ `apps/mailbox`.
- _Why not enforced:_ the triggers and `store.test.ts` enforce `UPDATE` and `DELETE` (each case
  fails if its trigger is removed). They do **not** enforce `INSERT OR REPLACE`: SQLite runs the
  delete trigger for the row a `REPLACE` removes only when `recursive_triggers` is on, and it is
  off by default. I checked this on SQLite 3.49.1 through sql.js: `INSERT OR REPLACE` replaced
  the row (seq 1 became 2, the hash changed) and neither trigger fired. I have not checked
  D1 itself. So the `REPLACE` half rests on this falsifier alone. Lint cannot read SQL
  strings and a type cannot see them. Closing it in the database would take a `BEFORE INSERT`
  guard and a `put` that reads before it writes, which changes the table's design. The owner
  chose to leave the gap (2026-10-21) rather than add that guard, so a hunk that adds a
  `REPLACE` is what a reviewer is watching for, and it is a violation if one lands.
- _Checked at landing:_ the only SQL in `src/` is the one `INSERT … DO NOTHING` and four
  `SELECT`s in `store.ts`; the words UPDATE, DELETE and REPLACE appear there only in comments.

**MB2: Roles.**

- _Claim:_ the `ROLES` table in `src/core.ts` is the only place a token is mapped to what it
  may do, and it holds exactly two roles: `routine` (read all three folders, put `brief`) and
  `home` (read `brief`, put `decisions` and `scout`).
- _Falsified by_ a hunk that adds a role, adds a folder to any role's `get` or `put` list,
  adds a method to a route in `routeOf`, or makes `authenticate` read another secret, when the
  PR description does not name the owner's decision to do so.
- _Scope:_ `apps/mailbox/src/core.ts` and `wrangler.jsonc`.
- _Why not enforced:_ `__tests__/core.test.ts` pins today's matrix (every role against every
  folder and method), but a hunk that changes the table and the test together passes it. A test
  cannot know the owner agreed.
- _Checked at landing:_ `ROLES` has two entries; no code outside `authenticate` reads a token.

**MB3: No token reaches the repo or a log.**

- _Claim:_ tokens exist only as Worker secrets; nothing committed holds one, and the single
  `console` call logs an error's message, never a request, a header or a body.
- _Falsified by_ a hunk that writes a token-like value into `wrangler.jsonc` (a `vars` entry,
  say) or any committed file; that adds a test fixture that looks like a real token (the tests'
  are `test-…`); that adds an `eslint-disable` of `no-console`, or a `console.*` call, whose
  arguments are or read from a `Request`, `Headers` or body; or that removes `.dev.vars` from
  this workspace's `.gitignore`.
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

## Deploy (the owner does this; nothing here deploys itself)

There is no deploy workflow. Run the commands from the repo root: `pnpm --filter
@some-ui/mailbox exec wrangler …` runs this workspace's pinned wrangler inside `apps/mailbox`,
where `wrangler.jsonc` is (run `pnpm install` once first). A bare `npx wrangler` from the root
finds no config, so everything after step 2 needs it. The database was created in step 2 on
2026-10-22 and its id is already in `wrangler.jsonc`.

1. Create a Cloudflare account. **Add no payment method**, and confirm Billing lists none (MB4).
2. `npx wrangler login`, then `npx wrangler d1 create some-ui-mailbox`. Put the printed
   `database_id` into `wrangler.jsonc`. It is not a secret. Keep the binding named `DB`:
   wrangler's suggested snippet calls it `some_ui_mailbox`, which the Worker does not read.
3. `pnpm --filter @some-ui/mailbox exec wrangler d1 migrations apply some-ui-mailbox --remote`.
4. Make two long random tokens, for example `openssl rand -base64 32` twice, and run
   `pnpm --filter @some-ui/mailbox exec wrangler secret put ROUTINE_TOKEN` and the same with
   `HOME_TOKEN`.
5. `pnpm --filter @some-ui/mailbox exec wrangler deploy`, and note the URL,
   `https://some-ui-mailbox.<subdomain>.workers.dev`.
6. Smoke test with the routine's token:

   ```sh
   curl -i -X PUT -H "Authorization: Bearer $ROUTINE" -H "Content-Type: application/json" \
     --data '{"schema":"some-ui.job-digest/1"}' $URL/v1/brief/items/digest-2000-01-01.json   # 201
   ```

   Repeat it for `200 unchanged`. Send other bytes under that name for `409`. The item stays
   for good, which is fine: it is dated 2000.

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
  and the D1 adapter, so the stand-in cannot drift from the real one. The adapter is checked
  with a BLOB returned as an array of byte values, as D1 does, and as bytes.
- The tests use sql.js rather than `@cloudflare/vitest-pool-workers`: that pool needs
  `vitest ^4.1`, and this repo runs vitest 5.
- `pnpm-workspace.yaml` denies `workerd`'s install script (`allowBuilds`): nothing here runs
  workerd, so pnpm 12 needs it denied or allowed to finish an install.
