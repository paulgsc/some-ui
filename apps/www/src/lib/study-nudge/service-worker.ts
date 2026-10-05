/**
 * The browser side of the study nudge: registering the worker, holding the
 * notification permission, raising a notification, and remembering when the
 * last one went out. Everything impure lives here so `./index` stays pure.
 *
 * Every entry point is a no-op that resolves falsy where the API is missing
 * (jsdom, SSR, an insecure origin, Firefox private browsing) rather than
 * throwing: a missing notification is a degraded feature, a thrown one a
 * broken app.
 *
 * `registration.showNotification`, not `new Notification()`: a
 * page-constructed notification dies with its page (a click after the tab
 * closes does nothing), and push has to show through the worker anyway.
 */

import type { FileHostTransport } from "@/lib/file-host-config/client"
import {
  createFileHostTransport,
  FileHostNotConfiguredError,
  requestJSON,
} from "@/lib/file-host-config/client"

import type { NudgeDecision } from "./index"

/** Kept in step by hand with public/sw.js (a public/ asset that cannot
 * import from src/) and `nudge::payload` in paulgsc/server; a mismatch shows
 * up as notifications stacking rather than replacing. */
const NUDGE_TAG = "some-ui.study-nudge"

/**
 * Runtime state, not preference, so not in `UserSettings`: the cooldown is a
 * fact about this browser, where quiet hours are about the person.
 */
const LAST_NUDGE_KEY = "some-ui.study-nudge.last-shown.v1"

/**
 * `Notification` is absent in jsdom and on insecure origins; `serviceWorker`
 * in the same places plus Firefox's private windows. The feature needs both.
 */
export function nudgesSupported(): boolean {
  // The Android app has neither API, and native local notifications instead
  // (`./native`).
  if (import.meta.env.VITE_DEVICE_BACKEND === "true") return true
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "Notification" in window &&
    "PushManager" in window
  )
}

/**
 * The Android app's notification permission, as last read from the OS.
 * Android's answer is asynchronous and this module's is not, so `./native`
 * writes it here whenever it asks, and `useStudyNudge` asks on mount.
 */
let nativePermission: NotificationPermission = "default"

export function setNativeNudgePermission(
  permission: NotificationPermission
): void {
  nativePermission = permission
}

export function nudgePermission(): NotificationPermission {
  if (import.meta.env.VITE_DEVICE_BACKEND === "true") return nativePermission
  if (!nudgesSupported()) return "denied"
  return Notification.permission
}

/**
 * Must be called from a user gesture. Browsers ignore (and Chrome
 * permanently blocks) a prompt a click didn't ask for, so the settings
 * toggle is the only caller.
 */
export async function requestNudgePermission(): Promise<NotificationPermission> {
  if (import.meta.env.VITE_DEVICE_BACKEND === "true") {
    const { requestNativePermission } = await import("./native")
    return requestNativePermission().catch(
      (): NotificationPermission => "denied"
    )
  }
  if (!nudgesSupported()) return "denied"
  try {
    return await Notification.requestPermission()
  } catch {
    return "denied"
  }
}

let registration: Promise<ServiceWorkerRegistration | null> | null = null

/**
 * Memoised so callers await one registration. The scope is `BASE_URL`, not
 * `/`: the Pages build serves from a subpath (vite.config.ts's `base`), and a
 * worker's default scope is the directory it was served from.
 */
export async function registerNudgeWorker(): Promise<ServiceWorkerRegistration | null> {
  // Nothing on the device needs a worker: no push, and the OS schedules.
  if (import.meta.env.VITE_DEVICE_BACKEND === "true" || !nudgesSupported())
    return null
  registration ??= navigator.serviceWorker
    .register(`${import.meta.env.BASE_URL}sw.js`, {
      scope: import.meta.env.BASE_URL,
    })
    .catch(() => null)
  return registration
}

/**
 * Raise the notification a `decideNudge` result asked for. Returns whether
 * one was shown, so the caller only starts the cooldown for a nudge that
 * reached someone.
 */
export async function showNudge(
  decision: Extract<NudgeDecision, { kind: "nudge" }>
): Promise<boolean> {
  if (nudgePermission() !== "granted") return false

  const active = await registerNudgeWorker()
  if (!active) return false

  try {
    await active.showNotification(decision.title, {
      body: decision.body,
      tag: NUDGE_TAG,
      icon: `${import.meta.env.BASE_URL}logo192.png`,
      badge: `${import.meta.env.BASE_URL}favicon.svg`,
      data: {
        url: `${import.meta.env.BASE_URL}sessions/${decision.sessionId}`,
      },
    })
    return true
  } catch {
    return false
  }
}

/**
 * The settings page's "Send a test": `showNudge`, except on the device, whose
 * notifications are native (`./native`). The poll tick keeps `showNudge`, so
 * on the device it shows nothing: the OS delivers the one scheduled nudge.
 */
export async function showTestNudge(
  decision: Extract<NudgeDecision, { kind: "nudge" }>
): Promise<boolean> {
  if (import.meta.env.VITE_DEVICE_BACKEND !== "true") return showNudge(decision)
  const { showNativeTestNudge } = await import("./native")
  return showNativeTestNudge(decision).catch(() => false)
}

export function readLastNudgeAt(): string | null {
  if (typeof window === "undefined") return null
  try {
    return window.localStorage.getItem(LAST_NUDGE_KEY)
  } catch {
    return null
  }
}

export function recordNudgeShown(at: Date): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(LAST_NUDGE_KEY, at.toISOString())
  } catch {
    // A refused write (private mode, quota) costs a cooldown, not the feature.
  }
}

/* ────────────────────────────────────────────────────────────────────────
 * Web Push: `pushManager.subscribe()`, and telling `file_host` the address.
 *
 * Consent is a precondition, not a preference: a subscription carries the
 * topics the person agreed to in the same request that creates it, and an
 * empty list means "receives nothing". So `subscribeToPush` takes topics with
 * no default. The topics on offer come from `GET /push/vapid-key` with the
 * key, so the UI renders what the sender will honour.
 *
 * A missing or unconfigured backend costs the closed-browser case, not the
 * feature: `useStudyNudge` still polls.
 * ──────────────────────────────────────────────────────────────────────── */

/** How a subscribe attempt ended, named so the settings UI can say which. */
export type PushSubscribeOutcome =
  | "subscribed"
  /** No `PushManager`/`serviceWorker` — insecure origin, jsdom, SSR. */
  | "unsupported"
  /** Notification permission is not granted, so `subscribe()` cannot run. */
  | "denied"
  /** `file_host` answered 503 `feature_not_configured` — no VAPID identity. */
  | "not-configured"
  /** `file_host` did not answer at all. */
  | "unreachable"

/**
 * The slice of `PushSubscription` and `PushManager` this layer touches.
 * Structural so a test can supply a fake without a cast, while a real
 * `ServiceWorkerRegistration` still satisfies it.
 */
type PushSubscriptionLike = {
  endpoint: string
  /** The only way to reach `keys.p256dh`/`keys.auth`; see `postSubscription`. */
  toJSON: () => object
  unsubscribe: () => Promise<boolean>
}

type PushRegistrationLike = {
  pushManager: {
    getSubscription: () => Promise<PushSubscriptionLike | null>
    subscribe: (
      options: PushSubscriptionOptionsInit
    ) => Promise<PushSubscriptionLike>
  }
}

type PushDeps = {
  /** Injected by tests; defaults to the real `file_host` transport. */
  transport?: FileHostTransport | null
  /** Injected by tests; defaults to the memoised registration. */
  registration?: PushRegistrationLike | null
}

type SubscribeDeps = PushDeps & {
  /** What they agreed to hear about. Required: never guessed here. */
  topics: ReadonlyArray<string>
}

/** `topics` is optional: an older `file_host` answers with the key alone,
 * and reading that as "no topics on offer" is right. */
type VapidKeyResponse = { public_key: string; topics?: Array<string> }

/**
 * What this deployment can be subscribed to, and the key to subscribe with,
 * from one request: offering a topic the sender does not honour would ask
 * for a consent it cannot keep.
 */
type PushOffer = {
  applicationServerKey: Uint8Array<ArrayBuffer>
  topics: Array<string>
}

/**
 * base64url → `Uint8Array`, because `applicationServerKey` will not take the
 * string the server sends: `-_` back to `+/`, and the stripped padding.
 *
 * Getting it wrong fails silently: `subscribe()` succeeds, the row lands, and
 * every send returns `201` (accepted, not decryptable). Hence a test.
 */
export function urlBase64ToUint8Array(
  base64url: string
): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64url.length % 4)) % 4)
  const base64 = (base64url + padding).replace(/-/g, "+").replace(/_/g, "/")
  const raw = atob(base64)
  // An explicit ArrayBuffer: `BufferSource` excludes a view over a
  // `SharedArrayBuffer`, which `new Uint8Array(n)`'s type admits.
  const bytes = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i)
  return bytes
}

/** An uncompressed P-256 point: `0x04` and two 32-byte coordinates. */
const VAPID_KEY_BYTES = 65

function defaultTransport(deps: PushDeps): FileHostTransport | null {
  return deps.transport === undefined
    ? createFileHostTransport("reporting")
    : deps.transport
}

async function resolveRegistration(
  deps: PushDeps
): Promise<PushRegistrationLike | null> {
  return deps.registration === undefined
    ? registerNudgeWorker()
    : deps.registration
}

/**
 * Fetched rather than baked in: a key that disagrees with the server's makes
 * every send `403` silently, and rotating it should not need a redeploy.
 */
async function fetchPushOffer(
  transport: FileHostTransport
): Promise<PushOffer> {
  const { public_key: publicKey, topics } = await requestJSON<VapidKeyResponse>(
    transport,
    "/push/vapid-key"
  )

  const applicationServerKey = urlBase64ToUint8Array(publicKey)
  if (applicationServerKey.byteLength !== VAPID_KEY_BYTES) {
    // A malformed key makes a subscription that never delivers, and the row
    // outlives the mistake.
    throw new Error(
      `file_host returned a ${applicationServerKey.byteLength}-byte VAPID key; expected ${VAPID_KEY_BYTES}`
    )
  }
  return { applicationServerKey, topics: topics ?? [] }
}

/**
 * The topics this deployment offers, or `[]` with no backend or no push
 * identity (shown as "cannot notify you with the browser closed").
 */
export async function fetchPushTopics(
  deps: PushDeps = {}
): Promise<Array<string>> {
  const transport = defaultTransport(deps)
  if (!transport) return []
  try {
    return (await fetchPushOffer(transport)).topics
  } catch {
    return []
  }
}

function outcomeOf(error: unknown): PushSubscribeOutcome {
  return error instanceof FileHostNotConfiguredError
    ? "not-configured"
    : "unreachable"
}

/**
 * Register a subscription and the consent that permits sending to it.
 *
 * The upsert is keyed on endpoint, so re-running with a different topic list
 * is how consent is changed. An empty `topics` is passed through: it is a
 * real answer the server honours as silence.
 */
export async function subscribeToPush(
  deps: SubscribeDeps
): Promise<PushSubscribeOutcome> {
  if (!nudgesSupported()) return "unsupported"
  if (nudgePermission() !== "granted") return "denied"

  const transport = defaultTransport(deps)
  if (!transport) return "unreachable"

  const active = await resolveRegistration(deps)
  if (!active) return "unsupported"

  try {
    const { applicationServerKey } = await fetchPushOffer(transport)

    // Reuse an existing subscription: re-subscribing would churn the
    // endpoint, and the POST below is an upsert.
    const subscription =
      (await active.pushManager.getSubscription()) ??
      (await active.pushManager.subscribe({
        // Chrome refuses a subscription without it, with an unhelpful error.
        userVisibleOnly: true,
        applicationServerKey,
      }))

    await postSubscription(transport, subscription, deps.topics)
    return "subscribed"
  } catch (error) {
    return outcomeOf(error)
  }
}

/**
 * One request, so the server never holds a subscription without a grant.
 *
 * `toJSON()` carries `keys.p256dh` and `keys.auth`: spreading a live
 * `PushSubscription` yields no own enumerable properties.
 */
async function postSubscription(
  transport: FileHostTransport,
  subscription: PushSubscriptionLike,
  topics: ReadonlyArray<string>
): Promise<void> {
  await requestJSON<{ endpoint: string; topics: Array<string> }>(
    transport,
    "/push/subscriptions",
    {
      method: "POST",
      body: JSON.stringify({ ...subscription.toJSON(), topics }),
    }
  )
}

/**
 * Turn reminders off at both ends. The server call is attempted even if the
 * local `unsubscribe()` fails: a stale row is the half that keeps notifying.
 */
export async function unsubscribeFromPush(deps: PushDeps = {}): Promise<void> {
  if (!nudgesSupported()) return

  const active = await resolveRegistration(deps)
  const subscription = await active?.pushManager.getSubscription()
  if (!subscription) return

  const { endpoint } = subscription

  try {
    await subscription.unsubscribe()
  } catch {
    // Keep going: the row is the part that matters.
  }

  const transport = defaultTransport(deps)
  if (!transport) return

  try {
    await requestJSON(transport, "/push/subscriptions", {
      method: "DELETE",
      body: JSON.stringify({ endpoint }),
    })
  } catch {
    // The server prunes the row on its next 410; throwing would leave the
    // settings toggle stuck on.
  }
}

/**
 * Asked of the browser, not stored settings: a subscription can vanish
 * without the app being told (storage pressure, a permission reset).
 */
export async function hasPushSubscription(
  deps: PushDeps = {}
): Promise<boolean> {
  if (!nudgesSupported()) return false
  const active = await resolveRegistration(deps)
  return (await active?.pushManager.getSubscription()) != null
}

/**
 * Re-register on load, for the subscription the server may have pruned on a
 * `410`. The POST is an idempotent upsert, so re-posting is both the check
 * and the repair.
 *
 * Also finishes a `pushsubscriptionchange`: the worker retires the dropped
 * endpoint but cannot read the consent (topics) a new one must carry.
 */
export async function reconcilePushSubscription(
  deps: SubscribeDeps
): Promise<PushSubscribeOutcome | "none"> {
  if (!nudgesSupported()) return "unsupported"

  const active = await resolveRegistration(deps)
  const subscription = await active?.pushManager.getSubscription()
  if (!subscription) return "none"

  const transport = defaultTransport(deps)
  if (!transport) return "unreachable"

  try {
    await postSubscription(transport, subscription, deps.topics)
    return "subscribed"
  } catch (error) {
    return outcomeOf(error)
  }
}

/**
 * Release this browser's push subscription **without sending anything**, for
 * when the learner's data stops being the account's. Unlike
 * `unsubscribeFromPush`, no request is made and no worker registered; the
 * server prunes its row on the push service's next `410`.
 */
export async function dropLocalPushSubscription(): Promise<void> {
  if (import.meta.env.VITE_DEVICE_BACKEND === "true" || !nudgesSupported())
    return
  try {
    const registration = await navigator.serviceWorker.getRegistration()
    const subscription = await registration?.pushManager.getSubscription()
    await subscription?.unsubscribe()
  } catch {
    // Nothing to drop, or the browser refused. Either way no request leaves.
  }
}
