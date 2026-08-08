/**
 * The study-nudge service worker.
 *
 * Registered by src/lib/study-nudge/service-worker.ts. It has two jobs, and
 * deliberately not a third:
 *
 * 1. `notificationclick` — put a click on a nudge back into the app. This
 *    is the whole reason a *service* worker is needed rather than a bare
 *    `new Notification()` from the page: the click has to still work after
 *    the tab that raised it is gone, and only a service worker outlives its
 *    page.
 *
 * 2. `push` — display a notification the server sent. `file_host` now sends
 *    them: it holds the VAPID identity, the subscription store, and the
 *    daily tick. That handler shipped before anything could send one, which
 *    is what made the server work a server-only change — a push arriving at
 *    a browser whose worker has no `push` listener is dropped, and a worker
 *    update only lands on the visit after the one that fetched it.
 *
 * 3. `pushsubscriptionchange` — retire the address the browser just
 *    dropped. Deliberately *not* re-subscribing; see that handler.
 *
 * The third one is the same "ship it before it is needed" bet as the
 * second: the worker a person is running is always the one from their
 * previous visit, so anything the server will come to rely on has to be
 * here a deploy early.
 *
 * There is deliberately **no `fetch` handler**. A service worker that
 * registers none is bypassed for navigations altogether, so this file
 * cannot quietly become an offline cache serving a stale index.html — the
 * standard way an SPA ends up wedged behind its own worker, and a much
 * worse bug than the one this file exists to fix.
 */

/** Shared by the page and the push payload so a second nudge replaces the
 * first in the notification centre rather than stacking under it. Kept in
 * step by hand with NUDGE_TAG in src/lib/study-nudge/service-worker.ts —
 * this file is plain public/ asset JS and cannot import from src/ — and
 * with `nudge::payload::NUDGE_TAG` in paulgsc/server. Three copies, two
 * repositories; a mismatch shows up as notifications stacking. */
const NUDGE_TAG = "some-ui.study-nudge"

/** The "Later" action id; see the notificationclick handler. */
const DISMISS_ACTION = "later"

/**
 * Where `file_host` is, from inside a worker that cannot import
 * src/lib/file-host-config.
 *
 * **Derived from `self.registration.scope`, not injected at build time.**
 * Both were available and this is the smaller coupling: the path below is
 * origin-absolute, so resolving it against the scope yields this origin's
 * proxy route whatever subpath the app is served from, with no build step
 * and no worker URL that changes when a deployment does. It is the same
 * hand-maintained-constant problem NUDGE_TAG has, one file over.
 *
 * The one case it does not cover, stated rather than left to be found: a
 * deployment setting `VITE_FILE_HOST_ENDPOINT` to front `file_host`
 * somewhere else has no way to tell the worker, so the one request below
 * 404s there. It costs a stale row that the server prunes on its next
 * `410` anyway. Everything else keeps working, because the page resolves
 * its own base URL and does not use this one.
 *
 * Kept in step by hand with FILE_HOST_PROXY_PATH in
 * src/lib/file-host-config, the `location` blocks in nginx.https.conf, and
 * the `server.proxy` entry in vite.config.ts.
 */
const FILE_HOST_PROXY_PATH = "/api/file-host/api/v1"

function fileHostUrl(route) {
  return new URL(`${FILE_HOST_PROXY_PATH}${route}`, self.registration.scope)
    .href
}

// Take over as soon as this version is installed instead of idling in
// `waiting` until every tab using the previous worker closes. A stale
// worker here means missed notifications, not a stale asset, so there is
// nothing to be careful about — and with no fetch handler there is no
// half-updated cache for the swap to tear.
self.addEventListener("install", () => {
  void self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim())
})

/**
 * Push payloads are JSON: `{ title, body, url, tag }`. Anything malformed
 * (or a push with no payload at all, which some services send as a wakeup)
 * still has to produce a notification: a `push` event that resolves without
 * showing one is reported to the user agent as a broken worker, and Chrome
 * will eventually revoke the subscription for it.
 */
function readPushPayload(event) {
  const fallback = {
    title: "Time to study",
    body: "Your session is ready.",
    url: self.registration.scope,
    tag: NUDGE_TAG,
  }
  if (!event.data) return fallback
  try {
    const parsed = event.data.json()
    return {
      title: parsed.title || fallback.title,
      body: parsed.body || fallback.body,
      url: parsed.url || fallback.url,
      tag: parsed.tag || fallback.tag,
    }
  } catch {
    return fallback
  }
}

self.addEventListener("push", (event) => {
  const payload = readPushPayload(event)
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      tag: payload.tag,
      icon: new URL("logo192.png", self.registration.scope).href,
      badge: new URL("favicon.svg", self.registration.scope).href,
      data: { url: payload.url },
      actions: [
        { action: "start", title: "Start now" },
        { action: DISMISS_ACTION, title: "Later" },
      ],
    })
  )
})

/**
 * The browser can drop a subscription without asking: storage pressure, a
 * permission reset, or its own key rotation. This event is how it says so.
 *
 * **It retires the old address and stops there.** Re-subscribing from here
 * looks like the obvious thing and is the one move this handler must not
 * make: a subscription now carries the topics the person consented to, and
 * a worker has no access to those. It would have to either invent a topic
 * list — a consent nobody gave — or send an empty one, which the server
 * correctly honours as "receives nothing" and which would present as
 * reminders silently stopping. Neither is better than waiting.
 *
 * So the page does it. `reconcilePushSubscription` re-subscribes on the
 * next load with the topics held in settings, which is the only place the
 * grant actually lives.
 *
 * The `catch` is not decoration: a `pushsubscriptionchange` that rejects is
 * reported to the user agent as a broken worker, and Chrome revokes the
 * subscription over repeated failures — which would turn a transient
 * network error into the exact outcome this handler exists to repair.
 */
async function retireSubscription(event) {
  // Chrome fires this event bare; Firefox hands over the old subscription.
  // Without it there is no endpoint to name and nothing to do — the server
  // prunes the row on its next `410` from the push service anyway.
  const previous = event.oldSubscription
  if (!previous) return

  await fetch(fileHostUrl("/push/subscriptions"), {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: previous.endpoint }),
  })
}

self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(retireSubscription(event).catch(() => undefined))
})

/**
 * Focus a tab already on this origin rather than opening a second one — the
 * dashboard is typically already open somewhere, and a nudge that spawns a
 * duplicate tab every time adds friction instead of removing it.
 */
async function openStudySession(url) {
  const target = new URL(url, self.registration.scope)
  const windows = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  })

  for (const client of windows) {
    if (new URL(client.url).origin !== target.origin) continue
    await client.focus()
    // `navigate` is unavailable on a client this worker doesn't control
    // (an uncontrolled tab loaded before the worker claimed it). Focusing
    // it is still the right outcome; landing on the exact session is the
    // part that degrades.
    if ("navigate" in client) await client.navigate(target.href)
    return
  }

  await self.clients.openWindow(target.href)
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close()

  // "Later" is dismiss-only, and stays that way. The reason has changed
  // even though the behaviour has not, so it is worth restating rather
  // than leaving the old note about localStorage: there is no cooldown
  // stamp to postpone any more. What paces interventions server-side is an
  // engagement level that decays with time and is restored by *signals* —
  // sitting down, finishing, abandoning — and a dismissal is none of
  // those. The domain has no vocabulary for "not now", deliberately: an
  // endpoint that let a button suppress the engine would be a second,
  // weaker policy sitting on top of the real one.
  //
  // Nothing is lost by dismissing. Interventions are gated on a decayed
  // aggregate crossing a threshold and on the server's own re-arm, not on
  // whether the last one was acknowledged.
  if (event.action === DISMISS_ACTION) return

  // "Start now" and a click on the notification body are the same thing:
  // put the person in the session.
  const url = event.notification.data?.url || self.registration.scope
  event.waitUntil(openStudySession(url))
})
