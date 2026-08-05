# Study nudges

The app reminds you to come back when a session is prepared and you have not
studied today.

## What is here

```
apps/www/public/sw.js                            service worker
apps/www/src/lib/study-nudge/index.ts            the client decision (pure, tested)
apps/www/src/lib/study-nudge/service-worker.ts   registration, display, subscription + consent
apps/www/src/lib/study-nudge/signals.ts          telling the server what happened
apps/www/src/lib/study-nudge/use-study-nudge.ts  the client trigger
apps/www/src/lib/file-host-config/               where the backend is, and how to reach it
apps/www/src/lib/tenant/http-sessions-repository.ts
apps/www/src/components/settings/study-nudge-section.tsx
```

The split is the point. `index.ts` decides _whether now is a good time_ and
knows nothing about browsers; `service-worker.ts` knows about browsers and
decides nothing; `use-study-nudge.ts` asks the question on a schedule.

## The two halves do different things

This is the part most worth getting straight, because the names are similar
and the mechanisms are not.

**Here**, `decideNudge` is a predicate over the current clock: given the
sessions, the hour, and when the last nudge went out, may we interrupt? It
stays silent, in this order of precedence, when reminders are off; the app is
on screen; it is quiet hours; a session is running; anything was started or
completed today; nothing is prepared; or a nudge went out less than
`minHoursBetweenNudges` ago. Otherwise it names one session — paused first
(unfinished work with momentum), then scheduled, then draft, ties broken by
most recently updated.

**There**, `file_host` keeps an _engagement level_ per subject: a vector that
decays with time and is restored by signals. It intervenes when the weighted
aggregate falls to a threshold, and the most depleted class picks what to say.
There is no cron, and no port of `decideNudge` — that existed on an earlier
branch of the server work and was deleted with it.

So the client policy is a **fallback for a build with no backend, not a
mirror**. There is no shared decision table any more and there should not be:
the two answer different questions, and a JSON fixture asserting they agree
would be asserting something untrue.

## Two deployments, one at a time

`DATA_MODE` decides which, and it decides four things at once:

|                        | `"static"` (GitHub Pages) | `"server"` (dev, preview, Docker)                              |
| ---------------------- | ------------------------- | -------------------------------------------------------------- |
| Sessions               | `localStorage`            | `file_host`                                                    |
| What paces reminders   | `decideNudge` on a timer  | engagement decay + a threshold                                 |
| Notification raised by | `use-study-nudge.ts`      | Web Push from `file_host`                                      |
| Works with no tab open | no                        | **yes** — the point of all this                                |
| Quiet hours            | editable                  | read-only; the server reads its own from `NUDGE_QUIET_HOURS_*` |

Running both triggers at once would not produce "occasionally two"
notifications — it would produce reliably two whenever both concluded it was
time, from two pacing mechanisms that cannot see each other. So the client
trigger stands down in server mode. It keeps registering the worker and
reconciling the push subscription; it just stops raising.

## Signals are where the work originates

`lib/study-nudge/signals.ts` posts to `POST /api/v1/signals` when a session
transitions. **This is not telemetry.** A subject that has never sent a signal
has no row in the engagement ledger, is never returned by the waker's query,
and is never notified — not late, never. Without this module the rest of the
server half is inert.

Four of the domain's seven signals are emitted, because they are the four a
session record can honestly justify:

| Transition    | Signal                                         |
| ------------- | ---------------------------------------------- |
| created       | `session-provisioned`                          |
| → `active`    | `session-started`                              |
| → `completed` | `session-completed` (score = completion ratio) |
| → `paused`    | `session-abandoned` (with elapsed ms)          |

`scored-below-target`, `curriculum-updated` and `app-updated` belong to
grading and the content pipeline; inventing them from session data would put a
number the server trusts on a guess.

Two decisions worth keeping:

- **Emitted from the mutation hooks, not the repository.** Only the hooks see
  the record before _and_ after, and only a change of status is a behaviour.
  From the repository, renaming a running session would report "they sat down"
  again and quietly inflate engagement.
- **Fire-and-forget.** A signal that does not arrive costs accuracy in when a
  reminder lands. A signal that blocks a mutation costs someone the ability to
  start studying because a LAN box is down. Bulk status changes report nothing
  at all — marking six drafts as scheduled is housekeeping, not six people
  sitting down.

## Consent is a precondition, not a preference

A subscription carries the topics it may deliver, in the same request that
creates it. An empty topic list is honoured as "receives nothing" rather than
read as "receives everything", and there is no server path that stores a
subscription without a grant.

`GET /api/v1/push/vapid-key` returns the topics on offer beside the key, so
the settings checklist renders what the sender will actually honour rather
than a list maintained separately here. The grant is kept in
`NudgePreferences.pushTopics` — a consent record in preference clothing —
because re-subscribing is how consent is _changed_ (the upsert is keyed on
endpoint) and because the page has to re-assert it when a subscription is
replaced.

`sw.js` handles `pushsubscriptionchange` by retiring the dropped endpoint and
**stopping there**. Re-subscribing from a worker would mean either inventing a
topic list — a consent nobody gave — or sending an empty one, which the server
correctly reads as silence and which would present as reminders mysteriously
stopping. The page finishes the job on the next load.

"Later" on a notification is dismiss-only, and stays that way. There is no
cooldown stamp to postpone: pacing is engagement decay, and a dismissal is not
one of the signals that moves it. Nothing is lost by dismissing.

## Reaching `file_host`

The study origin is necessarily HTTPS (service workers require a secure
context) and `file_host` serves plain HTTP on 3000, so a direct
`http://nixos.local:3000` fetch is **mixed content** — blocked by the browser
before the request is made, and therefore not fixable by any server-side CORS
change. It presents as a rejected promise and a console warning, which reads
exactly like the server being down.

The remedy is the one `lib/tts-config` already uses: a same-origin
`/api/file-host/` path, proxied in three places that have to stay in step —

- `apps/www/src/lib/file-host-config` (`FILE_HOST_PROXY_PATH`)
- `apps/www/vite.config.ts` (`vite dev` and `vite preview`)
- `apps/www/nginx.https.conf` (the container)

`VITE_FILE_HOST_ENDPOINT` overrides it for a deployment that fronts
`file_host` somewhere else. One caveat: `public/sw.js` rebuilds the path from
`self.registration.scope` and cannot see that variable, so under an override
its one request 404s — costing a stale row the server prunes anyway.

## Sessions moved, and what moved with them

In server mode the repositories talk to `/api/v1/sessions`. Two behaviours are
the server's now, because two implementations of them would drift: **id
generation** (`session-<uuid>`) and **`totalDurationOf(scenes)`** — a client
that sends a stale zero produces a notification offering a "~1 min" session.

Sessions already in a browser are uploaded once, on first run against the
server, and the local store is **marked rather than deleted**. Progress is
recorded per session, so an interrupted run resumes instead of duplicating.
A migrated session keeps everything the policy reads and gets a new id.

There is no conflict resolution. **Last write wins** — one browser at a time
is the assumption, written down rather than silently relied on.

## Known gaps

- **Preferences are one-way.** Quiet hours and the cooldown live in
  `UserSettings` here and in environment variables there. Server mode shows
  the controls read-only rather than letting them silently disagree; an
  endpoint to write them is the follow-up.
- **The settings status line is a local reading.** It runs `decideNudge`,
  which is not what the server runs, so it cannot report engagement or when
  the server will next intervene. It is labelled as this browser's own view.
- **`NUDGE_TAG` has three copies** — `sw.js`, `service-worker.ts`, and
  `nudge::payload` in `paulgsc/server` — none of which can import from
  another. A mismatch shows up as notifications stacking rather than
  replacing.
- **No multi-device coordination.** The server fans out to every subscription
  a subject consented on; dismissing on a laptop does not silence a phone.
- **No accounts or auth.** Everything is keyed by subject server-side, but the
  subject is a singleton until auth lands — so anyone who can reach the LAN
  can register a subscription or read sessions.

## Secure context

Service workers, `Notification`, and `PushManager` all require a secure
context. `http://localhost` qualifies; `http://nixos.local` and
`http://192.168.x.x` do not. The HTTPS dev setup already in `vite.config.ts`
(the `certs/nixos.local+3.pem` pair) covers this — without it the settings
section renders an explanation instead of the toggle.
