/**
 * @vitest-environment jsdom
 *
 * The push half of `service-worker.ts`, against a fake `PushManager` and a
 * mocked transport: the key conversion, the idempotent upsert, unsubscribe
 * reaching both ends, and a `503` degrading rather than throwing.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { FileHostTransport } from "@/lib/file-host-config/client"
import {
  hasPushSubscription,
  reconcilePushSubscription,
  subscribeToPush,
  unsubscribeFromPush,
  urlBase64ToUint8Array,
} from "@/lib/study-nudge/service-worker"

/** A real Firefox VAPID public key: 65 bytes, base64url, unpadded. */
const VAPID_KEY =
  "BLMbF9ffKBiWQLCKvTHb6LO8Nb6dcUh6TItC455vu2kElga6PQvUmaFyCdykxY2nOSSL3yKgfbmFLRTUaGv4yV8"

const ENDPOINT = "https://updates.push.services.mozilla.com/wpush/v2/abc"
const P256DH = "BLMbF9ffKBiWQLCKvTHb6LO8Nb6dcUh6TItC455vu2k"
const AUTH = "xS03Fi5ErfTNH_l9WHE9Ig"

/** What the toggle grants when nobody opens the topic list. */
const TOPICS = ["lesson-ready"]

type Call = { route: string; init?: RequestInit }

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

/** A transport that records what it was asked for and answers per route. */
function mockTransport(
  answers: Partial<Record<string, () => Response>> = {}
): FileHostTransport & { calls: Array<Call> } {
  const calls: Array<Call> = []
  const transport = (route: string, init?: RequestInit): Promise<Response> => {
    calls.push({ route, init })
    const answer = answers[route]
    if (answer) return Promise.resolve(answer())
    if (route === "/push/vapid-key") {
      return Promise.resolve(
        jsonResponse({ public_key: VAPID_KEY, topics: ["lesson-ready"] })
      )
    }
    return Promise.resolve(jsonResponse({ endpoint: ENDPOINT }))
  }
  return Object.assign(transport, { calls })
}

/** A transport whose every request fails to connect. */
function failingTransport(): FileHostTransport & { calls: Array<Call> } {
  return Object.assign(() => Promise.reject(new Error("Failed to fetch")), {
    calls: [],
  })
}

/** Only what the push layer reads (`PushDeps` is structural, so no cast). */
type FakeSubscription = {
  endpoint: string
  unsubscribed: boolean
  toJSON: () => object
  unsubscribe: () => Promise<boolean>
}

function fakeSubscription(): FakeSubscription {
  const subscription: FakeSubscription = {
    endpoint: ENDPOINT,
    unsubscribed: false,
    toJSON: (): object => ({
      endpoint: ENDPOINT,
      keys: { p256dh: P256DH, auth: AUTH },
    }),
    unsubscribe: (): Promise<boolean> => {
      subscription.unsubscribed = true
      return Promise.resolve(true)
    },
  }
  return subscription
}

/** A registration whose `pushManager` mints a subscription on
 * `subscribe()`, recording the options (and so the key) it was handed. */
type FakeRegistration = {
  pushManager: {
    getSubscription: () => Promise<FakeSubscription | null>
    subscribe: (
      options: PushSubscriptionOptionsInit
    ) => Promise<FakeSubscription>
  }
}

function fakeRegistration(existing: FakeSubscription | null = null): {
  registration: FakeRegistration
  subscribeCalls: Array<PushSubscriptionOptionsInit>
} {
  let current = existing
  const subscribeCalls: Array<PushSubscriptionOptionsInit> = []

  const registration: FakeRegistration = {
    pushManager: {
      getSubscription: (): Promise<FakeSubscription | null> =>
        Promise.resolve(current),
      subscribe: (
        options: PushSubscriptionOptionsInit
      ): Promise<FakeSubscription> => {
        subscribeCalls.push(options)
        current = fakeSubscription()
        return Promise.resolve(current)
      },
    },
  }

  return { registration, subscribeCalls }
}

/** `nudgesSupported()` checks `window`, which some Vitest versions keep
 * apart from `globalThis` (vitest.setup.ts), so both are stubbed. */
function supportNudges(permission: NotificationPermission = "granted"): void {
  const values = {
    Notification: {
      permission,
      requestPermission: (): NotificationPermission => permission,
    },
    PushManager: function PushManager(): void {},
  }
  for (const [name, value] of Object.entries(values)) {
    vi.stubGlobal(name, value)
    if (!Object.is(window, globalThis)) {
      Object.defineProperty(window, name, {
        value,
        writable: true,
        configurable: true,
      })
    }
  }
  Object.defineProperty(navigator, "serviceWorker", {
    value: {},
    writable: true,
    configurable: true,
  })
}

beforeEach(() => {
  supportNudges()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("urlBase64ToUint8Array", () => {
  it("decodes an unpadded base64url VAPID key to 65 bytes", () => {
    const key = urlBase64ToUint8Array(VAPID_KEY)

    expect(key).toBeInstanceOf(Uint8Array)
    // An uncompressed P-256 point: 0x04 then two 32-byte coordinates.
    expect(key.byteLength).toBe(65)
    expect(key[0]).toBe(0x04)
  })

  it("translates the base64url alphabet rather than passing it through", () => {
    // `-` and `_` are the characters plain atob() rejects.
    expect(Array.from(urlBase64ToUint8Array("-_8"))).toEqual([251, 255])
  })

  it("restores stripped padding", () => {
    expect(Array.from(urlBase64ToUint8Array("AQ"))).toEqual([1])
    expect(Array.from(urlBase64ToUint8Array("AQI"))).toEqual([1, 2])
    expect(Array.from(urlBase64ToUint8Array("AQID"))).toEqual([1, 2, 3])
  })
})

describe("subscribeToPush", () => {
  it("fetches the VAPID key, subscribes with the decoded bytes, and posts the result", async () => {
    const transport = mockTransport()
    const { registration, subscribeCalls } = fakeRegistration()

    const outcome = await subscribeToPush({
      transport,
      registration,
      topics: TOPICS,
    })

    expect(outcome).toBe("subscribed")

    // Fetched, never baked in: a key change must not need a redeploy.
    expect(transport.calls[0].route).toBe("/push/vapid-key")

    const key = subscribeCalls[0].applicationServerKey
    expect(key).toBeInstanceOf(Uint8Array)
    expect(subscribeCalls[0].userVisibleOnly).toBe(true)

    const post = transport.calls[1]
    expect(post.route).toBe("/push/subscriptions")
    expect(post.init?.method).toBe("POST")
    // The browser's `toJSON()` shape plus the grant: spreading a live
    // PushSubscription would lose `keys`.
    expect(JSON.parse(String(post.init?.body))).toEqual({
      endpoint: ENDPOINT,
      keys: { p256dh: P256DH, auth: AUTH },
      topics: TOPICS,
    })
  })

  it("reuses an existing subscription instead of churning the endpoint", async () => {
    const transport = mockTransport()
    const { registration, subscribeCalls } =
      fakeRegistration(fakeSubscription())

    expect(
      await subscribeToPush({ transport, registration, topics: TOPICS })
    ).toBe("subscribed")

    // No second subscribe(), and one upsert keyed on endpoint.
    expect(subscribeCalls).toHaveLength(0)
    expect(
      transport.calls.filter((c) => c.route === "/push/subscriptions")
    ).toHaveLength(1)
  })

  it("degrades to the tab-open policy when the deployment has no VAPID identity", async () => {
    const transport = mockTransport({
      "/push/vapid-key": () =>
        jsonResponse({ error: { code: "feature_not_configured" } }, 503),
    })
    const { registration, subscribeCalls } = fakeRegistration()

    expect(
      await subscribeToPush({ transport, registration, topics: TOPICS })
    ).toBe("not-configured")
    expect(subscribeCalls).toHaveLength(0)
  })

  it("reports an unreachable file_host rather than throwing", async () => {
    const transport = failingTransport()
    const { registration } = fakeRegistration()

    expect(
      await subscribeToPush({ transport, registration, topics: TOPICS })
    ).toBe("unreachable")
  })

  it("refuses a VAPID key that is not a P-256 point", async () => {
    // A malformed key subscribes happily and never delivers.
    const transport = mockTransport({
      "/push/vapid-key": () => jsonResponse({ public_key: "AQID", topics: [] }),
    })
    const { registration, subscribeCalls } = fakeRegistration()

    expect(
      await subscribeToPush({ transport, registration, topics: TOPICS })
    ).toBe("unreachable")
    expect(subscribeCalls).toHaveLength(0)
  })

  it("does not subscribe without notification permission", async () => {
    supportNudges("default")
    const transport = mockTransport()
    const { registration } = fakeRegistration()

    expect(
      await subscribeToPush({ transport, registration, topics: TOPICS })
    ).toBe("denied")
    expect(transport.calls).toHaveLength(0)
  })
})

describe("unsubscribeFromPush", () => {
  it("drops the local subscription and the server's row", async () => {
    const subscription = fakeSubscription()
    const transport = mockTransport()
    const { registration } = fakeRegistration(subscription)

    await unsubscribeFromPush({ transport, registration })

    expect(subscription.unsubscribed).toBe(true)

    const call = transport.calls.at(-1)
    expect(call?.route).toBe("/push/subscriptions")
    expect(call?.init?.method).toBe("DELETE")
    expect(JSON.parse(String(call?.init?.body))).toEqual({
      endpoint: ENDPOINT,
    })
  })

  it("is a no-op when there was no subscription", async () => {
    const transport = mockTransport()
    const { registration } = fakeRegistration(null)

    await unsubscribeFromPush({ transport, registration })

    expect(transport.calls).toHaveLength(0)
  })

  it("still leaves reminders off when the server cannot be told", async () => {
    const subscription = fakeSubscription()
    const transport = failingTransport()
    const { registration } = fakeRegistration(subscription)

    await expect(
      unsubscribeFromPush({ transport, registration })
    ).resolves.toBeUndefined()
    expect(subscription.unsubscribed).toBe(true)
  })
})

describe("reconcilePushSubscription", () => {
  it("re-posts a subscription the server may have pruned", async () => {
    const transport = mockTransport()
    const { registration } = fakeRegistration(fakeSubscription())

    expect(
      await reconcilePushSubscription({
        transport,
        registration,
        topics: TOPICS,
      })
    ).toBe("subscribed")
    expect(transport.calls[0].route).toBe("/push/subscriptions")
  })

  it("says so when the browser holds none, rather than subscribing uninvited", async () => {
    const transport = mockTransport()
    const { registration } = fakeRegistration(null)

    expect(
      await reconcilePushSubscription({
        transport,
        registration,
        topics: TOPICS,
      })
    ).toBe("none")
    expect(transport.calls).toHaveLength(0)
  })
})

describe("hasPushSubscription", () => {
  it("reports what the browser holds, not what settings claim", async () => {
    const { registration } = fakeRegistration(null)
    expect(await hasPushSubscription({ registration })).toBe(false)

    const live = fakeRegistration(fakeSubscription())
    expect(await hasPushSubscription({ registration: live.registration })).toBe(
      true
    )
  })
})
