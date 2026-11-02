# Learner-data authority

Where a learner's data lives, and what that means for what leaves their device.

`apps/www/src/lib/authority` decides it: a state union and one pure `step`
(`state.ts`), a runtime that owns the handles (`runtime.ts`), and a React hook
that only reads a snapshot (`use-authority.ts`). The reasoning for that shape is
`docs/monorepo-boundaries.md`, "Inside a React package: the component is not the
coordinator" (R1). What an account may hold is the canon's Remark 7.6
(`docs/canon/adaptive-learning-canon.typ`); this document is how the browser
keeps to it. Remark 7.7 amends it for the owner (below).

## The owner's deployment

The owner is the only person who signs in, and home (`file_host` on the owner's
home network) is the owner's own storage, as private as the phone (canon
Remark 7.7, #2174). The frame the HOME-FIRST stories move the code toward:

- **Sending to home is the default and asks nothing.** The phone writes
  locally first, drains to home through an outbox, and lets go only what
  home has read back. Amended for Studio's ideas (the owner, #2453,
  2026-11-01): a new idea is one bundle, and it goes home only by its Send,
  whole, never one answer at a time; until then its takes wait on the phone
  (LA13), and deleting one before Send is for good (`docs/discard-sites.md`).
- **A third party is anything beyond the owner's devices and home:** Drive,
  the Jobs mailbox on Cloudflare, the model that reads it. Only what a
  routine needs goes there, by the carrier that keeps the least for the
  shortest time.
- **Nothing is let go because a third party has a copy.**
- **Drive stays only where nothing else reaches:** refreshing a digest, word
  set or drama away from home, Build Journal audio, and makjang's loop
  through a learner's own drive, which serves other learners.

Each invariant below still describes the code, and holds until the change that
moves its code retires or rewords it in the same PR; a hunk that moves code
toward this frame without doing so is a finding.

| Invariant                                                                                                                                                                                        | Moved by          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------- |
| LA7 (a reflection reaches no server) (done: LA7 retired, LA16 declared)                                                                                                                          | HF3, #2178        |
| LA8's "only on a tap"; LA9–LA11 and LA13's consent; LA12 (consent to read) (done: LA9–LA12 retired, LA15 declared)                                                                               | HF8, #2182        |
| LA6's reporting reset on every sign-in, on the owner's `lan` build                                                                                                                               | HF8, #2182 (open) |
| LA13's scene notes copied only once a drama prompt is shared (done: copied once kept)                                                                                                            | HF2, #2177        |
| Every share sheet's let-go (done: HF1, #2176, promise LG1); the Jobs share sheet itself and the archive's (done)                                                                                 | HF2, #2177        |
| The drama prompt's share sheet, and its scene notes let go on a share (done: LA18 declared, LA13 reworded)                                                                                       | HF4, #2179        |
| LA13's notes (done: soundbites, lens and LeetType takes); LA15's drain (done: their notes); the archive (done: gone); LA8's one tap (done: the study list's "Let it go" keeps a home copy first) | HF5, #2180        |
| LG1's Studio takes, which left the phone as soon as home held them (done: they wait on the owner's choice)                                                                                       | HF11, #2401       |

HF8 (#2182, owner's decision D3: no per-domain switch, and no consent log told
to home or enforced by home) removed the phone's consent machinery: the
per-pairing consent log and its telling to home, the choice to show the
routine's files, the two-press marks, aph's way back, and Settings' ledger of
choices. A paired phone drains everything it keeps (LA15); the only choice is
the pairing, and the only taps that let anything leave the phone on home's
word are the clear of finished sessions home holds, the study list's "Let
it go" and the phone-full offer's "Remove it" (LA8). The server half (paulgsc/server#598)
removed `handlers/sharing.rs`, the `sharing_choice` table and every `409
sharing_stopped`, so HF2 (#2177) removed the phone's transitional reading of
that answer (`stoppedOnHome`). LA6's reporting reset is still to move.

HF2 (#2177) sends every voice note home when it is kept, a drama's scene
notes included, and files every Jobs decisions and scouts file with home
whatever it names (paulgsc/server#596: a file names its notes by id, and the
routine reads home's transcripts). The Jobs share sheet and "Did they
arrive?" are gone, and "Archive finished sessions" is a copy that lets no
session go, so LG1 (`lib/home-link/voice-copy.ts`) covers it.

HF4 (#2179; the owner's decisions D2 and D5 on #2174) sends the next scene's
prompt home: "Share the next scene's prompt" became "Ask for the next scene",
which keeps the ask on the phone (`lib/scene-ask`) for the drain to send
(LA18), and home hands it to the routine through the Jobs mailbox
(paulgsc/server `drama_prompt`, its invariant 31). The drama's share sheet
and its Drive folder are gone from the owner's app, and topik's `FileShare`
port and `SharePrompt`, which no host injected, are removed (the owner, on
#2179; `docs/makjang/README.md`, "The loop through the learner's drive").

HF5 (#2180) keeps soundbites, grammar-lens takes, the grammar-lens record
and LeetType's spoken answers on home (paulgsc/server: voice notes said for
`soundbite`, `lens` and `leetype`, study notes for a soundbite's record and an
answer's note, and the Korean record's `lens` entries; docs/identity.md
invariants 23, 25 and 30). Each goes through the voice lane (LA13) or the
drain (LA15), and each capped store is an offline set: at its cap a new one
makes room with the oldest home holds, and is refused while home holds none
(LG1). The study-context export is a copy for the owner's own agent that lets
nothing go, and "Archive finished sessions" is gone: home already holds
finished sessions. The study list's "Let it go" keeps a home copy first: on
a paired phone it copies the session home, whatever its status, reads it
back, and lets the phone's copy go only once home holds it as it is and it
is unchanged since (LA8). Home keeps its plan, status and times, and when
it was made (paulgsc/server#630). A phone that is
not paired has no home to keep a copy, so there it deletes as it always did,
and its confirm says the session can't be brought back. The phone-full
offer's "Remove it" of the oldest finished session is the same let-go, with
the same ends (#2422, PF1).

HF11 (#2401; the owner, 2026-10-31: "no silent behavior … a purposeful
action by user") stops a Studio take leaving the phone the moment home holds
it, which left a take home received before it was shared to Drive with no way
to Drive from the phone. Once home holds a take, Studio's Start offers one
choice, kept on the phone and changeable: "Let takes go once home has them",
or "Keep each until Drive has it too", where each take home holds waits with
its own "Drive has it". Until the owner chooses, none leaves, and at the takes
cap Record names the choice that would free room (LG1). Home confirming that
Drive has a take lets it go too (route a on #2401, the owner's decision):
a Build Journal session puts the SHA-256 of each take it finds in Drive in
the Jobs mailbox, home matches them against the takes it holds
(paulgsc/server `studio_take_on_drive`), and the voice lane's run asks home,
by one `GET /voice-notes/on-drive` per 100 waiting takes, of their ids
(`lib/home-link/on-drive.ts`), only under "Keep each until Drive has it
too". Home never reaches Drive.

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

|                                                                                        | Learning on the device                       | On the account, reporting off                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | On the account, reporting on               |
| -------------------------------------------------------------------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Sessions, settings, profile                                                            | `localStorage`, never sent                   | sessions go to `file_host`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | the same                                   |
| Session probe (`GET /auth/session`)                                                    | never made                                   | at boot, only because the account was chosen                                                                                                                                                                                                                                                                                                                                                                                                                                                              | the same                                   |
| Passkey ceremonies                                                                     | only when the person starts one              | the same                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | the same                                   |
| Lesson, round and vocab reads                                                          | made, **without credentials**                | made, without credentials                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | the same                                   |
| This device's sessions                                                                 | stay here                                    | copied only by "Copy to my account", per account, after a confirmation; the phone's finished ones, to its paired home, by the drain (LA15), and one of any status by the study list's "Let it go"; freed from the phone on home's word only by "Clear finished sessions home holds", that "Let it go" and "Remove it" when full, each reading home's copy back first (LA8)                                                                                                                                | the same                                   |
| `/signals`, `/presence/lease`                                                          | never                                        | never                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | sent                                       |
| Push subscription                                                                      | never                                        | never                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | the account's, on the person's own taps    |
| Reflections                                                                            | on the device, never sent                    | on a paired phone, each written one sent to home by the drain and kept there, which hands its text to the Jobs mailbox for the routine; a spoken one's audio as its voice note; the one-tap answers never sent; the phone keeps its newest 20, and past them only the written ones home does not hold (LA13, LA16)                                                                                                                                                                                        | the same                                   |
| Asks for the next scene (the phone's)                                                  | on the phone, never sent                     | on a paired phone, each ask sent to home by the drain and kept there, which hands its prompt to the Jobs mailbox for the routine; the scene notes it names go as voice notes; the phone keeps each until home holds it, and the newest after (LA18)                                                                                                                                                                                                                                                       | the same                                   |
| Voice notes (the phone's)                                                              | on the phone, never sent                     | on a paired phone, each spoken reflection, Jobs voice note an event names, game bite, Studio take, Studio idea answer's take (a new idea's once it is sent, ST26), scene note, soundbite, grammar-lens take and LeetType take copied and sent to the paired home while the app is open, the copy kept until home holds it (LA13, LA15); one let go on the phone marked set aside on home once home holds it (MIC2); home's words for an idea answer's take read back while the idea screen shows it (LA8) | the same                                   |
| Soundbites' records, LeetType's answer notes and the grammar-lens record (the phone's) | on the phone, never sent                     | on a paired phone, each sent to the paired home by the drain and counted as held only when home names or carries back its bytes; the phone keeps six soundbites, forty notes and a thousand lens entries, making room only with what home holds (LA15)                                                                                                                                                                                                                                                    | the same                                   |
| Shelf                                                                                  | never                                        | the account's, on the person's own taps                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | the same                                   |
| aph (the phone's)                                                                      | on the phone, never sent                     | on a paired phone, on the paired home from the first run, synced while aph is open; the phone keeps only what home has not confirmed (LA15)                                                                                                                                                                                                                                                                                                                                                               | the same                                   |
| Jobs record (the phone's)                                                              | on the phone, never sent                     | on a paired phone, a copy on the paired home, synced while the app is open; its decisions and scouts files, each naming its voice notes by id, filed with home, which hands them to the Jobs mailbox on Cloudflare; the phone keeps its whole log (LA15)                                                                                                                                                                                                                                                  | the same                                   |
| Practice (the phone's)                                                                 | on the phone, never sent                     | on a paired phone, its finished sessions and kept items sent while the app is open; nothing let go on its own (LA15)                                                                                                                                                                                                                                                                                                                                                                                      | the same                                   |
| The routine's word sets and dramas (home's)                                            | not read                                     | read with the account's session while Korean is open; in the Android app, from the paired home with the pairing's key while Korean is open, nothing of the phone's sent but which it opened, by name, its newest files and its run records kept on the phone (LA15)                                                                                                                                                                                                                                       | the same                                   |
| LeetType session log (the phone's)                                                     | on the phone, never sent                     | its finished sessions copied to the paired home by the drain, each event without a spoken answer's ticks, read back before it counts as held; the phone keeps its whole log (LA15); for home's owner alone (its only account, or the one `MAILBOX_SUBJECT` names), home passes each finished session it holds on to the Jobs mailbox on Cloudflare, for the routine to read                                                                                                                               | the same                                   |
| Studio's time log and answers (the phone's)                                            | on the phone, never sent                     | each sitting's time log and its answer to how it went, copied to the paired home by the drain, the log read back before it counts as held; the phone keeps its whole log (LA15)                                                                                                                                                                                                                                                                                                                           | the same                                   |
| Speech                                                                                 | the browser's own voice                      | the server's speech service                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | the same                                   |
| Reminders                                                                              | the client's own policy, while a tab is open | the client's own policy, while a tab is open                                                                                                                                                                                                                                                                                                                                                                                                                                                              | the server's push, with the browser closed |

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
  only from `lib/home-link/sessions`, by the drain (LA15), with the same
  plan and receipt, no lock (the phone's link runs one thing at a time)
  and no authority (the pairing is the account). The phone's
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

- _Claim:_ a `createDataSource` for lessons or vocab passes
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

### LA7 (retired): a reflection reaches no server, but a spoken one's audio its person keeps on home

- _Retired:_ HF3 (#2178; the owner's decisions D1 and D2 on #2174: home is the
  owner's own store, and reflection text reaches the routine by the mailbox
  as its minimum). A written reflection now goes home through the drain and
  is kept there for good, so "reaches no server" no longer describes the code,
  and the share sheet that was its one way out (`shareReflections`, the
  arrival question, the reflections Drive folder) is gone. LA16 carries what
  still holds: what may send a reflection, what the one-tap answers and spoken
  reflections do, and the import allowlists.

### LA8: the phone reaches its home server through one module, and lets go only on a tap

- _Claim:_ in the Android app, every request to the home server goes through
  `lib/device-backend/native-http` (the one module that names
  `CapacitorHttp`), which only `lib/home-link` calls, and, but for the drain
  of what this phone keeps (LA15: aph, the Jobs record, Practice's record,
  voice notes, through `lib/home-link/lanes`, whose voice run also reads,
  by one `GET /voice-notes/on-drive` per 100 waiting takes in
  `lib/home-link/on-drive.ts`, which
  Studio takes home holds it knows Drive holds too, HF11, and sends, by one
  bodiless `PUT /voice-notes/:id/set-aside` per mark due in
  `lib/home-link/set-aside.ts`, home's set-aside mark for each note let go
  on the phone that home holds, MIC2) and Korean's look at the
  routine's files (`lib/home-link/routine`, one `GET /routine/files` per
  look and one `PUT /routine/opened` of names per open, started by the
  lesson's own query and the open), and Studio's idea answers asking home
  for a take's words (`lib/idea-hearing`, through `lib/home-link/heard`'s
  `keep`: one `GET /voice-notes/:id/heard` every 5 s while the idea screen
  shows a take home is hearing, never while the page is hidden, for at most
  3 minutes from the take's keeping; once home didn't answer, none more for
  that take, nor for any for 5 minutes on that pairing; the owner's
  direction on #2428, 2026-11-01, and IH1), which are the other callers of
  `lib/home-link`, is started by a tap in the Home server block of Settings
  (`components/settings/device-section.tsx`): the sync (published lessons
  and dramas, read with no credential), pairing (the code only), unpairing,
  and the clear of finished sessions home holds (`lib/home-link/clear`,
  after one confirm that names how many and the host): each finished
  session (`mayLeavePhone`: completed, not today's) read back from home
  (`readHeld`, `confirmHeld`) and confirmed held exactly as the phone does
  (`sameRecord`), and the phone then lets go of its own copy of those alone,
  each unchanged since it was read (`letGoUnchanged`); the clear sends
  nothing. The one other tap is the study list's "Let it go"
  (`components/sessions/device-let-go.tsx`, `lib/home-link/study-let-go`),
  after a confirm that says home keeps it: the one session it names, of any
  status, is copied home (`copyHome`) and read back (`readHeld`) in one run
  of the link, and the phone lets go of its own copy only if `confirmHeld`
  reports it held and it is unchanged since it was read
  (`letGoUnchanged`); otherwise it stays. Home's copy keeps its plan,
  status and times, and its `createdAt`, which the copy sends (on create,
  and in the patch that brings a copy up to date) and `sameRecord`
  compares (paulgsc/server#630). A finished session drained while home
  dated its copy on arrival is sent once more by the drain (its held entry
  in `lib/home-link/sent` names `createdAt` too), whose patch dates home's
  copy, so the clear then finds it held. On a
  phone known to be unpaired (`pairingIn`), whose confirm (`promiseOf`)
  says it can't be brought back, it is deleted as before and nothing is
  sent. The phone-full offer's "Remove it"
  (`components/settings/device-storage.tsx`, PF1) is that same let-go
  (`useSessionLetGo`) of the one session it offers, the oldest finished one
  (`oldestRemovable`), started on its press after an offer that says what
  it promises (`LET_GO.room.question`). Nothing on home is deleted.
  Nothing but the drain, Korean's look and the idea screen's ask for a
  take's words is sent when the app or Settings
  opens, on resume, on a timer or on a network change: making the runtime
  and `load` read only the phone's own record. There is no retry; a sync, a
  clear, a let-go or a drain's run ends at Stop,
  or when the app goes to the background, before its next request, and is
  over only once every request it started has settled.
  The pairing's credential is sent only to the base stored with it, over
  `https:` (`homeRequest` refuses a credentialed `http:` URL), and never on
  a sync read; no redirect is followed. Unpairing forgets it on the phone whether or
  not home could be told, and says which. The pair button names the host
  before it is pressed, and the clear names it. The credential is stored
  only by `HomeCredentialPlugin`, sealed by the Android Keystore, kept out of
  every backup and device-to-device transfer (`res/xml/backup_rules.xml`,
  `res/xml/data_extraction_rules.xml`, both named by the manifest), and
  deleted on a read, with its key, only when it cannot be read and the
  Keystore does not mark the fault as one that may pass (Android 13+).
- _Falsified by:_ a hunk that removes, narrows or widens the allowlists of
  the LA8 checks in
  `lib/serving-privacy/__tests__/egress-choke-points.test.ts` (who may name
  `CapacitorHttp`, call `native-http`, call `lib/home-link`); one that calls
  a `homeLink()` method that sends (`pair`, `unpair`, `sync`, `send`) from
  anywhere but a press handler in the Home server block or a module that
  block calls, or the study list's let-go (`letSessionGo`, run through
  `letSessionGoFor`, which only keeps the asked host beside its end) started from
  anywhere but its confirm's `onConfirm` and the phone-full offer's "Remove
  it" `onPress` (`components/settings/device-storage.tsx`), or that confirm
  or that offer no longer saying what its promise is (`LET_GO.question`,
  `LET_GO.room.question` in `lib/home-link/words.ts`), or a hunk in
  `components/sessions/device-let-go.tsx` whose `onConfirm`, or in
  `device-storage.tsx` whose `onPress`, passes a promise other than the one
  its question was given, or that has the offer remove its session by any
  route but `letSessionGo` (`useDeleteSession`, `sessionsRepository`), or
  that calls `useSessionLetGo`'s `start` (which asks nothing itself) from
  anywhere but those two, or widens the egress test's `LET_GO_CALLERS`; one that calls its `keep` from anywhere but
  `lib/home-link/lanes.ts` (LA15), `lib/home-link/routine.ts` and
  `lib/home-link/heard.ts`; one that has `heard.ts` send anything but one
  `GET` of `heardPath(id)` per ask, lets anything but `lib/idea-hearing`
  read it, or has `@some-ui/soundbites`' `stepHearing` ask while the page is
  hidden, more often than `pollMs`, with a second ask out, or past
  `deadlineMs` (`HEARING_TIMING`, 5 s and 3 minutes), or widens either; one that
  has `lib/home-link/on-drive.ts` send anything but its `GET`s, one per 100
  waiting takes, or lets
  anything but the voice run (`voice-copy.ts`'s `sendVoice`) read it; one
  that has `lib/home-link/set-aside.ts` send anything but one `PUT` of
  `setAsidePath(mark)` per mark `due`, with no body, or lets anything but
  the voice run call it; one that
  sends from `createHomeLink` or `load`, or, outside LA15's watch,
  Korean's look and the idea screen's ask for a take's words, from a
  `useEffect`, a timer, a `visibilitychange` or
  `online` listener; one that retries a failed home request, or queues one
  for later, outside LA15; one that lets the clear start without its
  confirm, or drops the count or the host from that confirm; one that has
  the clear send anything (`readHeld` with a method other than `GET`, or
  `clearHeld` calling the drain or a copy); one that lets the clear remove
  a phone session that `confirmHeld` did not report held, that
  `mayLeavePhone` refuses, or that changed since it was read
  (`letGoUnchanged`); one that widens `mayLeavePhone` (in
  `lib/device-backend/handlers/sessions`) to pass a session that is not
  completed or that was started or finished today, or that deletes,
  renames or moves it, or replaces a call to it with a condition of its
  own, without the same test at every site that picks on its own what may
  leave (the study list's let-go picks none: it asks about the one session
  the person named); one that lets that let-go remove a session
  `confirmHeld` did not report held, or any session but the one named, or
  send anything but `copyHome`'s and `readHeld`'s requests, or call
  `ports.remove` (the plain delete) unless its confirm promised no copy
  (`promiseOf`) and `pairingIn` reads the phone as unpaired; one that
  widens `promiseOf` to promise no copy while the pairing is anything but
  unpaired; one that deletes or weakens `removeUnchanged`'s `updated_at`
  match (in the same file), or lets `letGoUnchanged` (`lib/home-link/let-go`)
  delete by any other route, or be called but by the clear and the study
  list's let-go; one that makes `confirmHeld` write, or compare less than
  everything a copy carries (`sameRecord`); one that passes `copySessionsTo`
  anything but session records (a reflection, a stop or a soundbite: LA16),
  or lets `homeTransport` send a method other than `GET`, `POST` or
  `PATCH`, or hand a `401` to `requestJSON` (the app's own sign-out); one
  that lets the runtime's `work` end before every request it started has
  settled (`inFlight`, `track`), so a second tap could race a request still
  on its way; one that deletes or weakens the `onHidden` subscription in
  the runtime's `work`, the `stopPressed` it dispatches, the `stopped()`
  check in the `get` or `send` it hands out, or `onHidden`'s stop of a sync
  that starts already hidden (`lib/home-link/visibility.ts`); one that
  passes `token` on a sync's `get`, or with a URL not built from the stored
  pairing's `base` (or, in `pair`, the address being paired); one that
  removes `homeRequest`'s `https:` check or its `disableRedirects`; one
  that lets `unpair` keep the credential when the request fails, or report
  the phone unpaired when forgetting it failed; one that removes the host
  from the pair button or the paired line; one that writes the pairing
  record anywhere but `HomeCredentialPlugin`, or stores it there
  unencrypted; one that makes `HomeCredentialPlugin` delete the record or
  its key (`forgetKey`) anywhere but `read`'s `Lost` branch and `write`'s
  retry after a failure `mayPass` refuses; one that adds a `Lost` throw in
  `decrypt`, or widens a catch that becomes one, without consulting
  `mayPass`, removes a `mayPass` check `decrypt` makes, moves loading the
  Keystore inside such a catch, narrows `mayPass`, or makes `storedKey`
  throw `UnrecoverableKeyException` for anything but an entry that is not
  a secret key; or one that removes or narrows an `<exclude>` in either
  backup rule file, removes `android:fullBackupContent` or
  `android:dataExtractionRules` from the manifest, or renames
  `HomeCredentialPlugin.PREFS` without them.
- _Scope:_ `apps/www/src` (the phone build), `apps/mobile/android`, and
  `packages/ui/soundbites/src/lib/idea/hearing.ts` (when the idea screen asks).
- _Why not enforced:_ who may reach home is, by test (`egress-choke-points`:
  `CapacitorHttp` named only in `native-http`, whose index only
  `lib/home-link/index.ts` imports as a value (its `no-answer` sibling holds
  an error class and no request), and `lib/home-link` imported only by the
  Home server block, the study list's let-go, the phone-full offer, Settings' readout of what is
  kept on home, the drain and the marks of the records it sends, what hands
  aph's lane to them, the routine's readout and port, and the idea screen's
  listener (`lib/idea-hearing`); the routine's read sends one
  `GET /routine/files` and one `PUT /routine/opened` and nothing else, and
  the read of a take's words one `GET /voice-notes/:id/heard` and nothing
  else; and `confirmHeld` is called only in `lib/home-link/sessions.ts`).
  That the read of a take's words asks only while the idea screen shows it
  being heard, every `pollMs` and until `deadlineMs` or home's first
  failure to answer, is by test
  (`@some-ui/soundbites`' `lib/idea/__tests__/hearing.test.ts`, "IH1"), held
  when it joined (MIC10, #2428). What a test
  cannot say is that a call site in that block is a tap: a lint rule cannot
  tell a press handler from an effect that reaches it through a helper. Held
  when declared (HF8), by reading every caller (`device-section.tsx` alone
  calls `pair`, `unpair`, `stop` and, through `lib/home-link/sync` and
  `lib/home-link/clear`, `sync` and `send`, each from a button's `onPress`
  or `onClick`; `readHeld` is called only by `clearHeld`, and sends only
  through `confirmHeld`'s `GET`s) and by `lib/home-link/__tests__/runtime.test.ts`,
  `clear.test.ts` (the clear only reads, lets go of nothing home does not
  hold, and says each end in the person's terms), `sessions.test.ts` (a
  finished session leaves the phone only once home holds it as it is, a
  moved-on one once home's copy is brought up to date; an unfinished one,
  today's, a changed one and one home could not be asked about stay) and
  `components/settings/__tests__/device-section.test.tsx` (opening Settings,
  paired or not, sends nothing and offers no choice; unpairing and the clear
  each take a second press, and the clear only reads). Held when the
  study list's let-go joined it (HF5), by reading its one caller
  (`components/sessions/device-let-go.tsx` starts `letSessionGo` only in the
  confirm's `onConfirm`, with the promise its `LET_GO.question` was given)
  and by `sessions.test.ts`'s "the study list's Let
  it go" (an unfinished session leaves once home holds it as it is, and
  nothing else goes; an unreachable, refusing or forgetting home, a busy
  link, a read-back that differs and a session changed since keep it; an
  unpaired phone deletes it as before and sends nothing; a promise of home
  is never kept by a plain delete) and
  `routes/_dashboard/sessions/__tests__/index.phone.test.tsx` (the confirm
  says home keeps it on a paired phone and that it can't be brought back on
  an unpaired one; once home holds it the row leaves and says home keeps
  it; an unreachable home leaves it here, said in the row; a failed plain
  delete is reported and retried). Held when the phone-full offer joined it
  (#2422), by reading its one call (`RemoveOffer` in
  `components/settings/device-storage.tsx` starts `letSessionGo`, through
  `useSessionLetGo`, only in "Remove it"'s `onPress`, with the promise its
  `LET_GO.room.question` was given, and imports no other delete; its
  `IntentButton`'s "Try again" re-runs the same stored promise, as
  `useAsyncIntent`'s retry replays the variables it failed with), by
  `egress-choke-points.test.ts` (only the study list's route and the offer
  value-import `components/sessions/device-let-go`, `LET_GO_CALLERS`) and by
  `components/settings/__tests__/device-storage.test.tsx` (PF1: on a paired
  phone the offer says home keeps it and the session leaves on home's word
  alone; an unreachable home leaves it here, said in the offer, which stays
  open; an offer shown paired keeps it when the phone is unpaired by the
  tap, and one shown while the pairing can't be read promises home and
  keeps it; an unpaired phone's offer says it can't be brought back and
  deletes it as before).
- _Tolerance:_ home refuses a `createdAt` more than five minutes past its
  own clock, so a phone whose clock runs further ahead has that copy
  refused, and the copy (the drain's, or a let-go's) ends there, leaving
  the rest of that run unsent, until home's clock comes within five
  minutes of that `createdAt`. A home that predates paulgsc/server#630 ignores
  `createdAt`, so its copies never match the phone's, and nothing is let
  go on its word until it runs that change.

### LA9 (retired): aph is sent home only while its person is using it

- _Retired:_ HF8 (#2182, owner's decision D3). The consent log, the opt-in
  and the stop it gated, aph's way back (`bringBack`, `leaveHome`), the
  telling of choices to home (`told.ts`, `PUT /sharing/:scope`) and the
  `409 sharing_stopped` retelling are gone: a paired phone keeps aph on home
  from its first run, with no choice to make. The moments a run is asked
  for, which were this invariant's reading of intent, are LA15's.

### LA10 (retired): the Jobs record is sent home only while its person is using the wing

- _Retired:_ HF8 (#2182). The Jobs record drains on a paired phone from any
  screen (LA15); its old switch (`home.kept`) is no longer read or kept.
  What the exchange sends, reads and files, and that a refused event stays
  on the phone, is still `lib/jobs/__tests__/home.test.ts`'s; the notice
  token's filing (RUN5) is still read only by `fileNotice` in the run
  `exchangeJobs` makes.

### LA11 (retired): Practice is sent home on its own only while its person keeps sending it

- _Retired:_ HF8 (#2182). The standing send and Settings' tapped "Send to
  home" became one drain (`lib/home-link/drain.ts`, LA15), which a paired
  phone runs with no box to tick; what it carries and that it lets nothing
  go is `drain.test.ts`'s, and the clear that does let a finished session go
  is LA8's.

### LA12 (retired): Korean reads the routine's files from home only while its person shows them there

- _Retired:_ HF8 (#2182). The read log (`some-ui.home.reads.v1`), Settings'
  two-press choice and the words that gated telling home which lessons were
  opened are gone: a paired phone reads the routine's files while Korean is
  open and tells home which it opened, by name. That the read is one at a
  time, never retried, never rejected, and that nothing read outlives its
  pairing, is `lib/home-link/__tests__/routine.test.ts`'s; the moments a
  look is asked for are LA15's.

### LA13: voice notes go home from a paired phone, and none is lost before home has it

Voice notes are drained through LA15's wiring, with a lane of their own
(`lib/home-link/voice.ts`) and no mark: they come from more than one wing
(spoken reflections, the drama's scene notes, soundbites and grammar-lens
and LeetType takes in Practice, voice notes in Jobs, game bites, Studio
takes), so the app shell mounts the lane's watch
on every screen (`HomeLanes`, owner, paulgsc/some-ui#2038). Home keeps each
recording and transcribes it (paulgsc/server#460).

Which notes go, and what each is told home as, is enforced by test
(`lib/home-link/__tests__/voice-copy.test.ts`): a spoken reflection by its session
and when it was said, a written one never; a Jobs voice note by the first pick
or scout event that names it, a draft's never; a scene note as the drama's
next scene (`next-scene`), by when it was kept, shared or not (HF2, #2177;
`voice-send.test.ts` sends one never shared); a game bite
(`lib/game-bites`) by its game, with every field it keeps, once its hold
(Undo, and what a bite said first was about) has run out; a Studio take
still on the phone by its project, scene and take
(`<project>:<shot>:<take>`), when it was recorded, its audio leaving the
phone once home holds it (soundbites' `letGoHeldTakes`) and the owner's
choice allows it (LG1); a soundbite, once
its page has handed its store in (`lib/soundbite-keeping`), by how it came
to be recorded and when; a grammar-lens take by its line, and a LeetType
take by its session file and screen (`<file>:<screen>`), each by when it was
taken (HF5, #2180); and a Studio idea answer's take (`lib/idea-takes`) as a
Studio note by what it answers (`idea:<idea>:<question>`), by when it was
taken (MIC10, #2428), its words then read back by the idea screen (LA8); a
new idea's take (ST26, #2453) the same way, but only once the whole idea is
sent (`lib/takes-desk/__tests__/pattern.test.ts`, "ST26": a take waits on
the phone, `sent` lists none before its release, and only a waiting take is
deleted). That a note's audio is copied
once, before the record names it, that the copy goes once home holds the
note and stays when home refused it, and that a copy nothing names is swept
(`lib/voice-home/__tests__/runtime.test.ts`); that a note counts as home's
only once home answers with its SHA-256, that a replay counts as held, that
other audio under its id or a field home won't take is a refusal kept and
never sent again, and that a body home did not get or a forgotten phone
refuses nothing (`home.test.ts`); and that the copies' store is reached only
from the voice lane, a copy made only in `voice-copy.ts`, the watch started
only from the lane's hook and the scene notes read for home only there
(`egress-choke-points`). What no test can say is when a note is copied:

- _Claim:_ a voice note's audio is copied for home (`phoneVoiceHome().copy`)
  only while the phone is paired (`paired()`), and only from `copyAll` (each
  spoken reflection, named Jobs note, scene note in the draft, game bite past
  its hold, Studio take still on the phone, soundbite, and grammar-lens and
  LeetType take on its desk, and Studio idea answer's take on its desk, a
  new idea's only once its idea is sent, from `watchVoiceNotes`, which
  only `useVoiceHome`'s effect starts, and from the lane's exchange,
  `sendVoice`); the lane's runs are asked for as LA15 says, its
  exchange is `sendVoice` (a copy pass, then `exchangeVoice` over the
  store's `keeping`, its end read with the pass's by `runEnd`, LA14, then,
  only once that exchange is `synced`, one `letGoOnHomesWord(send)`, home's
  word on which Studio takes Drive has, HF11, which does not change the
  run's end, then one `markSetAside(home.marks, send)`, home's set-aside
  mark for each note let go on the phone that home holds, MIC2, whose end
  is then the run's, read with the pass's by `runEnd`), and a copy goes
  only once home holds its note. Letting a note
  go where it was recorded never removes its copy, and the drama's draft
  lets a scene note go on home's word only once home holds the ask that
  named it too (`prompted`, which only LA18's `letGoHeldPrompts` sets).
  A note is set aside only once its mark is owed in the voice-home record
  as storage keeps it: every Let go (`standing: "set-aside"`; a Redo's
  `earlier` owes none) goes through `lib/voice-marks`' `setAsideOwing`,
  which owes the mark, with the store it is kept in (`owe`, which says no
  when storage refused it and then holds it nowhere), before the store
  writes the standing, writes nothing when it can't, and takes the mark
  back when that write fails. Whether home holds the note yet, and whether
  the phone is paired, do not matter: `marksDue` sends a mark only once
  home holds its note. So no exit that lets a held note go needs a check of
  its own. The stores with Let go are spoken reflections, Jobs notes, scene
  notes, soundbites (through `soundbitesOweMarks`), and lens and LeetType
  takes; Rust Rounds takes owe none until their notes go home (RR6, `from`
  null); game bites, Studio takes and the answers to Claude's questions
  about an idea have no Let go. A new idea's takes (ST26) owe no marks
  either (their desk's `from` is null): before Send, its Delete, a Redo
  and the clean-up of a kept idea's takes it doesn't name delete for good
  a take that still `waits`, through the desk's `discard`. Once a take no
  longer waits, only the desk's own two exits remove it, as on every
  takes desk: making room at the cap of 40, which lets the oldest take
  home holds go (`makesRoom`), and the sweep of a take whose audio never
  landed (`sweepIdeaTakes`), which takes a waiting one too. A mark
  goes to home only while its note reads set aside where it is kept, or
  is listed nowhere by its store, read this pass (`marksSendable`; the
  soundbites count as read only once the pass has read them): one whose
  note reads current, its write still pending or never landed (the app
  closed between the owe and the soundbites' write), is taken back by the
  next copy pass (`settleMarks`). A pass also forgets a mark whose note
  its store, read, no longer lists and whose copy neither waits nor is
  held, and past `ASIDE_OWED_MAX` (500) owed marks drops the oldest whose
  note has left the phone, home holding it or not (a home without the
  route answers every mark `404`); a mark whose note is still on the phone,
  or whose copy waits, is never dropped, so the cap is passed only by
  those, which the stores' own caps bound. Marks owed stay bounded. A note set aside before marks were owed at Let go, or while no
  lane was wired (`voiceMarks` answers yes until `watchVoiceNotes` wires
  it, first), is owed on the first pass that lists it (`oweMarks` in
  `copyAll` and first in `letGoHeld`), and until then may leave as before.
  A mark home answers `404` for stays owed and is asked for again on every
  run, never given up: a `404` is also what a home without the route
  answers.
- _Falsified by:_ a hunk LA15's falsifier names for the shared files; a hunk
  to `lib/takes-desk/index.ts` that lets `kept` (or `forExport`) list a take
  that still `waits`; one to `lib/takes-desk/pattern.ts` or `index.ts`'s
  `deskList` that clears `waits` anywhere but `release`, or lets `discard`
  remove a take that no longer waits; one to soundbites'
  `lib/idea/bundle-runtime.ts` that calls `release` before the ideas kept
  hold the idea (`send`), or for takes no kept idea names (`send`'s and
  `settle`'s takes, from `lib/idea/bundle.ts`' `namedBy`) (ST26); one to
  `lib/idea-takes/index.ts`, `bundle-runtime.ts` or `bundle.ts` that lets
  the new idea's desk (`bundleDesk`, whose `from` is null) let go a take
  that no longer `waits`: a call of its pattern's `letGo`, or a removal
  there but through `discard`, the desk's `sweep` or its making room at
  the cap;
  a hunk to `lib/scene-voice/runtime.ts` that lets `letGo` remove a scene note that
  is not `prompted` (an ask home holds named it, LA18) or that home does not
  hold; a hunk
  to `lib/home-link/voice-copy.ts` that calls `copy` from anywhere but
  `copyAll`, removes its `paired()` checks (before every note and again
  after its audio is read), starts
  `copySoon` from anything but `watchVoiceNotes`, its subscriptions and
  `sendVoice`, or makes `sendVoice` anything but a copy pass, then
  `exchangeVoice` over `phoneVoiceHome().keeping`, then, only after a
  `synced` exchange, one `letGoOnHomesWord(send)` and one `markSetAside`
  over the same store's `marks`, whose end only `runEnd` may change (so
  also one that lets `letGoOnHomesWord` throw, or its outcome reach what
  `sendVoice` returns); one that drops `oweMarks` from `copyAll`, or moves
  it in `letGoHeld` after a store's `letGo`, or has a candidate's `aside`
  say a note is set aside for any standing but `set-aside`; a hunk that
  writes a `set-aside` standing anywhere but inside a `setAsideOwing`
  write (the `setAside` ports of `lib/takes-desk/pattern.ts`,
  `lib/scene-voice/runtime.ts` and `lib/jobs/runtime.ts`, and
  `lib/reflection-voice/index.ts`' `setAside`) or soundbites' `setAside`
  port after `asideMarks().owe` (`packages/ui/soundbites/src/lib/runtime.ts`),
  that writes it when the mark was not owed or keeps it when the mark was
  taken back, or that drops `wireVoiceMarks` from `watchVoiceNotes` or
  `soundbitesOweMarks` from the soundbites route, or calls it later than
  first in `watchVoiceNotes`; one that lets `sendVoice` hand `markSetAside`
  a mark `marksSendable` does not pass, or reads the soundbites' standing
  from a list the pass did not read; one that drops `settleMarks` from
  `copyAll`, or has it forget a mark whose copy waits or is held, or drop
  past `ASIDE_OWED_MAX` one whose note is listed or whose copy waits, or
  any but the oldest; one that
  gives a takes desk whose takes go home (`lib/lens-takes`,
  `lib/leetype-takes`) a `from` of null, or a store the wrong `from`; one to
  `lib/voice-home/runtime.ts` that has `owe` say yes of a mark storage did
  not keep, or keep one it refused in memory; one to
  `lib/home-link/set-aside.ts` that gives up a mark on a `404`; a hunk to
  `lib/home-link/lanes.ts` that makes `paired` anything but the link
  holding a pairing; a hunk to `lib/home-link/voice.ts` that makes the lane's `exchange` anything but
  `sendVoice`, or calls `watchVoiceNotes` from anywhere but `useVoiceHome`'s
  effect, or drops its cleanup; a hunk to `lib/scene-voice` that makes
  `sceneNotes` read anything but the draft's list, or lists a note before
  its audio is on the shelf (`shelveTake` in `runtime.ts`); a hunk to
  `lib/voice-home/runtime.ts` that
  removes a copy from the shelf on anything but a `held` answer, a record
  storage would not keep, or in `sweep`, lets `sweep` remove a copy the
  record names waiting or refused, writes the record naming a copy before
  the shelf took it, or counts a copy whose record storage did not keep; or
  a hunk to `lib/voice-home/home.ts` that counts a note held without home's
  `200` naming its id and the phone's SHA-256, or refuses one on a `422`
  that names only its body.
- _Scope:_ LA15's shared files, `apps/www/src/lib/home-link/voice.ts`,
  `voice-copy.ts`, `set-aside.ts`, `apps/www/src/lib/voice-home/**`,
  `apps/www/src/lib/voice-marks/**`, `apps/www/src/lib/takes-desk/pattern.ts`
  and `index.ts`, `apps/www/src/lib/idea-takes/index.ts`,
  `packages/ui/soundbites/src/lib/idea/bundle-runtime.ts` and `bundle.ts`,
  `apps/www/src/lib/jobs/runtime.ts`, `apps/www/src/lib/reflection-voice/index.ts`,
  `packages/ui/soundbites/src/lib/runtime.ts` and `aside-marks.ts`,
  `apps/www/src/lib/scene-voice/index.ts`, `runtime.ts`,
  `apps/www/src/lib/soundbite-keeping/index.ts`.
- _Tolerance:_ a note let go before the watch copies it (the app closed in
  between, or a long pass had not reached it) is not copied; one the copies'
  shelf has no room for (`VOICE_HOME_MAX_BYTES`, a hundred minutes), or whose
  record storage will not keep, waits until a copy fits and is lost if it is
  let go meanwhile; a note on
  Android 7, whose native request sends no body, waits and is never sent,
  and Settings says sending went wrong. A reflection that leaves the bounded
  list before it is copied is not copied either. A Jobs note let go once its
  share arrived in Drive before a copy was made, and a note whose audio is
  gone, are never copied, and Settings says so (LA14). A note recorded on a
  phone that was never paired is not copied until it is. A scene note kept
  before HF2 noted when is told home as of its copy. A note set aside
  before marks were owed at Let go, or before the lane was wired, may leave
  the phone before the pass that owes its mark. A soundbite whose
  set-aside write lands after a pass read it as current has its mark taken
  back by that pass and owed again by the next, which reads it set aside;
  if a new soundbite makes room with it in between, home never gets its
  mark. While home runs a server without the set-aside route (before
  paulgsc/server#638), marks past `ASIDE_OWED_MAX` are lost, the oldest of
  those whose notes left the phone first; once home runs one with it, the
  marks owed drain.
- _Why not enforced:_ which files call the copy, the watch and the scene
  notes' read are pinned (`egress-choke-points`). Whether each call
  copies only while the phone is paired is a reading of its guard, which a
  source scan sees as text and a lint rule cannot tie to the link's state.
  Held when declared (reworded for HF8, and for HF2), by reading every
  call: `copy` only in `copyAll`, behind `paired()` before each note and
  after its audio is read; `sceneNotes.read` only in `candidates`, over
  the draft's list, which `shelveTake` writes only after the audio is
  shelved; the soundbites, lens takes and LeetType takes read only in
  `readSoundbites` and `candidates`, from the stores themselves (HF5);
  `watchVoiceNotes` only in
  `useVoiceHome`'s effect, which returns its cleanup; `useVoiceHome` only in
  `HomeLanes`, which `_dashboard.tsx` mounts under `VITE_DEVICE_BACKEND`;
  `shelf.remove` in the runtime only on `held` and in `sweep`, which keeps
  waiting and refused copies. For MIC2, by reading every write of a
  `set-aside` standing (`grep -rn '"set-aside"'`: the five `setAside`
  ports, each inside `setAsideOwing` or after `owe`, and the stores' own
  writes, which only those ports call), `oweMarks`' two calls (in `copyAll`
  after the sources are read, and first in `letGoHeld`) and `asideAt`,
  which answers only for `set-aside`; that each store owes before it
  writes, and writes nothing without, is held by its own test (the desk's
  `pattern.test.ts`, `scene-voice/runtime.test.ts`, `jobs/__tests__/runtime.test.ts`,
  soundbites' `components/soundbites/index.test.tsx`, `voice-marks/index.test.ts`),
  and the marks' path end to end, `marksSendable` and `settleMarks`
  included, by `voice-aside.test.ts`, `set-aside.test.ts`
  and `lib/voice-home/__tests__/model.test.ts` and `runtime.test.ts`.

### LA14: Settings never says a voice note waits that this phone cannot send

A promise held by tests (paulgsc/some-ui#2088, `Change-Kind: defect`,
widening LA13): on the owner's phone Settings said "2 voice notes wait on this
phone" for good, with Send now changing nothing. They were Jobs notes whose
audio the Jobs runtime let go once their share arrived in Drive (`arrived()`,
`releasedVoice`), still offered by `jobsNotes`; and every copy that failed
was silent, so the run ended as if all had gone.

- _Claim:_ on a paired phone, the count Settings says waits
  (`voiceLane.useCounts`) is only notes this phone can still copy or send;
  one it can never send is named with why (`unsentLines`: gone from this
  phone, as the Jobs notes let go before LG1 are), and a run whose copy pass left a
  note it could copy uncopied ends failed with why (`runEnd`: this phone's
  fault, `fault`, before its lack of room, `room`), which `laneView` words.
- _Family:_ every source state of a note: still on the phone; a Jobs note a
  Drive share carried, copied before or not; its audio gone; its
  copy refused by the shelf (no room), by storage that won't keep the record,
  or by an error; and every outcome of the exchange after the pass (sent all,
  home forgot the phone, home answered otherwise), with a run before it or
  none.
- _Proof:_ `lib/home-link/__tests__/voice-copy.test.ts` (a Jobs note a Drive
  share carried is a candidate like any other; a gone note is counted until
  settled); `lib/home-link/__tests__/voice-send.test.ts`
  (`sendVoice` and the lane's count over fake stores: a gone note fails no
  run and stops waiting, no room fails the run and waits until it fits, a
  read that throws or storage that won't keep the record fails it as the
  phone's fault and the pass goes on, and a Jobs note whose audio is gone is
  named gone; each before any run and after one);
  `lib/voice-home/__tests__/model.test.ts` ("how a run ends after a copy pass
  (LA14)": every pair of note ends, with and without a gone note, against
  every exchange end); `lib/voice-home/__tests__/runtime.test.ts` (`copy`
  says `roomless` and `unkept`); `lib/home-link/__tests__/words.test.ts` (each
  failed run's line, and none naming the machinery); and
  `components/settings/__tests__/device-kept-on-home.test.tsx` (Settings
  shows the notes it can't send, and says nothing waits for them).
- _Tolerance:_ a pass under way when Send now is pressed is the one the run
  waits on, so a note changed during it is counted by the next run.

### LA15: a paired phone drains what it keeps to home on its own, at the moments its person is using the app

Everything the phone keeps for home (aph, the Jobs record, Practice's
record with its written reflections, asks for the next scene, the
soundbites' records, LeetType's answer notes and the grammar-lens record,
voice notes) goes through one wiring (`lib/home-link/lanes.ts`):
each declares its lane (its exchange, how its record moves, its sheet's
counts; `aph.ts`, `jobs.ts`, `practice.ts`, `voice.ts`), and every lane
shares the runtime (`kept-runtime.ts`), the watch (`kept-watch.ts`) and the
app shell's mounting of it (`components/device-home-glyph.tsx`'s
`HomeLanes`, on every screen of the Android app; aph's lane while aph's
screens hand its store in, since only they may import `@some-ui/aph`). There
is no choice: a paired phone drains, and the only taps that let anything leave
the phone on home's word are LA8's clear, the study list's "Let it
go" and the phone-full offer's "Remove it" (what goes on its own once home holds it, as
aph's changes and the written reflections past the offline set do, is each
record's own invariant: LA16 for reflections, LA18 for asks). Korean's look at the routine's files
(`routine.ts`) is read the same way, by the lesson's own query.

What each lane sends, and what the phone may let go of, is enforced by
test: who reaches the link and its `keep` lane (`egress-choke-points`), the
requests each exchange makes and that an entry leaves the phone only once
home answers with it unchanged (`packages/ui/aph/src/lib/__tests__/sync.test.ts`,
`home.test.ts`; `lib/jobs/__tests__/home.test.ts`; `lib/home-link/__tests__/drain.test.ts`,
which also holds that the drain sends only finished sessions and what
changed since home last held it, lets nothing go, and stops before its next
request; `voice-send.test.ts`, which also holds that the voice run asks
home which Studio takes Drive has only under "Keep each until Drive has it
too", HF11, and lets go only what home names), that Practice's lane asks for a run on a
new soundbite, LeetType answer note or lens entry, or on a LeetType session
finishing, and counts each, with Studio's sittings and answers, waiting
until home holds it (#2425), and that once its run has sent them LeetType's answer
notes stop saying full with no other redraw and the soundbites' page is
handed what home holds again (`practice.test.ts`, OS1), as it is when the
voice lane comes to hold a soundbite's audio after that run
(`voice-send.test.ts`, OS1), one run at a time and home being busy said
as such (`kept.test.ts`), and that the shell's drain sends nothing unpaired
and sends once paired on the moments below, while a mark sends nothing of
its own (`components/__tests__/device-home-glyph.test.tsx`). What no test
can say is when a run is asked for:

- _Claim:_ `askKept` (`lib/home-link/kept-watch.ts`) asks for a run of a lane
  only while the phone is paired and the document is visible, and only at a
  moment its person is using the app: from `watchKept`, which only
  `useLaneHome` starts, for as long as `HomeLanes` is mounted (every screen
  of the Android app; aph's lane for as long as its screens hand it in), on
  the watch starting, a move of the lane's revision (its record changed on
  this phone), the app coming back to the foreground, the network coming
  back, the phone being paired, or the link freeing up after turning a run
  away; or from `askLane`, which a mark's sheet and Settings' readout call
  only from their Send now button. Nothing asks on a timer. A run goes
  under the pairing the phone holds when it starts (`laneExchange`), and
  the link's `send` refuses a request once the phone stops or goes to the
  background. For aph, the first run on a paired phone moves its record to
  home (`keepOnHome`, in the lane's `exchange`), and from then on the phone
  holds the settings and what home has not confirmed. Korean's look
  (`routineReads().list()`) is called only through the port
  `useHomeRoutineFiles` (`components/player/device-routine-files.ts`)
  returns, which exists only while the phone is paired, keyed by the
  pairing; `session-viewport.tsx` hands that port to topik's `routineFiles`
  alone, in the device build alone, and topik reads it only in the handheld
  lesson's `useRoutineFiles` query (on the lesson mounting and the app
  coming back to the front, while Korean is open; never on an interval, a
  reconnect or a retry), and tells home which lessons it opened only from
  that open (`tellOpened`).
- _Falsified by:_ a hunk to `lib/home-link/kept-watch.ts` that reaches
  `askKept` from anything but `watchKept`'s record subscription, its link
  subscription, its `visibilitychange` and `online` listeners and its first
  ask, adds a timer, changes when a listener asks (the record subscription's
  check that the revision moved, the link subscription's test for a new
  pairing or for the link freeing up after a run it turned away), removes or
  changes anything the cleanup `watchKept` returns undoes, or removes
  `askKept`'s check that the phone is paired or that the document is
  visible; a hunk to `lib/home-link/lanes.ts` that calls `watchKept` from
  anywhere but `useLaneHome`'s effect, passes it anything but `wire(lane)`'s
  `record` and `sending`, keeps that effect from returning the cleanup
  `watchKept` returns, calls `askKept` from anywhere but `askLane`, makes
  `paired` anything but the link holding a pairing, or makes the record's
  `revision` or `subscribe` anything but the lane's; a hunk to
  `lib/home-link/kept-runtime.ts` that lets `laneExchange` run a lane's
  exchange unpaired or under a pairing other than the one read when the run
  starts, or makes a run say anything but busy once home answered one of
  its requests `429` (unless it was forgotten or stopped); a hunk to
  `components/device-home-glyph.tsx` that calls `askLane` other than from a
  button's `onClick`, mounts a watch (`useLaneHome`, `useVoiceHome`)
  anywhere but `HomeLanes`, drops a lane from `HomeLanes`, or shows a lane
  under another wing's mark; a hunk to
  `components/settings/device-kept-on-home.tsx` that calls `askLane` other
  than from its Send now `onClick`, or calls `askKept`, `useLaneHome` or
  `watchKept`; a hunk that mounts `HomeLanes` anywhere but
  `routes/_dashboard.tsx` in the device build, `DeviceHomeGlyph` anywhere
  but its header, or `DeviceAphLane` anywhere but
  `routes/_dashboard/_apk/aph.tsx`; a hunk to `lib/home-link/aph.ts` that
  makes the lane's `exchange` do more than make the switch and run aph's
  exchange, or its `revision` anything but the store's `edits` while on
  home and -1 on the phone; a hunk to `lib/home-link/jobs.ts` that makes
  the lane's `revision` anything but twice the log's length, plus one while
  `noticeFiling` owes home a request, or its `exchange` anything but
  `exchangeJobs` over the runtime's `keeping`; a hunk to `lib/jobs` that
  reads home's digests, files a decisions or scouts file or the notice
  token anywhere but in `exchangeJobs`, or that deletes, renames or moves
  `readDigests`, `fileOutgoing` or `fileNotice` (`lib/jobs/home.ts`) so
  `exchangeJobs` no longer makes it in every run that gets that far; a hunk
  to `lib/home-link/practice.ts` that makes the lane's `revision` or
  `subscribe` follow anything but the sessions cache, `onKept`, the
  reflections store (HF3), the asks store (`lib/scene-ask`, HF4),
  LeetType's answer notes (`leetypeNotesMoved`, HF5) and the soundbites,
  lens record, LeetType's finished sessions and Studio's writes as
  `lib/home-link/practice-reads.ts` last read them (HF5, #2425), or that
  drops one of those from it, drops from its waiting count any of the
  sessions, written reflections, asks, notes, lens entries, finished
  LeetType sessions or Studio sittings and answers home lacks (Studio's
  time log read as it is when counted, #2425), or makes its `exchange` anything but
  `drainHome` over the phone's own ports (`./going`, and `./voice-copy`'s
  `holdNotes`, which only hands the soundbites and LeetType's answer notes
  how to read what home holds of them, OS1) under the run's `pairing`; a
  hunk to `lib/home-link/practice-reads.ts` that reads a
  store other than on its watch starting, the soundbites' hand-in or
  change (their store's `subscribe`), Studio's hand-in or a write to its
  projects (their store's `subscribe`), or, once the phone is paired, a write
  to the lens record (topik's `onLensRecordWritten`) or an event LeetType's
  log keeps (`onSessionLogged`) that starts or ends a session or belongs to
  one already finished, or that keeps a list of the soundbites or of
  Studio's answers that started before a newer one; a hunk to
  `@some-ui/leetype`'s `session-log` that keeps an event without telling
  `onSessionLogged`'s listeners, or tells them of one it refused, or to its
  `home.ts` that lets an event other than a start or an end finish a
  session, or one already finished take in no later event, without
  `practice-reads.ts`'s `finishes` following it; a hunk to topik's
  `adapter/lens-record-store` that keeps an entry without telling
  `onLensRecordWritten`'s listeners, or to `lib/leetype-takes` that keeps
  or lets go of a note without moving `leetypeNotesMoved`; a hunk to `lib/home-link/drain.ts` that takes home's copy in,
  lets a phone session go, lets anything else go but through `letGoHeld`
  (LA16) and `letGoHeldPrompts` (LA18), or confirms what home holds
  (`confirmHeld`), or sends other than through `copyHome`, `sendKept`,
  `sendLog`, `sendStudio`, `sendReflections` (LA16), `sendPrompts` (LA18),
  `sendNotes` and `sendLens`; a hunk to `lib/home-link/voice-copy.ts` that
  makes `holdNotes` do anything but hand LeetType's answer notes
  (`leetypeNotesHeldByHome`) and the soundbites (their `heldByHome`) how to
  read what home holds of them; a hunk to `lib/home-link/leetype-log.ts` that
  lets `sendEach` count an item held on any answer but a `200` its `heldAs`
  accepts; a hunk to `lib/home-link/notes.ts` that counts a note held
  without home's `200` naming the SHA-256 of the bytes sent, or to
  `lib/home-link/lens-record.ts` that counts an entry held without home's
  `200` carrying it back as sent, or makes `lensEntriesHeld` (the reading
  of what home holds that `./voice-copy` hands topik) other than `sent.lens`
  matching the entry as it is now; a hunk to
  `lib/home-link/model.ts` or `runtime.ts` that lets `pair` keep an earlier
  pairing's `id`, or lets `load` report an `id` other than the one stored
  with the key; a hunk to `lib/home-link/sent.ts` that lets
  `sessionsToSend` pass a session that is not completed, or `readSent`
  return one pairing's record for another; a hunk that calls
  `routineReads()`'s `list` anywhere but the port in
  `device-routine-files.ts`, or its `tellOpened` anywhere but that port's
  `opened`; a hunk to `device-routine-files.ts` that returns a port while
  the phone is not paired, or keys it on anything but the pairing; a hunk
  to `session-viewport.tsx` that reaches `useHomeRoutineFiles` other than
  through `useRoutineFromHome`'s `VITE_DEVICE_BACKEND` branch, or hands its
  port anywhere but topik's `routineFiles`; a hunk to `routine.ts` that
  lets `list` start a read without `mayRead`'s checks or while one under
  the same pairing is on its way, lets it reject, retries a read, starts
  one from a timer or from the `onLink` listener (which only settles),
  sends anything but one `GET /routine/files` and, from `tellOpened` alone,
  one `PUT /routine/opened` of `{ opened }` names, lets `tellOpened` send
  unpaired, with the app in the background, or while one is on its way,
  retries one or lets it reject, keeps an answer whose pairing is not the
  phone's when it lands, removes or weakens `settle`'s clearing, or keeps
  home's files anywhere but memory; a hunk to topik's
  `adapter/server/routine-files-queries` that keys its query on anything
  but the feed's `key` (or, with none, whether there is a feed), or changes
  or removes its `enabled`, `staleTime`, `refetchOnMount`,
  `refetchOnWindowFocus`, `refetchOnReconnect` or `retry`, or adds a
  `refetchInterval`; a hunk in topik that calls the feed's or the port's
  `list` anywhere but that query's `queryFn`, or that calls
  `useRoutineFiles` anywhere but `HandheldLesson`; or a hunk that deletes,
  renames or moves any file, function or constant this claim names without
  carrying the claim to its new place.
- _Scope:_ `apps/www/src/lib/home-link/kept-watch.ts`, `lanes.ts`,
  `kept-runtime.ts`, `aph.ts`, `jobs.ts`, `practice.ts`,
  `practice-reads.ts`, `voice.ts`,
  `drain.ts`, `going.ts`, `voice-copy.ts`'s `holdNotes`, `leetype-log.ts`,
  `notes.ts`, `lens-record.ts`,
  `sent.ts`, `model.ts`, `runtime.ts`, `routine.ts`,
  `routine-model.ts`, `apps/www/src/components/device-home-glyph.tsx`,
  `apps/www/src/components/settings/device-kept-on-home.tsx`,
  `apps/www/src/components/aph/device-aph-lane.tsx`,
  `apps/www/src/components/player/device-routine-files.ts`,
  `apps/www/src/components/player/session-viewport.tsx`,
  `apps/www/src/routes/_dashboard.tsx`,
  `apps/www/src/routes/_dashboard/_apk/aph.tsx`,
  `apps/www/src/lib/jobs/home.ts`, `apps/www/src/lib/jobs/notice.ts`,
  `packages/ui/aph/src/lib/sync.ts`, `packages/ui/aph/src/lib/store.ts`,
  `packages/ui/topik/src/lib/topik/adapter/server/routine-files-queries/index.ts`,
  `packages/ui/topik/src/lib/topik/adapter/routine-files/index.ts`,
  `packages/ui/topik/src/components/topik/handheld/handheld-lesson/index.tsx`,
  `packages/ui/topik/src/components/topik/study-session/index.tsx`,
  `packages/ui/topik/src/lib/topik/adapter/lens-record-store/index.ts`,
  `apps/www/src/lib/leetype-takes/index.ts`,
  `apps/www/src/lib/home-link/studio-log.ts`, `apps/www/src/lib/studio-keeping/index.ts`,
  `packages/ui/leetype/src/lib/leetype/session-log/index.ts`,
  `packages/ui/leetype/src/lib/leetype/session-log/home.ts`.
- _Why not enforced:_ whether a moment is one where the person is using the
  app is a reading of intent: a test sees a listener or a query run, not why
  it is there, and a lint rule cannot tell a press handler from an effect
  that reaches it through a helper or a port handed down a prop. Held when
  declared (HF8), by reading every call: `watchKept` only in `useLaneHome`'s
  effect; `askKept` in `watchKept`'s three listeners and its first ask, and
  in `askLane`; `askLane` only in the sheet's and Settings' Send now
  `onClick`; `useLaneHome` only in `HomeLanes`' `LaneWatch` and
  `useVoiceHome` (itself only in `HomeLanes`' `VoiceWatch`); `HomeLanes`
  only in `_dashboard.tsx` under `VITE_DEVICE_BACKEND`; `DeviceAphLane`
  only in aph's layout; `list` only in `device-routine-files.ts`'s port,
  that port only in `session-viewport.tsx`, under `VITE_DEVICE_BACKEND`, as
  topik's `routineFiles`, and topik's feed only in `KoreanStudyPage`'s
  session config, read by `useRoutineFiles` in `HandheldLesson` alone, with
  `refetchOnMount` and `refetchOnWindowFocus`, `refetchOnReconnect` and
  `retry` off, and no interval; no timer or listener in `routine.ts` but
  `onLink`, whose listeners only settle and drop what waits under another
  pairing. Amended for #2425 by reading `practice-reads.ts`'s two new reads:
  LeetType's log only on its watch starting once paired and in
  `onSessionLogged`'s listener, Studio's projects only on its hand-in and
  its store's `subscribe`, which `practice-reads.ts` alone now holds for
  the lane.
- _Tolerance:_ Studio's time log tells no one of a write, so a screen
  entered or left in Studio asks for no run, and Practice's waiting count
  shows it from the count's next redraw (#2425).

### LA16: written reflections are kept on home, append-only, and the phone lets one go only once home holds it

Home keeps every written reflection (paulgsc/server `written_reflection`,
its `docs/identity.md` invariant 29), one per id, append-only, and hands what
the reflections routine reads of each (its id, session, time and text) to the
Jobs mailbox's `reflection` folder (owner, D2 on #2174). The phone keeps an
offline set (`lib/session-reflection/policy.ts`): its newest
`REFLECTION_LIMIT`, and past them only what home does not hold, so it never
refuses a new one for lack of room (#2098's offline set, for reflections).

What is enforced by test: that only typed lines go, each once, as the phone
keeps it, and count as home's only on an answer that holds them exactly as
sent (`lib/home-link/__tests__/reflections.test.ts`); that the drain puts
them last, remembers what home held and lets go only through its port after
that part (`drain.test.ts`, "the drain's written reflections"); that
`admit` never refuses and `beyondOffline` names only what is past the set and
held (`lib/session-reflection/__tests__/policy.test.ts`, `store.test.ts`).
What no test can say is where a reflection goes once an allowed module holds it:

- _Claim:_ a session reflection (`lib/session-reflection`), or any value built
  from one, reaches `file_host` only as a written one (`body.kind` `text`),
  whole and as kept, through the drain's reflections part
  (`sendReflections` in `lib/home-link/reflections.ts`, through `sendWhole`
  in `leetype-log.ts`, one `PUT /routine/reflections/:id` each, from
  `drainHome` alone), or as a spoken
  one's voice note and its set-aside mark (LA13); the one-tap answers reach no server; nothing else
  passes one to anything that sends to `file_host` or writes a session, a
  signal or the device backend's database; and a reflection leaves the phone
  without its person's own let go only through the store's `trimOffline`,
  called only from `drainHome`'s `letGoHeld` port, in the `finally` after
  that part, with the
  ids `heldWritten` reads from what home answered (`sent.reflections`). Two
  allowlists in `apps/www/eslint.config.js` bound where one can travel: the
  modules that hold or show reflections (`REFLECTION_MODULES`) import from
  `@/` only what `REFLECTION_MAY_IMPORT` names and nothing from `fetch-kit`;
  and no module imports a reflection module but those,
  `REFLECTION_IMPORTERS` and tests (`reflection-voice/budget`, a size, aside).
- _Falsified by:_ a hunk that removes or narrows either LA16 block in
  `apps/www/eslint.config.js` (a glob, a pattern, the restated base
  patterns), moves a module that holds reflections out of
  `REFLECTION_MODULES`, or adds an `eslint-disable` of `no-restricted-imports`
  in a file either block covers; a hunk that adds a name to
  `REFLECTION_MAY_IMPORT`, `REFLECTION_IMPORTERS` or `allowImportNames` (read
  the module it names against the claim); a hunk, in a module either list
  names, that passes a reflection or a value built from one to a call that
  sends to `file_host` or writes a session, a signal or the device backend's
  database, other than `sendReflections`' `PUT` and LA13's voice lane; a
  hunk that calls `wireVoiceMarks` anywhere but `watchVoiceNotes`; a hunk
  to `lib/home-link/reflections.ts`, or to `sendWhole` or `heldBy` in
  `lib/home-link/leetype-log.ts`, that sends anything but a `text`
  reflection, whole as kept, or by another method or path, or lets `held`
  hear one home's answer does not hold exactly as sent; a hunk to
  `lib/home-link/drain.ts` that calls `sendReflections` or `letGoHeld` from
  anywhere else, passes `letGoHeld` anything but the run's own `sent`, or
  moves the call out of the `finally`; a
  hunk to `lib/home-link/going.ts` that has `letGoHeldReflections` pass
  `trimOffline` anything but `heldWritten` over the store's own list and that
  `sent`; a hunk that calls `trimOffline` anywhere but there; or a hunk to
  `lib/session-reflection/policy.ts` or `index.ts` that lets `admit` refuse
  or drop another, lets `beyondOffline` name one inside the newest `limit` or
  one `held` does not name, gives the list a limit of its own, or lets
  `trimOffline` remove anything `beyondOffline` did not name.
- _Scope:_ `apps/www/src`. The whole study-context export's share
  (`lib/agent-export`, `shareAgentExport`) is LA1's "what a learner chooses to
  send", not a request, and lets nothing go (LG1).
- _Why not enforced:_ the imports are, by lint, and each part above is held
  by its test. What a lint cannot see is where a value goes once an allowed
  module has it: `lib/agent-export` reads the sessions repository and the
  reflections, and the importers that render reflection components write
  sessions of their own; and that the trim's one caller is the drain is a
  reading of every call site. That is data flow, not an import. Held when
  declared (HF3), by reading each: `agent-export` gives reflections to
  `shareFiles` alone; `going.ts` reads the store for `reflectionsGoing` and
  `letGoHeldReflections` and nothing else; `practice.ts` reads it only for
  the lane's revision, its subscription and the sheet's count;
  `trimOffline` is called only in `letGoHeldReflections`, which only the
  Practice lane hands to `drainHome` as `letGoHeld`; and `sendReflections`
  is called only in `drainHome`.

### LA18: an ask for the next scene goes home through the drain alone, and the phone lets it go only once home holds it

Home keeps every ask (paulgsc/server `drama_prompt`, its `docs/identity.md`
invariant 31), one per stamp, append-only, and hands its stamp and markdown to
the Jobs mailbox's `prompt` folder, from which the reflections routine writes
the drama (owner, D2 on #2174). The scene notes an ask names go home as voice notes (LA13), so
the ask carries only their ids. The phone keeps every ask home does not hold,
with no limit, so it never refuses one for lack of a cap, and never replaces
one: an ask with a kept stamp is refused (`lib/scene-ask`). Of the newest ask
home holds it keeps only the stamp and time the screen names.

What is enforced by test: that an ask goes as its stamp and markdown, each
once, counts as home's only on an answer that holds it exactly as sent, and
leaves a bounded fingerprint in `sent.prompts`
(`lib/home-link/__tests__/prompts.test.ts`); that the drain puts them after
the reflections, remembers what home held and lets go only through its port,
even when home stops answering partway (`drain.test.ts`, "the drain's asks
for the next scene"); that the store keeps every ask home does not hold, lets
one go only once it is held and a newer one is kept, refuses one with a kept
stamp, and says where it is in the person's terms
(`lib/scene-ask/index.test.ts`); that topik names the
draft's notes by id, hands the ask over and says what the host says
(`generate-lesson/index.test.tsx`, `handheld-lesson/index.test.tsx`); and that
a scene note goes only once `prompted` and held (`lib/scene-voice`'s
`runtime.test.ts`). What no test can say is who calls the let-go:

- _Claim:_ an ask (`lib/scene-ask`'s `AskedPrompt`) reaches `file_host` only
  through the drain's prompts part (`sendPrompts` in
  `lib/home-link/prompts.ts`, through `sendWhole` in `leetype-log.ts`, one
  `PUT /routine/prompts/:stamp` of
  `{ stamp, text }` each, from `drainHome` alone); and an ask leaves the
  phone, and a scene note is marked `prompted`, only in
  `letGoHeldPrompts` (`lib/home-link/going.ts`), which `drainHome` calls
  through its `letGoHeldPrompts` port after that part, with the asks
  `heldPrompts` reads from what home answered (`sent.prompts`): it marks
  their notes `prompted` before it tells the store they are `held`, and the
  store (`afterHeld`, `afterAsk`) drops only asks marked held, never the
  newest, replaces none, and keeps of a held ask only its stamp and time.
- _Falsified by:_ a hunk to `lib/home-link/prompts.ts`, or to `sendWhole`
  or `heldBy` in `lib/home-link/leetype-log.ts`, that sends anything but an
  ask's stamp and text, sends one marked held, sends by another method or
  path, lets `held` hear one home's answer does not hold exactly as sent, or
  stores more than a bounded fingerprint in `sent.prompts`; a hunk to
  `lib/home-link/drain.ts` that calls `sendPrompts` or `letGoHeldPrompts`
  from anywhere else, passes `letGoHeldPrompts` anything but the run's own
  `sent`, or moves the call out of the `finally`; a hunk to `lib/home-link/going.ts` that has
  `letGoHeldPrompts` mark notes `prompted` or call `sceneAsks.held` with
  anything but `heldPrompts` over the store's own list and that `sent`, or
  tell the store before marking the notes; a hunk that calls
  `sceneAsks.held`, or a scene voice's `prompted`, anywhere but there; a
  hunk to `lib/scene-ask/index.ts` that lets `afterHeld` or `afterAsk` drop
  or replace an ask not marked held, or drop the newest, keeps more of a
  held ask than its stamp and time, gives the list a limit, or sends;
  or a hunk that passes an ask, or its text, to anything else that sends to
  `file_host` or to a share sheet.
- _Scope:_ `apps/www/src/lib/scene-ask/index.ts`,
  `apps/www/src/lib/home-link/prompts.ts`, `leetype-log.ts`, `drain.ts`, `going.ts`,
  `practice.ts`, `apps/www/src/lib/scene-voice/runtime.ts`,
  `apps/www/src/components/player/session-viewport.tsx`.
- _Why not enforced:_ each part above is held by its test, but that the
  let-go's one caller is the drain, and that nothing else hands an ask to a
  sender, is a reading of every call site: data flow, which a lint cannot
  see. Held when declared (HF4), by reading each: `sendPrompts` is called
  only in `drainHome`; `letGoHeldPrompts` only in `drainHome`'s `finally`,
  through the port `practice.ts` hands it; `sceneAsks.held` and
  `phoneSceneVoice().prompted` only in `letGoHeldPrompts`; `sceneAsks.ask`
  only through topik's `AskScene`, from the port `session-viewport.tsx`
  hands it on the phone; and `lib/scene-ask` imports nothing that sends.

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
  reflections (and, from the whole export, the soundbites, grammar-lens
  entries and takes, and LeetType answers and takes) stay on the phone, the
  share being a copy that releases nothing (LG1, HF1 #2176; HF5 #2180). The
  phone's Home server block syncs, pairs, unpairs and clears
  finished sessions home holds on a tap, and the study list's "Let it go"
  and the phone-full offer's "Remove it" copy their one session home before
  it leaves (LA8); a paired phone drains what it
  keeps to home on its own, since home is the owner's own store (LA15), and
  Korean reads the routine's files from it. The share sheet and the speech
  provider reach beyond home, and the share sheet's "arrived" is the
  receiver's copy, not home's (HF1, #2176).
- **The server's side.** What `file_host` stores and logs is
  `paulgsc/server` `docs/identity.md`.
