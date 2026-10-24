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

|                                             | Learning on the device                       | On the account, reporting off                                                                                                                                                                                                                                                                                  | On the account, reporting on               |
| ------------------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Sessions, settings, profile                 | `localStorage`, never sent                   | sessions go to `file_host`                                                                                                                                                                                                                                                                                     | the same                                   |
| Session probe (`GET /auth/session`)         | never made                                   | at boot, only because the account was chosen                                                                                                                                                                                                                                                                   | the same                                   |
| Passkey ceremonies                          | only when the person starts one              | the same                                                                                                                                                                                                                                                                                                       | the same                                   |
| Lesson, round and vocab reads               | made, **without credentials**                | made, without credentials                                                                                                                                                                                                                                                                                      | the same                                   |
| This device's sessions                      | stay here                                    | copied only by "Copy to my account", per account, after a confirmation; the phone's, to its paired home, by "Send to home", which then frees the finished ones home confirms it holds (LA8)                                                                                                                    | the same                                   |
| `/signals`, `/presence/lease`               | never                                        | never                                                                                                                                                                                                                                                                                                          | sent                                       |
| Push subscription                           | never                                        | never                                                                                                                                                                                                                                                                                                          | the account's, on the person's own taps    |
| Reflections                                 | on the device (at most 20), never sent       | never sent (LA7)                                                                                                                                                                                                                                                                                               | never sent (LA7)                           |
| Shelf                                       | never                                        | the account's, on the person's own taps                                                                                                                                                                                                                                                                        | the same                                   |
| aph (the phone's)                           | on the phone, never sent                     | once its person keeps it on home, on the paired home, synced while aph is open; the phone keeps only what home has not confirmed; stopped from aph's mark, which brings it back (LA9)                                                                                                                          | the same                                   |
| Jobs record (the phone's)                   | on the phone, never sent                     | once its person keeps it on home, a copy on the paired home, synced while the Jobs wing is open; its decisions and scouts files without voice, filed with home, which hands them to the Jobs mailbox on Cloudflare; the phone keeps its whole log; stopped from the wing's mark or Settings (LA10)             | the same                                   |
| Practice (the phone's)                      | on the phone, never sent                     | once its person ticks "Keep sending" in the send's confirm, its finished sessions and kept items sent while Practice is open; nothing let go on its own; stopped from its mark or Settings (LA11)                                                                                                              | the same                                   |
| The routine's word sets and dramas (home's) | not read                                     | read with the account's session while Korean is open; in the Android app, once its person shows them in Korean (Settings), from the paired home with the pairing's key while Korean is open, nothing of the phone's sent, its newest files and its run records kept on the phone; stopped from Settings (LA12) | the same                                   |
| Speech                                      | the browser's own voice                      | the server's speech service                                                                                                                                                                                                                                                                                    | the same                                   |
| Reminders                                   | the client's own policy, while a tab is open | the client's own policy, while a tab is open                                                                                                                                                                                                                                                                   | the server's push, with the browser closed |

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
  its own requests (`speech`, `ws`, `fetch-kit` corpus reads, and `resume`'s
  `renderResume`, which sends the owner's own contact details to the LAN
  résumé service), which carry no learner state by their own contracts.
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
  server answered with, and the account is asked whether it still holds them. A create
  whose answer was lost is recorded before it is sent and, on the next press,
  looked for in the account (a session with the same name, layout, activities
  and scenes that no receipt entry claims and no attempt named) and adopted
  rather than repeated.
  On the Android app the copy to its paired home is `copySessionsTo`
  (`lib/tenant/sessions-copy`, which the phone build may carry), called
  only from `lib/home-link/sessions` behind the Home server block's confirm
  (LA8), with the same plan and receipt, no lock (the phone's link runs one
  thing at a time) and no authority (the pairing is the account). The phone's
  copy also names each create's id, kept with its attempt until home answers:
  a home that creates once per id (paulgsc/server#432) is asked for that id
  first, and sent the same create again if it lacks it.
  The browser's transfer names none, and a home that predates that mints its
  own, so the one case these cannot tell apart is
  an identical session the account already held and nothing claims: it is adopted
  in place of a new copy, never added to. Across tabs, plan and run happen under
  one lock (`lib/tenant/transfer-lock`): Web Locks where the browser has them
  (https and localhost), where it is atomic; on plain `http://`, which has none,
  a renewed storage lease, which shrinks a race between two presses to the same
  instant without closing it. A second tab is told it is busy. The receipt is read
  from storage for every write, so a lock that did fail could not overwrite
  another tab's entries.
- _Falsified by:_ a hunk that makes a ceremony function, `markSignedIn`, or the
  sessions backend import `sessions-transfer` or `sessions-copy`, or call
  `createHttpSessionsRepository`'s `create`/`update` with data from
  `createSessionsRepository`; one that calls `copySessionsTo`,
  `copyDeviceSessions`,
  `copyDeviceSessionsAndRefresh`, `useCopyDeviceSessions`, `planTransfer` or
  `runTransfer` from anywhere but the files that own that step (the plan and
  the run are `lib/tenant/sessions-copy`'s, called by the browser's transfer
  and the phone's copy alone); one that drops `planTransfer`'s look for an
  attempt's named id before its content match, lets the content match take an
  id an attempt named, or stops `copySessionsTo` passing `runTransfer` its
  `mint`, so the phone's copy falls back to content alone; one that lets
  the button act on its first press; one that removes the `withTransferLock` call
  in `copyDeviceSessions`, or moves `planTransfer` or `runTransfer` out of the
  function it runs, so that either happens outside the lock; one that makes the
  lock grant on a lease it has not read back, or stop renewing a lease while a
  transfer runs (`lib/tenant/transfer-lock`); one that has `runTransfer` write
  a receipt it read before the first send instead of reading it again for every
  write (the `write` helper); one that removes or bypasses what keeps a copy
  single: `planTransfer`'s check of each recorded copy (`remote.get`) or its
  adoption of an unconfirmed attempt, or `runTransfer`'s receipt writes around
  a create (`attempting` before it, `remember` after it, `answeredNo` on a
  refusal); or one that makes `copySessionsTo` stop calling `planTransfer`
  and then `runTransfer` once each, hand them a storage other than the
  receipt's (`browserLocalStorage` by default), or create or update a session
  outside them.
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
- _Scope:_ `apps/www/src/lib/{topik-content,hangul-vocab}`.
- _Why not enforced:_ `lib/serving-privacy/__tests__/egress-choke-points.test.ts`
  parses `apps/www/src` and fails on a `createDataSource` call without
  `PUBLIC_READ`, and on a data source outside the named directories being
  unlisted. What it cannot see is a
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

### LA7: a reflection reaches no server

- _Claim:_ a session reflection (a typed line, a voice note, the one-tap
  answers; `lib/session-reflection`), or any value built from one, is never
  passed to anything that sends to `file_host` or writes what does (a session
  record, a signal, the device backend's database). It leaves the device only
  through the share sheet (`lib/agent-export`), which the person starts. Two
  allowlists in `apps/www/eslint.config.js` bound where one can travel: the
  modules that hold or show reflections (`REFLECTION_MODULES`) import from `@/`
  only what `REFLECTION_MAY_IMPORT` names (from the tenant, only
  `useSessions`) and nothing from `fetch-kit`; and no module imports a
  reflection module but those, `REFLECTION_IMPORTERS` and tests
  (`reflection-voice/budget`, a size, aside). An importer may write sessions
  of its own (the player completes one, the study list deletes them); it
  never writes one with a reflection.
- _Falsified by:_ a hunk that removes or narrows either LA7 block (a glob, a
  pattern, the restated base patterns), moves a module that holds reflections
  out of `REFLECTION_MODULES`, or adds an `eslint-disable` of
  `no-restricted-imports` in a file either block covers; a hunk that adds a
  name to `REFLECTION_MAY_IMPORT`, `REFLECTION_IMPORTERS` or
  `allowImportNames` (each is a new place a reflection can reach, so read the
  module it names against the next clause); or a hunk, in `lib/agent-export`
  or a module either list names, that passes a reflection or a value built
  from one to a call that sends to `file_host` or writes a session, a signal
  or the device backend's database.
- _Scope:_ `apps/www/src`. The way out by the share sheet is LA1's "what a
  learner chooses to send" (below), not a request.
- _Why not enforced:_ the imports are, by lint (checked when declared by
  adding a banned import to a probe file on each side: each failed, and
  `budget` passed). What a lint cannot see is where a value goes once an
  allowed module has it: `lib/agent-export` reads the sessions repository and
  the reflections, as sharing needs, and the importers that render reflection
  components write sessions of their own. That is data flow, not an import.
  Held when declared, by reading each: `agent-export` gives reflections to
  `shareFiles` alone and reads the sessions repository only for names and
  dates, and the importers only render reflection components or call
  `sweepOrphans`.

### LA8: the phone reaches its home server only when tapped, and says where

- _Claim:_ in the Android app, every request to the home server goes through
  `lib/device-backend/native-http` (the one module that names
  `CapacitorHttp`), which only `lib/home-link` calls, and, but for a record
  kept on home (aph, LA9; the Jobs record, LA10; Practice, LA11) and for
  Korean's look at the routine's files (LA12, the one request started
  neither by a tap nor by a record's send), which are the other callers of
  `lib/home-link`, is started by a tap
  in the Home server block of Settings
  (`components/settings/device-section.tsx`):
  the sync (published lessons and rounds, read with no credential), pairing
  (the code only), unpairing, and the send to home (`lib/home-link/send`,
  after one confirm that names how many sessions and kept items and the
  host): the phone's sessions, each one's record, its plan, status and
  times, created once, restored with one patch, and patched again whenever
  the phone's record has moved on from home's copy; home is read only to
  learn what it already holds and, once the copy has run, to read back each
  finished session (`mayLeavePhone`: completed, not today's) and confirm it
  holds it exactly as the phone does (`confirmHeld`), and the phone then
  lets go of its own copy of those alone, each unchanged since it was read;
  then one PUT per item kept on this phone's shelf that home does not hold
  as it is now, by what home last answered for it under this pairing
  (`./sent`), its bytes as kept, nothing read back and the item kept on the
  phone. Nothing on home is
  deleted. Outside LA9 to LA12, nothing is sent when the app or Settings
  opens, on resume, on a timer or on a network change: making the runtime and
  `load` read only the phone's own record. There is no retry; a sync, a send,
  a copy or a record's keeping ends at Stop, or when the app goes to the
  background, before its next request, and is over only once every request
  it started has settled.
  The pairing's credential is sent only to the base stored with it, over
  `https:` (`homeRequest` refuses a credentialed `http:` URL), and never on
  a sync read; no redirect is followed. Unpairing forgets it on the phone whether or
  not home could be told, and says which. The pair button names the host
  before it is pressed, and every send names it. The credential is stored
  only by `HomeCredentialPlugin`, sealed by the Android Keystore, kept out of
  every backup and device-to-device transfer (`res/xml/backup_rules.xml`,
  `res/xml/data_extraction_rules.xml`, both named by the manifest), and
  deleted on a read, with its key, only when it cannot be read and the
  Keystore does not mark the fault as one that may pass (Android 13+).
- _Falsified by:_ a hunk that removes, narrows or widens the allowlists of
  the LA8 checks in
  `lib/serving-privacy/__tests__/egress-choke-points.test.ts` (who may name
  `CapacitorHttp`, call `native-http`, call `lib/home-link`); one that calls
  a `homeLink()` method that sends (`pair`, `unpair`, `sync`, `send`) from anywhere but
  a press handler in the Home server block or a module that block calls; one
  that calls its `keep` from anywhere but `lib/home-link/lanes.ts` (LA9 to
  LA11) and `lib/home-link/routine.ts` (LA12); one
  that sends from `createHomeLink`,
  `load`, or, outside LA9 to LA12, a `useEffect`, a timer, a
  `visibilitychange` or `online` listener; one that retries a failed home
  request, or queues one for later, outside LA9 to LA11; one that lets the send start without
  its confirm, or drops a count or the host from that confirm; one that
  sends shelf items other than `everyKept`'s, or with a method other than
  `PUT`; one that passes `sendKept` kept items that did not come through
  `keptToSend` (in `lib/home-link/send`), or that deletes, bypasses or
  weakens its filter (`shelfToSend` in `./sent`: an item goes unless what
  home last answered for it under this pairing holds its bytes as they are
  now), so the send carries what home already holds; one that passes `copySessionsTo` anything but session records
  (a reflection, a stop or a soundbite: LA7), or lets `homeTransport` send a
  method other than `GET`, `POST` or `PATCH`, or hand a `401` to
  `requestJSON` (the app's own sign-out); one that sends a session's create
  or patch other than through `copySessionsTo` (which LA2 keeps to one
  create per session, and patches only to finish a copy or bring it up to
  date); one that lets the send remove a phone session that
  `confirmHeld` did not report held, that `mayLeavePhone` refuses, or that
  changed since it was read (`letGoUnchanged`), or that drops the freeing from
  the send's confirm; one that widens `mayLeavePhone` (in
  `lib/device-backend/handlers/sessions`) to pass a session that is not
  completed or that was started or finished today, or that deletes,
  renames or moves it, or replaces a call to it with a condition of its
  own, without the same test at every site that picks what may leave; one
  that deletes or weakens `removeUnchanged`'s `updated_at` match (in the
  same file), or lets `letGoUnchanged` (`lib/session-archive`) delete by
  any other route; each lets the send remove what the claim keeps; one that makes
  `confirmHeld` write, or compare less than everything a copy carries
  (`sameRecord`); one that lets the runtime's `work` end before every
  request it started has settled (`inFlight`, `track`), so a second tap could
  race a create still on its way; one that deletes or weakens the
  `onHidden` subscription in the runtime's `work`, the `stopPressed` it
  dispatches, the `stopped()` check in the `get` it hands out, or
  `onHidden`'s stop of a sync that starts already hidden
  (`lib/home-link/visibility.ts`); one that passes `token` on a sync's
  `get`, or with a URL not built from the stored pairing's `base` (or, in
  `pair`, the address being paired); one that removes `homeRequest`'s
  `https:` check or its `disableRedirects`;
  one that lets `unpair` keep the credential when the request fails, or
  report the phone unpaired when forgetting it failed; one that
  removes the host from the pair button or the paired line; one that writes
  the pairing record anywhere but `HomeCredentialPlugin`, or stores it there
  unencrypted; one that makes `HomeCredentialPlugin` delete the record or
  its key (`forgetKey`) anywhere but `read`'s `Lost` branch and `write`'s
  retry after a failure `mayPass` refuses; one that adds a `Lost` throw in
  `decrypt`, or widens a catch that becomes one, without consulting
  `mayPass`, removes a `mayPass` check `decrypt` makes, moves loading the
  Keystore inside such a catch, narrows `mayPass`, or makes `storedKey`
  throw `UnrecoverableKeyException` for anything but an entry that is not
  a secret key; or one that
  removes or narrows an `<exclude>` in either backup rule file, removes
  `android:fullBackupContent` or `android:dataExtractionRules` from the
  manifest, or renames `HomeCredentialPlugin.PREFS` without them.
- _Scope:_ `apps/www/src` (the phone build), `apps/mobile/android`.
- _Why not enforced:_ who may reach home is, by test (`egress-choke-points`:
  `CapacitorHttp` named only in `native-http`, whose index only
  `lib/home-link/index.ts` imports as a value (its `no-answer` sibling holds
  an error class and no request), and `lib/home-link` imported
  only by the Home server block and its ledger of what is shared, the marks
  of the records kept on home, what hands aph's lane to its mark, and
  LA12's choice and port; the routine's read sends one `GET /routine/files`
  and nothing else). What a test cannot say is that a call
  site in that block is a tap: a lint rule cannot
  tell a press handler from an effect that reaches it through a helper.
  Held when declared, by reading every caller (`device-section.tsx` alone
  calls `pair`, `unpair`, `stop` and, through `lib/home-link/sync` and
  `lib/home-link/send`, `sync` and `send`, each from a button's `onPress`
  or `onClick`) and by `lib/home-link/__tests__/runtime.test.ts`,
  `shelf.test.ts`, `sessions.test.ts` (a finished session leaves the phone
  only once home holds it as it is, a moved-on one once home's copy is
  brought up to date; an unfinished one, today's and one home could not be
  asked about stay) and
  `components/settings/__tests__/device-section.test.tsx` (opening Settings,
  paired or not, sends nothing; unpairing and the send each take a second
  press), with `device-sharing-ledger.test.tsx` for the ledger it mounts. Held again when the marks of the records kept on home
  (`components/device-home-glyph.tsx`, one wiring in
  `lib/home-link/lanes.ts`) joined the link's callers: the mark calls none
  of `pair`, `unpair`, `sync`, `send` or `stop`, and reaches home only
  through `lanes.ts`, the one caller of `keep`, by `askLane` from its Send
  now button, the watch `useLaneHome` mounts, for aph, one read of home's
  record (`bringBack`) after its person's stop, and the telling of each
  choice (`lib/home-link/told.ts`: first in a run, and for a stop of a lane
  with no way back, from the stop's second press in the mark or Settings'
  ledger, and again when a mark's link listener finds that run turned away
  busy): all LA9's; its choices add to the consent log, and home is told
  each, never its words. Held again when Korean's look at the routine's
  files (LA12) joined `keep`'s callers: `lib/home-link/routine.ts` calls it
  only from `list`, with one `GET /routine/files`, never retried, and
  nothing else of the link (`egress-choke-points` pins that it calls `keep`
  and sends that one request; that it does so only from `list` is read).

### LA9: aph is sent home only while its person is using it

aph, the Jobs record and Practice are kept on home through one wiring
(`lib/home-link/lanes.ts`): each declares its lane (its scopes, its exchange,
how its record moves, its sheet's counts; `aph.ts`, `jobs.ts`,
`practice.ts`), and every lane shares the consent log, the runtime, the watch
and the mark (`components/device-home-glyph.tsx`). This invariant states the
wiring's claim for every lane, and aph's own; LA10 and LA11 add the Jobs
record's and Practice's.

What aph may send home, and what the phone may let go of, is enforced by
test: who reaches the link and its `keep` lane (`egress-choke-points`), the
requests an exchange makes and that an entry leaves the phone only once home
answers with it unchanged (`packages/ui/aph/src/lib/__tests__/sync.test.ts`,
`home.test.ts`), that bringing aph back sends nothing, keeps what waited here
and sets aside a change that clashes with home's record (`sync.test.ts`), one
run at a time, that every request a run makes finds a scope still kept and
that home being busy is said as such (`lib/home-link/__tests__/kept.test.ts`),
that home is told each choice once, in the order made, and nothing more
(`told.test.ts`), and the mark's two presses, its stop and its way back
(`components/__tests__/device-home-glyph.test.tsx`). What no test can say is
when a run is asked for:

- _Claim:_ `askKept` (`lib/home-link/kept-watch.ts`) asks for a run of a lane
  only at a moment its person is using that lane's wing: from `watchKept`,
  which only `useLaneHome` starts, for as long as the lane's mark (`LaneMark`,
  which `DeviceHomeGlyph` mounts only in the Android app's header, for the
  wing that shows) is mounted, on the mark mounting, a move of the lane's
  revision (its record changed on this phone, or the consent log grew), the
  app coming back to the foreground, the network coming back, the phone being
  paired, or the link freeing up after turning a run away; or from `askLane`,
  which the mark's sheet calls only from its Send now button. Each asks only
  when the consent log keeps one of the lane's scopes under the paired home's
  id and the document is visible, and every request of the record's that a
  run makes first finds one still kept (`laneExchange`), so a stop ends a run
  before its next such request; telling home a choice is not gated, since a
  stop is one. Nothing asks on a timer. A kept choice enters the log only from the
  mark's second press, with the words its first press showed (`offer`), from
  Settings' send with its box ticked (Practice, LA11), or once, as found
  (`said: null`), for a lane whose record's own switch kept it on home before
  the log and whose scopes no choice ever named, under a pairing an earlier
  build made (the link's `earlier`: its record's `choicesLogged` is not
  `true`, which every pairing this build makes is kept with), never one this
  build made; a stop only from the second press of Stop sending, in the
  mark's sheet or in Settings' ledger (`device-sharing-ledger.tsx`, for Practice and
  the Jobs record; aph's row there sends its person to aph's mark). Home is
  told each choice it has not heard under the pairing (`lib/home-link/told.ts`:
  one `PUT /sharing/:scope` with `{ "kept": … }` per scope, the words never,
  once each, in the order made): first in every run of a lane and in aph's
  way back, and, for a stop of a lane with no way back, by one run of its own
  (the teller) asked from `stopOnHome`, since no run of a stopped lane
  follows, and again from a lane mark's link listener once the link frees
  after turning it away. A lane's run sends its record only once home has
  heard every choice (a home that answered twice in a row that it keeps none
  counts as having heard, until the app starts again); aph's way back, which
  only reads, goes on either way. A `409` saying the phone stopped
  (`stoppedOnHome`) refuses nothing and makes the next run tell every choice
  again. For
  aph, the mark shows aph's lane only while aph's screens hand it in
  (`DeviceAphLane`, in aph's layout); opting in moves aph's record to home
  (`keepOnHome`), and stopping asks home once for its record back
  (`bringBack`: `GET /aph`, after telling home the stop), from the stop's second press, from
  the Bring it back button, or once the link frees after turning that read
  away, only while nothing of aph is kept, found so before the read and again
  before its answer is kept; home being busy is said as busy; when home can't
  be reached, aph stays as it was, and the mark says this phone holds only
  what home hadn't confirmed.
- _Falsified by:_ a hunk to `lib/home-link/kept-watch.ts` that reaches
  `askKept` from anything but `watchKept`'s record subscription, its link
  subscription, its `visibilitychange` and `online` listeners and its first
  ask, adds a timer, changes when a listener asks (the record subscription's
  check that the revision moved, the link subscription's test for a new
  pairing or for the link freeing up after a run it turned away), removes or
  changes anything the cleanup `watchKept` returns undoes, or removes
  `askKept`'s check that the record is kept on home or that the document is
  visible; a hunk to `lib/home-link/lanes.ts` that calls `watchKept` from
  anywhere but `useLaneHome`'s effect, passes it anything but `wire(lane)`'s
  `record` and `sending`, keeps that effect from returning a cleanup that
  calls the one `watchKept` returns, calls `askKept` from anywhere but
  `askLane`, makes the record's `kept` anything but the lane's scopes in
  `sharedNow` of the log under `pairingOf`, keeps its `revision` from moving
  with the lane's and the log's length, or its `subscribe` from hearing both,
  calls `phoneConsent().choose` from anywhere but `keepOnHome`, `stopOnHome`
  and `enterEarlier`, lets `enterEarlier` choose for a lane whose `keptBefore`
  is not true or one of whose scopes `everChosen` finds, under a pairing whose
  `earlier` is not true, or with `said` other than `null`, lets `back` run
  `bringBack` while a scope is kept, without its `stopped` check, with a
  `stopped` other than none of the lane's scopes being kept now, or outside
  `sayingBusy`, or asks it from anywhere but `stopOnHome`, `bringLaneBack` and
  the effect's link listener (once the link is idle after it was turned away
  busy), or asks the teller (`telling()` or `teller`) from anywhere but
  `stopOnHome` and the effect's link listener (once the link is idle after
  it was turned away busy),
  removes `telling().want()` from a stop of a lane with no way back, wires the
  teller outside `sayingBusy`, removes `tellChoices` from a lane's
  `laneExchange` or from `back`'s `toldFirst`, or makes `tellChoices` tell
  anything but `tellHome` over the consent log under the run's pairing; a
  hunk to `lib/home-link/told.ts` that sends anything but one
  `PUT /sharing/:scope` with `{ kept }` per untold change, tells a change made
  under another pairing or out of order, sends a choice's words, remembers a
  choice told before home answered every one of its scopes with `200`,
  makes `readTold` answer for another pairing, sets `keepsNone` on anything
  but a second `404` in a row for that pairing, keys it on anything but the
  pairing or keeps it past the page load, or lets `tellHome` answer
  `synced` on anything but every change answered `200` or a `404`; a hunk to
  `lib/home-link/kept-runtime.ts` that lets `toldFirst` run what follows
  before telling, or, unless its caller says `"tried"` (aph's way back
  alone), after telling ended any way but `synced`, or that drops
  `laneExchange`'s `unheard` on a `stoppedOnHome` answer; a
  hunk to `lib/home-link/kept-runtime.ts` that lets `laneExchange`
  send a record's request without its check that a scope is still kept, tells
  home under a pairing other than the run's, or makes a run
  say anything but busy once home answered one of its requests `429` (unless
  it was forgotten or stopped); a hunk to `components/device-home-glyph.tsx`
  that calls `askLane`, `keepOnHome`, `stopOnHome` or `bringLaneBack` other
  than from a button's `onClick`, lets the first press of the opt-in or of
  Stop sending do it, passes `keepOnHome` words other than the `offer` it
  shows, or shows a lane under another wing's mark; a hunk to
  `components/settings/device-sharing-ledger.tsx` that calls `stopOnHome` other than
  from its second Stop press's `onClick`, calls it for aph's lane, or calls
  `askLane`, `askKept`, `keepOnHome`, `bringLaneBack`, `useLaneHome`,
  `watchKept`, or `choose` on the consent runtime under any name; a
  hunk that mounts
  `DeviceHomeGlyph` anywhere but `routes/_dashboard.tsx`'s header in the
  device build, or `DeviceAphLane` anywhere but
  `routes/_dashboard/_apk/aph.tsx`; a hunk to `lib/home-link/aph.ts` that
  makes the lane's `exchange` do more than make the switch and run aph's
  exchange, its `revision` anything but the store's `edits` while on home and
  -1 on the phone, its `keptBefore` anything but the store being on home, or
  its `bringBack` anything but aph's with the `stopped` it was given; or a
  hunk to `packages/ui/aph/src/lib/sync.ts` that makes `bringBack` send
  anything but one `GET /aph` or keep home's answer once `stopped` fails; a
  hunk to `lib/home-link/model.ts` that lets a `paired` event's pairing, or
  anything but the `read` of a record, have `earlier` true, or makes the
  `read` step's `earlier` other than the event's; a hunk to
  `lib/home-link/runtime.ts` that lets `pair` keep its record without
  `choicesLogged: true`, renames that field on one side only, makes
  `parsePairing`'s `earlier` anything but `choicesLogged` not being `true`,
  makes `load`'s `read` carry an `id` or `earlier` other than `parsePairing`'s
  of the stored record, or adds a `credential.write` anywhere but
  `finishPairing`; or a hunk to `lib/home-link/credential.ts` that makes
  `nativeCredential.write` keep anything but the record it is handed; or a
  hunk to `store.ts` that lets `leaveHome` drop a waiting change `shown` hides
  without `forgetHomeRecord`'s copy under `LEFT_PREFIX`, or remove the home
  record before the device record is written.
- _Scope:_ `apps/www/src/lib/home-link/kept-watch.ts`, `lanes.ts`,
  `kept-runtime.ts`, `told.ts`, `aph.ts`, `model.ts`, `runtime.ts`, `credential.ts`,
  `apps/www/src/components/device-home-glyph.tsx`,
  `apps/www/src/components/settings/device-sharing-ledger.tsx`,
  `apps/www/src/components/aph/device-aph-lane.tsx`,
  `apps/www/src/routes/_dashboard.tsx`,
  `apps/www/src/routes/_dashboard/_apk/aph.tsx`,
  `packages/ui/aph/src/lib/sync.ts`, `packages/ui/aph/src/lib/store.ts`.
- _Why not enforced:_ whether a moment is one where the person is using a wing
  is a reading of intent: a test sees a listener, not why it is there, and a
  lint rule cannot tell a press handler from an effect that reaches it through
  a helper. Held when declared, by reading every call: `watchKept` only in
  `useLaneHome`'s effect; `askKept` in `watchKept`'s three listeners and its
  first ask, and in `askLane`; `askLane` only in the sheet's Send now
  `onClick`; `keepOnHome` only in the sheet's second opt-in press, with the
  `offer` it shows, and in `device-section.tsx`'s send `onPress` behind the
  ticked box; `stopOnHome` only in the sheet's second Stop press and the
  ledger's, which offers none for aph;
  `bringLaneBack` only in Bring it back's `onClick`; the teller only in
  `stopOnHome` and the link listener; `choose` only in
  `keepOnHome`, `stopOnHome` and `enterEarlier`; `DeviceHomeGlyph` only in
  `_dashboard.tsx`'s header under `VITE_DEVICE_BACKEND`; `DeviceAphLane` only
  in aph's layout; `earlier` true only from the `read` of a pairing record
  whose `choicesLogged` is not `true`, which `finishPairing`, the one
  `credential.write`, always sets.

### LA10: the Jobs record is sent home only while its person is using the wing

What the Jobs record sends home, and that it never takes home's copy over
its own, is enforced by test: who reaches the link and its `keep` lane
(`egress-choke-points`), the requests an exchange makes, that a refused
event stays on the phone and is not sent again, and that home's copy is
taken in only by a phone whose log is empty (`lib/jobs/__tests__/home.test.ts`),
one run at a time (`lib/home-link/__tests__/kept.test.ts`), and the mark's
two presses, its stop and the choice its old switch made entering the log
once, as found (`components/__tests__/device-home-glyph.test.tsx`). Unlike
aph, the phone keeps its whole log once home holds it: its shares count
events by their place in the log, and home's copy is the way back for a
phone that lost it, so stopping is the choice, and home told it.

The exchange also reads the morning run's digests, which home holds (it
takes them from the mailbox): `GET /jobs/digests`, after the newest day the
phone holds. Digests are not the record; they come to the phone, not from it.
That read takes in at most `DIGESTS_PER_RUN` digests, never one for a day the
phone holds, and never moves the day Today shows back to an older one; a fetch
changes the phone's digests, the day shown and when each came, and not the
log or what home holds (`lib/jobs/__tests__/home.test.ts` and
`model.test.ts`). The phone's revision does not move when a digest is taken
in.

The exchange also files the phone's decisions and scouts with home, which
hands them to the Jobs mailbox for the morning run: `PUT /jobs/files/:name`,
one per kind with something new. A file that names a voice note is never
filed, and stays for the share sheet; a file home refuses (409 or 422) stays
for the share sheet too, kept by name in `home.refusedFiles` and never filed
again; only home's 200 records the file as shared and arrived, so it is not
offered again (`lib/jobs/__tests__/home.test.ts`, `runtime.test.ts` and
`model.test.ts`). That 200 records both at one instant, which is how the
wing tells a file home took from one the person confirmed in Drive: each
card says where its file is now, read off the log and the digests' `read`
lists, and nothing filed goes unsaid (`lib/jobs/journey.ts`, promise JB2).
A file home took that a later run did not read is offered to the share
sheet again; the exchange never files it again. What no test can say is
when a run is asked for:

- _Claim:_ LA9's claim holds for the Jobs record's lane
  (`lib/home-link/jobs.ts`): its mark shows in the header while the Jobs
  wing shows (Today, Scout and Record alike), its revision moves with each
  event added on this phone or home's copy taken in by a phone whose log was
  empty, and its exchange is `exchangeJobs` over the record. Its run also
  reads home's digests and files the phone's decisions and scouts with home
  (above), at no moment but a run's. The record's own switch from before
  the consent log (`home.kept`) is read only to enter that choice once and, in Settings' ledger, to say the record's
  choice is not entered yet; nothing sets it.
- _Falsified by:_ a hunk LA9's falsifier names for the shared files; a hunk
  to `lib/home-link/jobs.ts` that makes the lane's `revision` anything but
  the log's length, its `keptBefore` anything but `home.kept`, or its
  `exchange` anything but `exchangeJobs` over the runtime's `keeping`; a
  hunk to `lib/jobs` that reads home's digests anywhere but in
  `exchangeJobs`, or that deletes, renames or moves the digests read
  (`readDigests` in `lib/jobs/home.ts`) so `exchangeJobs` no longer makes it
  in every run that gets that far; a hunk to `lib/jobs` that sends a
  decisions or scouts file to home anywhere but in `exchangeJobs`, or that
  deletes, renames or moves the filing step (`fileOutgoing` in
  `lib/jobs/home.ts`) so `exchangeJobs` no longer makes it in every run
  that gets that far; a
  hunk to `components/settings/device-sharing-ledger.tsx` that reads
  `keptBefore` for anything but its row's wording; or a hunk to `lib/jobs`
  that sets `home.kept`.
- _Scope:_ LA9's shared files, `apps/www/src/lib/home-link/jobs.ts`,
  `apps/www/src/components/settings/device-sharing-ledger.tsx`,
  `apps/www/src/lib/jobs/home.ts`, `apps/www/src/lib/jobs/model.ts`,
  `apps/www/src/lib/jobs/runtime.ts`.
- _Why not enforced:_ as LA9's. Held when declared, by reading every call
  as LA9 says, and `home.kept` read only by the lane's `keptBefore` (whose
  callers are `enterEarlier` and the ledger's Jobs row) and the record's
  stored schema.

### LA11: Practice is sent home on its own only while its person keeps sending it

What a standing send carries, and that a choice only ever appends, is
enforced by test: the fold over the consent log and that an unreadable log
is never written over (`lib/home-link/__tests__/consent.test.ts`), that a
run sends only what its person keeps sending, only finished sessions and
what changed since that home held it, takes nothing of home's in and lets
nothing go, and sends nothing more once stopped (`standing.test.ts`; home is
read only as the send's copy reads it, to plan: `planTransfer`'s look at
the copies it made before, `sessions.test.ts`), that the send's box
starts unticked every time and only a tick adds the choice
(`components/settings/__tests__/device-section.test.tsx`), that the mark
sends nothing before the choice and "Stop sending" appends a stop
(`components/__tests__/device-home-glyph.test.tsx`), and that the words
name no machinery (`words.test.ts`). Who reaches the link and its `keep`
lane is `egress-choke-points`'s. Sharing is one way: home keeps what it
received, and a stop means only that nothing new goes. What no test can say
is when a run is asked for:

- _Claim:_ LA9's claim holds for Practice's lane
  (`lib/home-link/practice.ts`, its standing send `lib/home-link/standing.ts`):
  its mark shows in the header while the Practice wing shows, and its
  revision moves with the sessions the app has read and each shelf keep
  (`onKept`). Its sheet offers no opt-in of its own: a kept choice enters
  the log only from the send confirm's press with its box ticked. A choice
  counts for the pairing it was made under alone (the link's `id` for it,
  made new at each pairing and kept with its key), so a new pairing, even to
  the same address, starts with nothing kept; a run sends only finished
  sessions and kept items, and every request it makes first finds its own
  scope still kept.
- _Falsified by:_ a hunk LA9's falsifier names for the shared files; a hunk
  to `lib/home-link/practice.ts` that makes the lane's `revision` or
  `subscribe` follow anything but the sessions cache and `onKept`, or its
  `exchange` anything but `sendStanding` with the run's `shared` and
  `pairing`; a hunk to `components/settings/device-section.tsx` that calls
  `keepOnHome` other than in the send's press with its box ticked, starts
  the box ticked, or keeps a tick across confirms (`ask` unticks it); a
  hunk to `lib/home-link/runtime.ts` that lets `pair` keep an earlier
  pairing's `id`, or lets `load` report an `id` other than the one stored
  with the key; a hunk to `lib/home-link/consent-model.ts` that lets
  `appended` edit, reorder or drop an earlier event, or lets `sharedAt`
  count an event made after `t` or under another pairing; to
  `lib/home-link/consent-runtime.ts` that writes the log when it could not
  read it; to `lib/home-link/sent.ts` that lets `sessionsToSend` pass a
  session that is not completed, or `readSent` return one pairing's record
  for another; or to `lib/home-link/standing.ts` that sends a request
  without `gated`'s check that its scope is still kept, reads home other
  than through `copyHome`'s plan, takes home's copy in, lets a phone session
  go, or confirms what home holds (`confirmHeld`), or sends other than
  through `copyHome` and `sendKept`. Each lets something reach home, or
  leave the phone, that its person did not choose.
- _Scope:_ LA9's shared files, `apps/www/src/lib/home-link/consent-model.ts`,
  `consent-runtime.ts`, `practice.ts`, `runtime.ts`, `sent.ts`, `standing.ts`,
  `apps/www/src/components/settings/device-section.tsx`.
- _Why not enforced:_ as LA9's. Held when declared, by reading every call
  as LA9 says: Practice's `keepOnHome` only in `device-section.tsx`'s send
  `onPress`, behind the ticked box, and its sheet showing no opt-in
  (`startElsewhere`).

### LA12: Korean reads the routine's files from home only while its person shows them there

The owner chose (2026-10-24) a read-only way to what the reflections routine
left on home: after one opt-in, while the Korean study is open, the phone
reads `GET /routine/files` (paulgsc/server `handlers/routine.rs`) from its
paired home with the pairing's key, and the handheld lesson lists it under
"From the routine". It is not a lane: home keeps no choice for it (the
server's sharing scopes are a closed set, so telling it one would be refused
and hold up every lane's run), and nothing of the phone's is sent but, under
a choice whose words say so, which of the routine's lessons it opened. The
choice is the phone's own log, `some-ui.home.reads.v1`, which only grows
and counts for the pairing it was made under alone.

The owner chose (2026-10-24) to have the routine keep three lessons ready
whether or not a reflection asked for one, so home is told which of them
the phone opened: when Korean opens one, `routineReads().tellOpened` sends
one `PUT /routine/opened` with the `<folder>/<name>` of every listed one
opened, names only, and home files them for the mailbox's `opened` folder
(paulgsc/server docs/identity.md invariant 19). It does so only under a
choice whose words pressed carry `ROUTINE_TELLS_OPENED`, so a choice made
under the earlier words ("It sends nothing of yours") tells nothing, and
Settings says how to choose again. It is started by that open, a tap, with
the app in front, one at a time, never retried and never rejected: one
asked for while a look or another is on its way waits for it, and is told
only while its choice is still the one shown, so no home is told of another's;
the next open tells them all again.

The same answer carries a record of each of the routine's runs (when it
ran, what it found and added, what it could not do) and when home answered.
The owner chose (2026-10-24) to keep those on the phone, so the handheld can
say away from home when the routine last ran and whether it brought anything
new: topik's `adapter/routine-runs` adds each run once, by its name, under
the port's key (so a new pairing, or a new choice, shows none of the old
one's), never rewrites or drops one, and notes when home last answered.
The owner chose the same day to keep the lessons too: topik's
`adapter/routine-files` keeps home's newest dated answer for each key
(`createHeldAnswers`), replaced only by a newer one, and lists it when a look
brings no dated answer, so "From the routine" is there away from home. It is
a copy of what home holds, not a record of the learner's. `lib/home-link/routine.ts`
still keeps home's answer in memory alone; what is kept is topik's, from
what `list` hands it.

What a look sends and keeps is enforced by test: no request unless shown
under the pairing the phone holds with the app in front, one `GET` per look
and one on its way shared, no request as time passes, every failure resolved
(never rejected, so the app's query cannot retry it) with what was last read
under the same choice, nothing held once stopped, unpaired or paired anew, an
answer landing after a stop dropped, and an unreadable log never written over
(`lib/home-link/__tests__/routine.test.ts`); the read being `keep`'s only
other caller and its two sends `GET /routine/files` and
`PUT /routine/opened`, and who may import the
link (`egress-choke-points`); Settings sending nothing, naming home before
the choice, and taking a second press to show and to stop, with the words
agreed to kept (`components/settings/__tests__/device-routine-reads.test.tsx`);
the words naming no machinery (`words.test.ts`); and a new key listing
nothing of the old one's (topik's `handheld-lesson/index.test.tsx`). What no
test can say is when a look is asked for:

- _Claim:_ in the Android app, `routineReads().list()`
  (`lib/home-link/routine.ts`) is called only through the port
  `useHomeRoutineFiles` (`components/player/device-routine-files.ts`)
  returns, which exists only while the phone is paired and the read log
  shows the files under that pairing, keyed by the pairing and since when;
  `session-viewport.tsx` hands that port to topik's `routineFiles` alone,
  in the device build alone, and topik reads it only in the handheld
  lesson's `useRoutineFiles` query (on the lesson mounting and the app
  coming back to the front, while Korean is open; never on an interval, a
  reconnect or a retry); a
  choice enters the log only from a second press in Settings
  (`components/settings/device-routine-reads.tsx`), showing with the words
  its first press showed and stopping with the stop's.
- _Falsified by:_ a hunk that calls `routineReads()`'s `list` anywhere but
  the port in `device-routine-files.ts`, or its `choose` anywhere but the
  two second-press `onClick`s in `device-routine-reads.tsx`; a hunk to
  `device-routine-files.ts` that returns a port while `underNow` is null,
  keys it on anything but the pairing and since when, whose `list` does
  more than call `list`, or that offers `opened` under a choice `tells`
  does not hold for, or whose `opened` does more than call `tellOpened`; a hunk to `session-viewport.tsx` that reaches
  `useHomeRoutineFiles` other than through `useRoutineFromHome`'s
  `VITE_DEVICE_BACKEND` branch, or hands its port anywhere but topik's
  `routineFiles`; a hunk to `device-routine-reads.tsx` that calls `choose`
  on a first press, passes a `said` other than the confirm's words (shown)
  or the stop's (hidden), or calls `list`; a hunk to `routine.ts` that lets
  `list` start a read without `mayRead`'s checks or while one under the
  same choice is on its way, lets it reject, retries a read, starts one from a timer or from the
  `onLink` listener (which only settles), sends anything but one
  `GET /routine/files` and, from `tellOpened` alone, one
  `PUT /routine/opened` of `{ opened }` names, lets `tellOpened` send without
  `tells` holding, with the app in the background, or while one is on its
  way, retries one or lets it reject, keeps an answer whose choice is not the one shown
  when it lands, removes or weakens `settle`'s clearing, writes the log when
  it could not read it, or keeps home's files anywhere but memory; a hunk
  to `routine-model.ts` that changes what any of its functions answers
  (`shownNow`, `appendedRead`, `parseReadLog`, `underNow`, `sameUnder`,
  `saidUnder`, `heldFor`, `mayRead`, `stepRead`: together they judge whose choice is
  shown, whose answer is kept and whether the log was read, so each such
  hunk is re-checked against this claim); a hunk to topik's
  `adapter/server/routine-files-queries` that keys its query on anything
  but the feed's `key` (or, with none, whether there is a feed), or changes
  or removes its `enabled`, `staleTime`, `refetchOnMount`,
  `refetchOnWindowFocus`, `refetchOnReconnect` or `retry`, or adds a
  `refetchInterval`; a hunk in topik that calls the feed's or the port's
  `list` anywhere but that query's `queryFn`, or that calls
  `useRoutineFiles` anywhere but `HandheldLesson`, or to
  `adapter/routine-files` that drops the port's `key` from the feed; or a
  hunk that deletes, renames or moves
  any file, function or constant this claim names without carrying the
  claim to its new place.
- _Scope:_ `apps/www/src/lib/home-link/routine.ts`, `routine-model.ts`,
  `apps/www/src/components/player/device-routine-files.ts`,
  `apps/www/src/components/player/session-viewport.tsx`,
  `apps/www/src/components/settings/device-routine-reads.tsx`,
  `packages/ui/topik/src/lib/topik/adapter/server/routine-files-queries/index.ts`,
  `packages/ui/topik/src/lib/topik/adapter/routine-files/index.ts`,
  `packages/ui/topik/src/components/topik/handheld/handheld-lesson/index.tsx`,
  `packages/ui/topik/src/components/topik/study-session/index.tsx`.
- _Why not enforced:_ whether a moment is one where its person is using
  Korean is a reading of intent: a test sees a query run, not the screen it
  runs for, and a lint rule cannot tell a press handler from an effect that
  reaches it through a port handed down a prop. The import test says who
  may reach the link, not which of those calls `list`. Held when declared,
  by reading every call: `list` only in `device-routine-files.ts`'s port;
  that port only in `session-viewport.tsx`, under `VITE_DEVICE_BACKEND`, as
  topik's `routineFiles`; topik's feed only in `KoreanStudyPage`'s session
  config, read by `useRoutineFiles` in `HandheldLesson` alone, with
  `refetchOnMount` and `refetchOnWindowFocus`, `refetchOnReconnect` and
  `retry` off, and no interval; `choose`
  only in the two second-press `onClick`s; no timer or listener in
  `routine.ts` but `onLink`, whose listener is `settle`.

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
  sessions, reflections, stops, soundbites, grammar-lens record and
  grammar-lens takes, and a session's (or every session's) **Share** hands
  it that session's reflections, and the learner picks where they go; the
  reflections (and, from the whole export, the soundbites and grammar-lens
  entries and takes) shared then leave the phone once the learner says they
  arrived. "Archive finished sessions"
  (`lib/session-archive`) hands the share sheet one file of the finished
  sessions' records, and they leave the phone once the learner says it
  arrived. The phone's Home server block
  syncs, pairs, unpairs and sends to home on a tap (LA8), and Korean reads
  the routine's files from home once its person chose to show them (LA12). These are explicit actions on
  the account path or by the learner, not defaults.
- **The server's side.** What `file_host` stores and logs is
  `paulgsc/server` `docs/identity.md`.
