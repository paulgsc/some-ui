# Study nudges

The app reminds you to come back when a session is prepared and you have not
studied today.

## What is here

```
apps/www/public/sw.js                        service worker
apps/www/src/lib/study-nudge/index.ts        the decision (pure, tested)
apps/www/src/lib/study-nudge/service-worker.ts   registration + display
apps/www/src/lib/study-nudge/use-study-nudge.ts  the trigger
apps/www/src/components/settings/study-nudge-section.tsx
```

The split is the point. `index.ts` decides _whether now is a good time_ and
knows nothing about browsers; `service-worker.ts` knows about browsers and
decides nothing; `use-study-nudge.ts` is the only thing that asks the
question on a schedule, and it is the only file the server half will
replace.

## The rules

`decideNudge` stays silent, in this order of precedence, when: reminders are
off; the app is on screen; it is quiet hours; a session is running; anything
was started or completed today (local time); nothing is prepared; or a nudge
went out less than `minHoursBetweenNudges` ago.

Otherwise it names one session — a paused one first (unfinished work with
momentum), then scheduled, then draft, ties broken by most recently updated.

## What is deliberately not here

**Notifications with no tab open.** This is the whole reason for the
`Service` in service worker, and it is not wired up. Today the trigger is a
five-minute timer in the page (`use-study-nudge.ts`), so reminders stop when
the last tab closes. Backgrounded tabs are fine.

The remaining work is entirely server-side, and `public/sw.js` already has
the `push` and `notificationclick` handlers it needs — that file ships now
precisely so the rest is a server-only change. A push arriving at a browser
whose worker has no `push` listener is dropped, and a worker update only
takes effect on the visit _after_ the one that fetched it, so the client
half had to land first regardless.

To finish it, in `paulgsc/server`:

1. **VAPID keypair.** One per deployment, public key served to the client,
   private key held by the sender.
2. **Subscription store.** `POST /api/v1/push/subscriptions` taking the
   `PushSubscription` JSON the browser hands back from
   `registration.pushManager.subscribe({ applicationServerKey })`, into a
   table in the axum service's sqlite. Endpoints expire; a 404/410 from the
   push service means delete the row.
3. **Sender.** An HTTPS POST to the endpoint in each subscription, payload
   encrypted per RFC 8291 and signed per RFC 8292. The `web-push` crate does
   both.
4. **The decision, server-side.** `decideNudge`'s rules are the spec, but the
   inputs it reads (`sessions`, `lastNudgeAt`) live in `localStorage` today.
   That is the real dependency: the nudge cannot move server-side before the
   session records do, which is the `lib/tenant/*` repositories migrating off
   `localStorage` onto the axum service. Until then the client is the only
   thing that knows whether you studied.

Step 4 is the load-bearing one, and it is why this landed client-first: the
policy is written as a pure function over session records precisely so it can
be ported to the orchestrator unchanged once the records are somewhere it can
read them.

## Secure context

Service workers, `Notification`, and `PushManager` all require a secure
context. `http://localhost` qualifies; `http://nixos.local` and
`http://192.168.x.x` do not. The HTTPS dev setup already in `vite.config.ts`
(the `certs/nixos.local+3.pem` pair) covers this — without it the settings
section renders an explanation instead of the toggle.
