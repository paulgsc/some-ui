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

|                                     | Learning on the device                       | On the account, reporting off                                                                                                                                                               | On the account, reporting on               |
| ----------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Sessions, settings, profile         | `localStorage`, never sent                   | sessions go to `file_host`                                                                                                                                                                  | the same                                   |
| Session probe (`GET /auth/session`) | never made                                   | at boot, only because the account was chosen                                                                                                                                                | the same                                   |
| Passkey ceremonies                  | only when the person starts one              | the same                                                                                                                                                                                    | the same                                   |
| Lesson, round and vocab reads       | made, **without credentials**                | made, without credentials                                                                                                                                                                   | the same                                   |
| This device's sessions              | stay here                                    | copied only by "Copy to my account", per account, after a confirmation; the phone's, to its paired home, by "Send to home", which then frees the finished ones home confirms it holds (LA8) | the same                                   |
| `/signals`, `/presence/lease`       | never                                        | never                                                                                                                                                                                       | sent                                       |
| Push subscription                   | never                                        | never                                                                                                                                                                                       | the account's, on the person's own taps    |
| Reflections                         | on the device (at most 20), never sent       | never sent (LA7)                                                                                                                                                                            | never sent (LA7)                           |
| Shelf                               | never                                        | the account's, on the person's own taps                                                                                                                                                     | the same                                   |
| Speech                              | the browser's own voice                      | the server's speech service                                                                                                                                                                 | the same                                   |
| Reminders                           | the client's own policy, while a tab is open | the client's own policy, while a tab is open                                                                                                                                                | the server's push, with the browser closed |

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
  server minted, and the account is asked whether it still holds them. A create
  whose answer was lost is recorded before it is sent and, on the next press,
  looked for in the account (a session with the same name, layout, activities
  and scenes that no receipt entry claims) and adopted rather than repeated.
  On the Android app the copy to its paired home is `copySessionsTo`
  (`lib/tenant/sessions-copy`, which the phone build may carry), called
  only from `lib/home-link/sessions` behind the Home server block's confirm
  (LA8), with the same plan and receipt, no lock (the phone's link runs one
  thing at a time) and no authority (the pairing is the account).
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
  sessions backend import `sessions-transfer` or `sessions-copy`, or call
  `createHttpSessionsRepository`'s `create`/`update` with data from
  `createSessionsRepository`; one that calls `copySessionsTo`,
  `copyDeviceSessions`,
  `copyDeviceSessionsAndRefresh`, `useCopyDeviceSessions`, `planTransfer` or
  `runTransfer` from anywhere but the files that own that step (the plan and
  the run are `lib/tenant/sessions-copy`'s, called by the browser's transfer
  and the phone's copy alone); one that lets
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
  `CapacitorHttp`), which only `lib/home-link` calls, and is started by a tap
  in the Home server block of Settings
  (`components/settings/device-section.tsx`, the one module outside
  `lib/home-link` that calls it):
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
  then one PUT per item kept on this phone's shelf, its bytes as kept,
  nothing read back and the item kept on the phone. Nothing on home is
  deleted. Nothing is sent when the app or Settings
  opens, on resume, on a timer or on a network change: making the runtime and
  `load` read only the phone's own record. There is no retry; a sync, a send
  or a copy ends at Stop, or when the app goes to the background, before its
  next request, and is over only once every request it started has settled.
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
  that sends from `createHomeLink`, `load`, a `useEffect`, a timer, a
  `visibilitychange` or `online` listener; one that retries a failed home
  request, or queues one for later; one that lets the send start without
  its confirm, or drops a count or the host from that confirm; one that
  sends shelf items other than `everyKept`'s, or with a method other than
  `PUT`; one that passes `copySessionsTo` anything but session records
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
  `onHidden` subscription in the runtime's `sync`, the `stopPressed` it
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
  `CapacitorHttp` named only in `native-http`, which only
  `lib/home-link/index.ts` imports as a value, and `lib/home-link` imported
  only by the Home server block). What a test cannot say is that a call
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
  press).

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
  sessions, reflections, stops, soundbites and grammar-lens record, and a
  session's (or every session's) **Share** hands it that session's
  reflections, and the learner picks where they go; the reflections (and,
  from the whole export, the soundbites and grammar-lens entries) shared
  then leave the phone once the learner says they arrived. "Archive finished sessions"
  (`lib/session-archive`) hands the share sheet one file of the finished
  sessions' records, and they leave the phone once the learner says it
  arrived. The phone's Home server block
  syncs, pairs, unpairs and sends to home on a tap (LA8). These are explicit actions on
  the account path or by the learner, not defaults.
- **The server's side.** What `file_host` stores and logs is
  `paulgsc/server` `docs/identity.md`.
