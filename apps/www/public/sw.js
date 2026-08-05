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
 * 2. `push` — display a notification the server sent. Nothing sends one
 *    yet. The Rust side has no VAPID keypair, no subscription store, and no
 *    scheduler (docs/study-nudge.md lists what that would take). The
 *    handler ships anyway because it is the half that has to already be
 *    installed and claimed *before* the server half can be turned on: a
 *    push that arrives at a browser whose worker has no `push` listener is
 *    dropped, and a worker update only lands on the visit after the one
 *    that fetched it. Writing it now means the server work is a server-only
 *    change.
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
 * this file is plain public/ asset JS and cannot import from src/. */
const NUDGE_TAG = "some-ui.study-nudge"

/** Dismiss-only action id; see the notificationclick handler. */
const DISMISS_ACTION = "later"

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

  // "Later" is dismiss-only on purpose. Postponing properly means writing a
  // new cooldown stamp, and the stamp lives in localStorage, which a worker
  // cannot reach. The spacing a person actually feels is already enforced:
  // minHoursBetweenNudges is measured from when a nudge was *shown*, not
  // from when it was answered, so dismissing costs nothing and the next
  // nudge is a full cooldown away regardless.
  if (event.action === DISMISS_ACTION) return

  const url = event.notification.data?.url || self.registration.scope
  event.waitUntil(openStudySession(url))
})
