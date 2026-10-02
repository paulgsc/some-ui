# Learner-data authority

Where a learner's data lives, and what that means for what leaves their device.

`apps/www/src/lib/authority` decides it: a state union and one pure `step`
(`state.ts`), a runtime that owns the handles (`runtime.ts`), and a React hook
that only reads a snapshot (`use-authority.ts`). The reasoning for that shape is
`docs/monorepo-boundaries.md`, "Inside a React package: the component is not the
coordinator" (R1).

## The two questions

|                    | Asks                                       | Answers                                                                                                         |
| ------------------ | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| **Authority**      | Which store holds this learner's sessions? | `local` (this device), `account` (`file_host`), `pending` (a returning account user's session is being checked) |
| **Session belief** | Does this browser hold a server session?   | `unknown`, `signed-in`, `signed-out`                                                                            |

A person can hold a session and still learn on the device. An expired session
ends _account_ capability, not _local_ learning, and rewrites nothing.

Which authority a build starts in depends on what it can reach (`Backend`):

| Backend      | Builds                                             | Starts as                                         |
| ------------ | -------------------------------------------------- | ------------------------------------------------- |
| `none`       | the GitHub Pages demo                              | always `local`                                    |
| `remote`     | `vite dev`, `vite preview`, the Docker `lan` image | `local`; the account only by the person's own act |
| `in-process` | the Android app, whose backend is its own database | always the account                                |

## What leaves the device

|                                     | Learning on the device                       | On the account                               |
| ----------------------------------- | -------------------------------------------- | -------------------------------------------- |
| Sessions, settings, profile         | `localStorage`, never sent                   | sessions go to `file_host`                   |
| Session probe (`GET /auth/session`) | never made                                   | at boot, only because the account was chosen |
| Passkey ceremonies                  | only when the person starts one              | the same                                     |
| Lesson, round and vocab reads       | made, **without credentials**                | made, without credentials                    |
| `/signals`, `/presence/lease`       | never                                        | sent while the account is the authority      |
| Shelf, push subscription            | never                                        | the account's, on the person's own taps      |
| Speech                              | the browser's own voice                      | the server's speech service                  |
| Reminders                           | the client's own policy, while a tab is open | the server's push                            |

Corpus reads still reach the host and are visible to it and to the network: a
request for a lesson is a request. What they do not carry is a cookie, so the
operator cannot tell a learner who chose the device from an account holder by
them. This is a statement about application payloads. It is not network
anonymity, and it says nothing about static-asset requests, the reverse proxy's
logs or any service the learner themselves invokes (a user-selected speech
provider, binding the music overlay to a WebSocket).

## Invariants

Declared in the form `CLAUDE.md` asks for. Each is true of the code where it is
declared (checked by reading every call site and by the tests named).

### LA1: learner state reaches the operator's backend only through the account transport

- _Claim:_ in `apps/www/src`, every request that carries learner state to
  `file_host` is made with a transport from `createFileHostTransport("account")`,
  which answers `null` unless the authority is the account, and which refuses to
  send once the authority has become a different one (`StaleAuthorityError`). The
  other purpose, `"ceremony"`, is for the passkey ceremonies and the session
  probe, which carry no learner state.
- _Falsified by:_ a hunk that adds a `fetch`, `XMLHttpRequest`, `WebSocket`,
  `EventSource` or `sendBeacon` to a path under `apps/www/src` (or a package it
  imports) that carries sessions, signals, presence, a shelf item or a push
  subscription and does not go through `createFileHostTransport("account")`; one
  that passes `"ceremony"` for such a request; or one that makes
  `createFileHostTransport`'s `purpose` optional, or deletes its authority check
  or the per-send `isCurrent` check.
- _Scope:_ `apps/www/src`. Not covered: a package under `packages/` that makes
  its own requests (`speech`, `ws`, `fetch-kit` corpus reads), which are listed
  above and carry no learner state by their own contracts.
- _Why not enforced:_ the type system enforces that a purpose is stated, not that
  it is truthful, and a lint rule over network globals cannot tell a learner-state
  request from a corpus read without a list of choke points. **Mechanical; not yet
  a rule:** restrict the network globals outside the files named above.

### LA2: signing in or enrolling never writes local data to the account

- _Claim:_ nothing in a ceremony's success path (`createAccount`, `signIn`,
  `markSignedIn`, `enterAccount`) reads this browser's local sessions or sends
  them anywhere; and the sessions backend (`lib/tenant/sessions-backend.ts`)
  never creates or updates an account record from a local one.
- _Falsified by:_ a hunk that makes a ceremony function, `markSignedIn`, or the
  sessions backend call `migrateLocalSessions` or `createHttpSessionsRepository`'s
  `create`/`update` with data from `createSessionsRepository`; or that restores a
  call to `migrateLocalSessions` that is not behind an explicit, per-account
  confirmation by the person.
- _Scope:_ `apps/www/src/lib/auth`, `apps/www/src/lib/tenant`.
- _Why not enforced:_ a test pins today's behaviour
  (`lib/tenant/__tests__/sessions-backend.test.ts`, "signing in uploads nothing"),
  but a new caller could add an upload on a path the test does not exercise.

### LA3: a result that outlives its authority is dropped

- _Claim:_ every sessions-store call reads the authority when it starts and, if
  the authority is a different one when it finishes, rejects with
  `StaleAuthorityError` instead of returning, so a view never shows data from the
  store it has moved away from.
- _Falsified by:_ a hunk that adds a method to the object `createSessionsBackend`
  returns without going through `through`, or that removes the `isCurrent` check
  from `through`.
- _Scope:_ `apps/www/src/lib/tenant/sessions-backend.ts`.
- _Why not enforced:_ a test covers the in-flight write
  (`"a result that outlives its authority"`); a lint rule cannot say a method
  "goes through" a helper. The epoch is advanced by `step`, which is pure and
  tested (`lib/authority/__tests__/state.test.ts`).

### LA4: a corpus read carries no credentials

- _Claim:_ a `createDataSource` for lessons, rounds, runs or vocab passes
  `PUBLIC_READ` in its `fetchOptions`, so `credentials` is `"omit"`.
- _Falsified by:_ a hunk that adds a `createDataSource` in `apps/www/src/lib/*-content`
  or `hangul-vocab` without `fetchOptions: PUBLIC_READ` (or spreading it), or that
  changes `PUBLIC_READ.credentials`.
- _Scope:_ `apps/www/src/lib/{topik-content,leetype-content,hangul-vocab}`.
- _Why not enforced:_ a test observes the wire for leetype
  (`leetype-content/index.test.ts`, "reads the corpus with no credentials"); the
  other two share the constant, and nothing finds a _new_ data source. **Mechanical;
  not yet a rule.**

## Not covered, on purpose

- **The shared origin.** On GitHub Pages every project under the same `github.io`
  origin shares `localStorage` and cookies. This repo does not control that.
- **Device storage is not private storage.** Local data is the device's. It can be
  backed up by the OS (the Android manifest allows backup), read by anyone with
  the device, or lost with it. There is no recovery channel, by design.
- **What a learner chooses to send.** Binding the music overlay opens a WebSocket
  to `file_host`; a user-selected speech provider receives the text it speaks; a
  kept shelf item is stored verbatim. These are explicit actions on the account
  path or by the learner, not defaults.
- **The server's side.** What `file_host` stores and logs is
  `paulgsc/server` `docs/identity.md`.
