/**
 * A real origin, a real service worker, and a real push.
 *
 * `public/sw.js` is the only file in this app that nothing checks. It is a
 * plain `public/` asset: never bundled, never imported, never type-checked,
 * and not reachable from any unit test — it cannot even be `import`ed, since
 * it references `self.registration` and `self.clients` at module scope. A
 * typo in it ships, and the first sign is a study reminder that never
 * arrives, which is indistinguishable from the feature deciding to stay
 * quiet. That is the gap this harness closes.
 *
 * ## Why a throwaway HTTP server rather than the built app
 *
 * Service workers require a secure context. `http://127.0.0.1` qualifies by
 * the same explicit exception `http://localhost` does, so a two-route Node
 * server is a legitimate origin — no certificates, no `vite build`, no
 * container. The suite therefore tests `public/sw.js` **as shipped**, read
 * off disk, rather than a copy or a mock.
 *
 * ## Why CDP
 *
 * A push cannot be faked from the page: `showNotification` from a document is
 * a different code path, and dispatching a synthetic `PushEvent` would prove
 * only that a function can be called. `ServiceWorker.deliverPushMessage`
 * drives Chromium's own push plumbing, so what the handler receives is what a
 * real send from `file_host` would deliver — and `registration
 * .getNotifications()` reads back what the browser actually created, not what
 * a spy recorded.
 */

/* Service-worker globals used inside `worker.evaluate()` callbacks, which run
   in the worker rather than here. Declared for the type checker in
   service-worker-globals.d.ts; `no-undef` reads only this comment. */
/* global registration, clients, NotificationEvent */

import { readFileSync } from "node:fs"
import { createServer } from "node:http"
import type { Server } from "node:http"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import type { BrowserContext, Worker } from "@playwright/test"
import { expect } from "@playwright/test"

const HERE = dirname(fileURLToPath(import.meta.url))

/** The worker exactly as `public/` will serve it. */
const SERVICE_WORKER_SOURCE = readFileSync(
  resolve(HERE, "../../public/sw.js"),
  "utf8"
)

/** What the page half holds, read from source so the two cannot drift. */
export function nudgeTagFromClientSource(): string {
  const source = readFileSync(
    resolve(HERE, "../../src/lib/study-nudge/service-worker.ts"),
    "utf8"
  )
  const match = /const NUDGE_TAG = "([^"]+)"/.exec(source)
  if (!match) throw new Error("NUDGE_TAG not found in service-worker.ts")
  return match[1]
}

/** What a notification looks like once the browser has created it. */
type ShownNotification = {
  title: string
  body: string
  tag: string
  data: { url?: string } | null
  actions: Array<{ action: string; title: string }>
}

export type Harness = {
  origin: string
  /**
   * Re-resolved on every call rather than captured once.
   *
   * Chromium terminates an idle service worker and starts a fresh one to
   * handle the next event, which leaves a captured `Worker` handle pointing
   * at something that no longer exists — `evaluate` against it then returns
   * an empty result rather than an error, so the symptom is an assertion
   * that intermittently sees zero notifications. That was a real flake in
   * this file, about one run in six.
   */
  worker: () => Worker
  /** Deliver a push payload through Chromium's own plumbing. */
  push: (data: string | null) => Promise<void>
  /** What the browser is currently displaying for this registration. */
  notifications: () => Promise<Array<ShownNotification>>
  close: () => Promise<void>
}

type CdpRegistration = { registrationId: string; scopeURL: string }

function serveWorker(): Promise<{ server: Server; origin: string }> {
  const server = createServer((request, response) => {
    if (request.url?.startsWith("/sw.js")) {
      response.writeHead(200, { "Content-Type": "text/javascript" })
      response.end(SERVICE_WORKER_SOURCE)
      return
    }
    response.writeHead(200, { "Content-Type": "text/html" })
    response.end("<!doctype html><title>nudge harness</title><body></body>")
  })

  return new Promise((done) => {
    // Port 0: the OS picks a free one, so parallel runs and a developer's
    // own dev server cannot collide.
    server.listen(0, "127.0.0.1", () => {
      const address = server.address()
      const port = typeof address === "object" && address ? address.port : 0
      done({ server, origin: `http://127.0.0.1:${port}` })
    })
  })
}

export async function startNudgeHarness(
  context: BrowserContext
): Promise<Harness> {
  const { server, origin } = await serveWorker()

  // Without this the `push` handler's `showNotification` rejects, and the
  // failure would read as a broken worker rather than a missing grant.
  await context.grantPermissions(["notifications"], { origin })

  const page = await context.newPage()
  await page.goto(origin)

  const cdp = await context.newCDPSession(page)
  const registrations: Array<CdpRegistration> = []
  cdp.on(
    "ServiceWorker.workerRegistrationUpdated",
    (event: { registrations: Array<CdpRegistration> }) => {
      registrations.push(...event.registrations)
    }
  )
  await cdp.send("ServiceWorker.enable")

  await page.evaluate(async () => {
    await navigator.serviceWorker.register("/sw.js", { scope: "/" })
    await navigator.serviceWorker.ready
  })

  // `ready` resolves as soon as there is an *active* worker, which is a
  // weaker condition than the one a push needs: `sw.js` calls
  // `clients.claim()` on activate, and a push delivered while that is still
  // in flight is accepted by CDP and then dropped, with no error anywhere.
  // The symptom was this suite failing on a different random test about one
  // run in five. A non-null `controller` is the browser confirming the claim
  // finished.
  await page.evaluate(
    async () =>
      new Promise<void>((done) => {
        if (navigator.serviceWorker.controller) {
          done()
          return
        }
        navigator.serviceWorker.addEventListener("controllerchange", () =>
          done()
        )
      })
  )

  // The worker is what proves registration succeeded: a `sw.js` that throws
  // at the top level registers and then never activates, so an empty list
  // here is the syntax-error case.
  await expect
    .poll(() => context.serviceWorkers().length, {
      message: "sw.js never activated — check it for a top-level throw",
    })
    .toBeGreaterThan(0)

  const currentWorker = (): Worker => {
    const found = context
      .serviceWorkers()
      .find((candidate) => candidate.url().startsWith(origin))
    if (!found) throw new Error(`no service worker for ${origin}`)
    return found
  }

  const registration = registrations.find((entry) =>
    entry.scopeURL.startsWith(origin)
  )
  if (!registration) throw new Error(`no CDP registration for ${origin}`)

  /**
   * Read from the *page*, not the worker.
   *
   * `ServiceWorkerRegistration.getNotifications()` is available on both
   * sides and returns the same list, and the page outlives every worker
   * restart — so this cannot go stale the way a captured worker handle can.
   */
  const readNotifications = async (): Promise<Array<ShownNotification>> =>
    page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready
      const shown = await registration.getNotifications()
      return shown.map((notification) => ({
        title: notification.title,
        body: notification.body,
        tag: notification.tag,
        // `Notification.data` is `any` by specification — it is whatever
        // was passed to showNotification. The narrowing that matters is the
        // assertion in the spec, not a claim made here.
        data: notification.data,
        actions: [...notification.actions].map((action) => ({
          action: action.action,
          title: action.title,
        })),
      }))
    })

  const deliver = async (data: string | null): Promise<void> => {
    await cdp.send("ServiceWorker.deliverPushMessage", {
      origin,
      registrationId: registration.registrationId,
      // A push with no payload is a real case — some services send one as
      // a bare wakeup — and CDP models it as the empty string.
      data: data ?? "",
    })
  }

  const snapshot = async (): Promise<string> =>
    JSON.stringify(await readNotifications())

  /** Whether the notification state moved away from `before` in time. */
  const changedWithin = async (
    before: string,
    ms: number
  ): Promise<boolean> => {
    const deadline = Date.now() + ms
    while (Date.now() < deadline) {
      if ((await snapshot()) !== before) return true
      await new Promise((settle) => setTimeout(settle, 50))
    }
    return false
  }

  return {
    origin,
    worker: currentWorker,
    /**
     * Deliver, then confirm something actually changed — re-delivering if
     * not.
     *
     * `ServiceWorker.deliverPushMessage` resolves whether or not the worker
     * received anything. Roughly one delivery in fifty is accepted and then
     * silently dropped, which surfaced as this suite failing on a different
     * random test about one run in five. Nothing was wrong with `sw.js` in
     * any of those runs — the handler was never invoked.
     *
     * The retry is therefore compensating for the test transport, not for
     * the code under test, and it is deliberately narrow: it only ever
     * re-sends the *same* payload, and only until the notification state
     * moves. A handler that genuinely shows nothing still fails, after the
     * attempts are spent — which is exactly what the malformed-payload
     * tests are there to catch.
     */
    push: async (data): Promise<void> => {
      const before = await snapshot()
      for (let attempt = 0; attempt < 5; attempt += 1) {
        await deliver(data)
        if (await changedWithin(before, 1_000)) return
      }
    },
    notifications: readNotifications,
    close: async (): Promise<void> => {
      await context.close()
      await new Promise<void>((done) => server.close(() => done()))
    },
  }
}

/**
 * What a `notificationclick` did, without a real click.
 *
 * There is no CDP command that clicks a notification, so the event is
 * constructed and dispatched. Two things make that honest rather than
 * circular: the *handler* under test is the real one, unmodified, and the
 * notification it receives is one the browser genuinely created from a
 * delivered push. What is synthesised is the click itself.
 *
 * `waitUntil` has to be replaced because it throws on an event the user agent
 * is not currently dispatching. The replacement collects the promises so the
 * assertions can await the work the handler actually started.
 */
export async function clickNotification(
  worker: Worker,
  action: string
): Promise<{
  fetches: Array<{ method: string; url: string }>
  opened: Array<string>
}> {
  // Unqualified `registration` / `clients` / `NotificationEvent` below are
  // ServiceWorkerGlobalScope globals — this body runs inside the worker. See
  // service-worker-globals.d.ts for why they are declared rather than pulled
  // in with `lib: ["WebWorker"]`.
  return worker.evaluate(async (clickedAction: string) => {
    const probe: {
      fetches: Array<{ method: string; url: string }>
      opened: Array<string>
    } = { fetches: [], opened: [] }

    const realFetch = globalThis.fetch
    const realOpenWindow = clients.openWindow
    const realMatchAll = clients.matchAll

    Object.assign(globalThis, {
      fetch: (
        input: RequestInfo | URL,
        init?: RequestInit
      ): Promise<Response> => {
        probe.fetches.push({
          method: init?.method ?? "GET",
          url: String(input),
        })
        return Promise.resolve(new Response("{}", { status: 200 }))
      },
    })
    Object.assign(clients, {
      openWindow: (url: string): Promise<null> => {
        probe.opened.push(url)
        return Promise.resolve(null)
      },
      // No existing window, so the handler takes the openWindow branch. The
      // focus-an-existing-tab branch needs a second real page and would prove
      // something about Playwright rather than about the worker.
      matchAll: (): Promise<Array<never>> => Promise.resolve([]),
    })

    try {
      const [notification] = await registration.getNotifications()
      const pending: Array<Promise<unknown>> = []
      const event = new NotificationEvent("notificationclick", {
        notification,
        action: clickedAction,
      })
      // `waitUntil` throws on an event the user agent is not currently
      // dispatching, so it is replaced — and the replacement collects the
      // promises, which is what lets the assertions await the work the
      // handler actually started rather than racing it.
      Object.defineProperty(event, "waitUntil", {
        value: (work: Promise<unknown>): number => pending.push(work),
      })

      dispatchEvent(event)
      await Promise.all(pending)
      return probe
    } finally {
      Object.assign(globalThis, { fetch: realFetch })
      Object.assign(clients, {
        openWindow: realOpenWindow,
        matchAll: realMatchAll,
      })
    }
  }, action)
}
