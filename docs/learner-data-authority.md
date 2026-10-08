# Learner-data authority

Where a learner's data lives, and what that means for what leaves their device.

`apps/www/src/lib/authority` decides it: a state union and one pure `step`
(`state.ts`), a runtime that owns the handles (`runtime.ts`), and a React hook
that only reads a snapshot (`use-authority.ts`). The reasoning for that shape is
`docs/monorepo-boundaries.md`, "Inside a React package: the component is not the
coordinator" (R1). What an account may hold is the canon's Remark 7.6
(`docs/canon/adaptive-learning-canon.typ`); this document is how the browser
keeps to it.

## The two questions

|                    | Asks                                       | Answers                                                                                                         |
| ------------------ | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| **Authority**      | Which store holds this learner's sessions? | `local` (this device), `account` (`file_host`), `pending` (a returning account user's session is being checked) |
| **Session belief** | Does this browser hold a server session?   | `unknown`, `signed-in`, `signed-out`                                                                            |

A person can hold a session and still learn on the device. An expired session
ends _account_ capability, not _local_ learning, and rewrites nothing.

Which authority a build starts in depends on what it can reach (`Backend`):

| Backend      | Builds                                                                | Starts as                                         |
| ------------ | --------------------------------------------------------------------- | ------------------------------------------------- |
| `none`       | the GitHub Pages demo, which also declares `connect-src 'self'` (LA5) | always `local`                                    |
| `remote`     | `vite dev`, `vite preview`, the Docker `lan` image                    | `local`; the account only by the person's own act |
| `in-process` | the Android app, whose backend is its own database                    | always the account                                |

## What leaves the device

|                                     | Learning on the device                       | On the account, reporting off                                          | On the account, reporting on               |
| ----------------------------------- | -------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------ |
| Sessions, settings, profile         | `localStorage`, never sent                   | sessions go to `file_host`                                             | the same                                   |
| Session probe (`GET /auth/session`) | never made                                   | at boot, only because the account was chosen                           | the same                                   |
| Passkey ceremonies                  | only when the person starts one              | the same                                                               | the same                                   |
| Lesson, round and vocab reads       | made, **without credentials**                | made, without credentials                                              | the same                                   |
| This device's sessions              | stay here                                    | copied only by "Copy to my account", per account, after a confirmation | the same                                   |
| `/signals`, `/presence/lease`       | never                                        | never                                                                  | sent                                       |
| Push subscription                   | never                                        | never                                                                  | the account's, on the person's own taps    |
| Shelf                               | never                                        | the account's, on the person's own taps                                | the same                                   |
| Speech                              | the browser's own voice                      | the server's speech service                                            | the same                                   |
| Reminders                           | the client's own policy, while a tab is open | the client's own policy, while a tab is open                           | the server's push, with the browser closed |

A returning account user whose server cannot be reached at boot (a timeout, a
5xx, a refused connection) stays on the account, and its calls fail where they
can be seen: only a 401 says the session is gone, so an outage can never move
their work to the device or leave it there. The next call asks again.

An account whose session ends (an expiry, another device signing out
everywhere) stays in place: the page keeps working on the device, a line says
the session ended, and nothing is wiped, uploaded or redirected. Only a page
that is the account's alone, with nothing to show without it, sends the person to
sign in. Reporting is off for every new sign-in, every sign-out and every move
back to the device; it survives an expiry and a reload for the same person.

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
  other purposes are `"ceremony"`, for the passkey ceremonies and the session
  probe, which carry no learner state, and `"reporting"`, for behaviour (signals,
  the presence lease, a push subscription), which needs the account _and_ the
  person's separate opt-in (LA6). The network globals (`fetch`,
  `XMLHttpRequest`, `WebSocket`, `EventSource`, `navigator.sendBeacon`) are
  restricted by lint in `apps/www/src` except in the two files that are the choke
  point: `lib/file-host-config/client.ts` and `lib/device-backend/interceptor/index.ts`.
- _Falsified by:_ a hunk that adds a `fetch`, `XMLHttpRequest`, `WebSocket`,
  `EventSource` or `sendBeacon` to a path under `apps/www/src` that carries
  sessions, signals, presence, a shelf item or a push subscription and does not
  go through `createFileHostTransport("account")`
  (or `"reporting"`, for behaviour; LA6); one
  that passes `"ceremony"` for such a request; one that makes
  `createFileHostTransport`'s `purpose` optional, or deletes its authority check
  or the per-send `isCurrent` check; one that adds an `eslint-disable` for
  `no-restricted-globals` or `no-restricted-properties` under `apps/www/src`, or
  a file to the exemption list in `apps/www/eslint.config.js`; or one that adds
  to `isCorpusRead` in `tests/local-mode/no-egress.spec.ts` a route that carries
  a learner's state.
- _Scope:_ `apps/www/src`. Not covered: a package under `packages/` that makes
  its own requests (`speech`, `ws`, `fetch-kit` corpus reads), which are listed
  above and carry no learner state by their own contracts.
- _Why not enforced:_ the globals are, by lint
  (`apps/www/eslint.config.js`), and the lint's exemption list and the absence of
  a disable are pinned by `lib/serving-privacy/__tests__/egress-choke-points.test.ts`.
  What no rule can check is that a request through the transport states its
  purpose truthfully: the type system enforces that a purpose is stated, not that
  it is true, and a lint rule cannot tell a learner-state request from a corpus
  read. The built app is the evidence for that: `tests/local-mode/no-egress.spec.ts`
  loads every local route against a stand-in `file_host` and fails on any request
  that is not a credential-free read of a lesson or round.

### LA2: signing in or enrolling never writes local data to the account

- _Claim:_ nothing in a ceremony's success path (`createAccount`, `signIn`,
  `markSignedIn`, `enterAccount`) reads this browser's local sessions or sends
  them anywhere; the sessions backend (`lib/tenant/sessions-backend.ts`) never
  creates or updates an account record from a local one; and the one transfer
  (`lib/tenant/sessions-transfer`) is started from one place, the confirmation
  button in `components/settings/data-home-section.tsx`, through
  `useCopyDeviceSessions` and `copyDeviceSessionsAndRefresh`. That button says
  what will be sent and to which account, takes a second press, and copies each
  session to the account in use at most once: the receipt records the ids the
  server minted, and the account is asked whether it still holds them. A create
  whose answer was lost is recorded before it is sent and, on the next press,
  looked for in the account (a session with the same name, layout, activities
  and scenes that no receipt entry claims) and adopted rather than repeated.
  There is no server idempotency key, so the one case this cannot tell apart is
  an identical session the account already held and nothing claims: it is adopted
  in place of a new copy, never added to. Across tabs, plan and run happen under
  one lock (`lib/tenant/transfer-lock`): Web Locks where the browser has them
  (https and localhost), where it is atomic; on plain `http://`, which has none,
  a renewed storage lease, which shrinks a race between two presses to the same
  instant without closing it. A second tab is told it is busy. The receipt is read
  from storage for every write, so a lock that did fail could not overwrite
  another tab's entries.
- _Falsified by:_ a hunk that makes a ceremony function, `markSignedIn`, or the
  sessions backend import `sessions-transfer` or call
  `createHttpSessionsRepository`'s `create`/`update` with data from
  `createSessionsRepository`; one that calls `copyDeviceSessions`,
  `copyDeviceSessionsAndRefresh`, `useCopyDeviceSessions`, `planTransfer` or
  `runTransfer` from anywhere but the file that owns that step; one that lets
  the button act on its first press; one that removes the `withTransferLock` call
  in `copyDeviceSessions`, or moves `planTransfer` or `runTransfer` out of the
  function it runs, so that either happens outside the lock; one that makes the
  lock grant on a lease it has not read back, or stop renewing a lease while a
  transfer runs (`lib/tenant/transfer-lock`); or one that has `runTransfer` write
  a receipt it read before the first send instead of reading it again for every
  write (the `write` helper).
- _Scope:_ `apps/www/src`.
- _Why not enforced:_ the callers are pinned by
  `lib/serving-privacy/__tests__/egress-choke-points.test.ts` (each name is
  called from exactly one file), and today's behaviour by
  `lib/tenant/__tests__/sessions-backend.test.ts` ("signing in uploads nothing")
  and `lib/tenant/sessions-transfer/index.test.ts`. A lint rule cannot say a
  button asked first: `components/settings/__tests__/data-home-section.test.tsx`
  pins that it does.

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
  (`leetype-content/index.test.ts`, "reads the corpus with no credentials"), and
  `lib/serving-privacy/__tests__/egress-choke-points.test.ts` parses `apps/www/src`
  and fails on a `createDataSource` call without `PUBLIC_READ`, and on a data source
  outside the three named directories being unlisted. What it cannot see is a
  corpus read made another way (a package's own `fetch`), which is LA1's scope note.

### LA5: the Pages build cannot reach another origin

- _Claim:_ every HTML document in a build made with `SOME_UI_PROFILE=pages` carries
  `<meta http-equiv="Content-Security-Policy" content="connect-src 'self'">` as the
  first element of `<head>`, so a `fetch`, `WebSocket`, `EventSource` or beacon to
  any other origin is blocked by the browser. The lan, Docker and Android builds
  do not carry it, and are not claimed to.
- _Falsified by:_ a hunk in `apps/www/vite.config.ts` that widens
  `PAGES_CONNECT_POLICY` beyond `'self'`, removes `pagesConnectPolicy()` from the
  plugin list, changes its `injectTo` from `head-prepend`, or changes the profile
  name it keys on; or one that adds another `<meta http-equiv>` policy to
  `apps/www/index.html` or `apps/www/resume/index.html` ahead of it.
- _Scope:_ `apps/www/vite.config.ts`, and the two HTML entries.
- _Why not enforced:_ a type or a lint rule cannot see a build's output. The
  claim is checked against the output by `tests/local-mode/no-egress.spec.ts`,
  which finds the tag, shows the policy blocks a real request, and loads five
  routes with no violation; `pr.yml` runs it on any change to `apps/www/src` or
  the files above (wiring, not reviewable here). The lan and Docker builds are
  left out because they reach `file_host` on another port of the same host, a
  speech provider the learner chose and a music-overlay socket, none of which a
  `connect-src` can name without also blocking the learner's own choices.

### LA6: behaviour reaches the account only with the person's opt-in

- _Claim:_ signals, the presence lease and a push subscription are sent only with
  a transport from `createFileHostTransport("reporting")`, which answers `null`
  unless the authority is the account and `reporting` is on (the device build's
  in-process backend aside, where nothing leaves the phone), and which refuses to
  send once either has stopped being true. `reporting` is off for a new sign-in,
  and is reset by every sign-in, every sign-out that forgets the account and
  every move back to the device. Turning it off ends the push subscription at
  both ends first, while the transport that can tell the server still works.
  What one tab decides binds the browser in the direction of less: another tab's
  switch to the device or turned-off opt-in is applied to every other tab at once
  (the `storage` event; `lib/authority/runtime.ts`), so it cannot keep sending
  until it reloads. Signing in or opting in is not copied between tabs.
- _Falsified by:_ a hunk that passes `"account"` or `"ceremony"` for a request
  that carries signals, presence or a push subscription; that makes `reporting`
  start on, or persist across `session-started`, a forgetting `session-ended` or
  a `chose` of the device; that changes `reportingAllowed` to ignore
  `reporting`; that flips the setting before the unsubscribe in
  `lib/study-nudge/reporting.ts`; or one that removes the `onRemoteChange` call
  in `createAuthority` (`lib/authority/runtime.ts`), stops `browserPorts`
  (`lib/authority/singleton.ts`) listening for `storage` events on the authority
  key, or drops either of the two things the listener does: dispatching `chose`
  of the device when the stored choice has become `local`, and dispatching
  `reporting-set` off when the stored opt-in has been turned off.
- _Scope:_ `apps/www/src/lib/authority`, `lib/file-host-config/client.ts`,
  `lib/study-nudge`.
- _Why not enforced:_ the state transitions are pure and tested
  (`lib/authority/__tests__`), the transport's refusals are
  (`lib/file-host-config/__tests__/client.test.ts`), and the built application
  is (`tests/local-mode/no-egress.spec.ts`: an account without the opt-in is sent
  no signals, presence or push, and reaches for push once it opts in). What no
  test can say is that a new caller chose the right purpose, which is LA1's
  limit too.

## Not covered, on purpose

- **The shared origin.** On GitHub Pages every project under the same `github.io`
  origin shares `localStorage` and cookies. This repo does not control that.
- **Device storage is not private storage.** Local data is the device's. It can be
  backed up by the OS (the Android manifest allows backup), read by anyone with
  the device, or lost with it. There is no recovery channel, by design.
- **What a learner chooses to send.** Binding the music overlay opens a WebSocket
  to `file_host`; a user-selected speech provider receives the text it speaks; a
  kept shelf item is stored verbatim; the phone's "Share with an agent"
  (`lib/agent-export`) hands Android's share sheet a file of the device's
  sessions, reflections, stops and soundbites, and the learner picks where it
  goes. These are explicit actions on the account path or by the learner, not
  defaults.
- **The server's side.** What `file_host` stores and logs is
  `paulgsc/server` `docs/identity.md`.
