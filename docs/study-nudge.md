# Study nudges

The app reminds you to come back when a session is prepared and you have not
studied today.

## What is here

```
apps/www/public/sw.js                            service worker
apps/www/src/lib/study-nudge/index.ts            the decision (pure, tested)
apps/www/src/lib/study-nudge/service-worker.ts   registration, display, push subscription
apps/www/src/lib/study-nudge/use-study-nudge.ts  the client trigger
apps/www/src/lib/study-nudge/fixtures/           the table shared with paulgsc/server
apps/www/src/lib/file-host-config/               where the backend is, and how to reach it
apps/www/src/lib/tenant/http-sessions-repository.ts
apps/www/src/components/settings/study-nudge-section.tsx
```

The split is the point. `index.ts` decides _whether now is a good time_ and
knows nothing about browsers; `service-worker.ts` knows about browsers and
decides nothing; `use-study-nudge.ts` asks the question on a schedule.

## The rules

`decideNudge` stays silent, in this order of precedence, when: reminders are
off; the app is on screen; it is quiet hours; a session is running; anything
was started or completed today (local time); nothing is prepared; or a nudge
went out less than `minHoursBetweenNudges` ago.

Otherwise it names one session — a paused one first (unfinished work with
momentum), then scheduled, then draft, ties broken by most recently updated.

The server runs the same rules, ported, plus two of its own (`snoozed`,
`already-nudged-today`) inserted immediately before `cooling-down` so the
client's relative order survives intact.

## Two deployments, two policies, one at a time

`DATA_MODE` decides which, and it decides three things at once — where
sessions live, who raises notifications, and whether quiet hours are editable:

|                        | `"static"` (GitHub Pages) | `"server"` (dev, preview, Docker)                              |
| ---------------------- | ------------------------- | -------------------------------------------------------------- |
| Sessions               | `localStorage`            | `file_host`                                                    |
| Decision runs          | in the browser            | on the server (and locally, for the settings status line)      |
| Notification raised by | `use-study-nudge.ts`      | Web Push from `file_host`                                      |
| Works with no tab open | no                        | **yes** — the point of all this                                |
| Quiet hours            | editable                  | read-only; the server reads its own from `NUDGE_QUIET_HOURS_*` |

Running both triggers at once would not produce "occasionally two"
notifications — it would produce reliably two on any day that earns one, from
two cooldowns that cannot see each other (`localStorage` here, `nudge_log`
there). So the client trigger stands down in server mode. It keeps registering
the worker and reconciling the push subscription; it just stops raising.

The client policy does not go away and should not: on Pages it is the only
policy there is.

## Reaching `file_host`

The study origin is necessarily HTTPS (service workers require a secure
context) and `file_host` serves plain HTTP on 3000, so a direct
`http://nixos.local:3000` fetch is **mixed content** — blocked by the browser
before the request is made, and therefore not fixable by any server-side CORS
change. It presents as a rejected promise and a console warning, which reads
exactly like the server being down.

The remedy is the one `lib/tts-config` already uses: a same-origin
`/api/file-host/` path, proxied to the backend in three places that have to
stay in step —

- `apps/www/src/lib/file-host-config` (`FILE_HOST_PROXY_PATH`)
- `apps/www/vite.config.ts` (`vite dev` and `vite preview`)
- `apps/www/nginx.https.conf` (the container)

`VITE_FILE_HOST_ENDPOINT` overrides it for a deployment that fronts
`file_host` somewhere else. One caveat: `public/sw.js` rebuilds the path from
`self.registration.scope` and cannot see that variable, so under an override
the notification's "Later" falls back to dismiss-only.

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

## The shared decision table

`src/lib/study-nudge/fixtures/study-nudge-cases.json` is vendored from
`paulgsc/server`, which is its canonical home, and run by both repositories'
suites. Two implementations of one rule set drift; the only question is which
changes first and how long before anyone notices, and "nobody noticed" is the
normal outcome for a feature whose failure mode is silence.

`pnpm --filter www check:fixture` fetches the upstream copy and fails on a
mismatch. It skips on a network failure — a blip is not evidence of drift —
and tries `main` before the branch the server half is still on.

The suite pins itself to `TZ=UTC` and asserts it took, because several shared
cases turn on the local hour and a run in another zone would disagree for
reasons that have nothing to do with the rules.

If a case disagrees, the resolution is deciding which implementation is right
and updating both — not editing the expectation until it is green.

## Known gaps

- **Preferences are one-way.** Quiet hours and the cooldown live in
  `UserSettings` here and in environment variables there. Server mode shows
  the controls read-only rather than letting them silently disagree; an
  endpoint to write them is the follow-up.
- **No endpoint exposes the server's current decision**, so the settings
  status line is this browser's own reading of the same rules. It cannot see
  the server's cooldown or an active snooze.
- **`NUDGE_TAG` has three copies** — `sw.js`, `service-worker.ts`, and
  `nudge::payload` in `paulgsc/server` — none of which can import from
  another. A mismatch shows up as notifications stacking rather than
  replacing.
- **No multi-device coordination.** The server fans out to every
  subscription; dismissing on a laptop does not silence a phone.
- **No accounts or auth.** Anyone who can reach the LAN can register a
  subscription or read sessions. That is `file_host`'s existing trust model,
  accepted knowingly.

## Secure context

Service workers, `Notification`, and `PushManager` all require a secure
context. `http://localhost` qualifies; `http://nixos.local` and
`http://192.168.x.x` do not. The HTTPS dev setup already in `vite.config.ts`
(the `certs/nixos.local+3.pem` pair) covers this — without it the settings
section renders an explanation instead of the toggle.
