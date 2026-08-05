/**
 * The browser side of the study nudge: registering the worker, holding the
 * notification permission, raising a notification, and remembering when the
 * last one went out.
 *
 * Everything impure lives here so `./index` can stay a pure decision
 * function. Every entry point below is a no-op that resolves falsy in an
 * environment without the API — jsdom, SSR, an insecure origin, Firefox
 * private browsing — rather than throwing, because a missing notification
 * is a degraded feature and a thrown one is a broken app.
 *
 * ## Why `registration.showNotification` and not `new Notification()`
 *
 * The page could construct a `Notification` directly and skip the worker
 * entirely, and for the "your tab is still open" case it would look
 * identical. It is the wrong seam twice over. A page-constructed
 * notification dies with its page, so a click seconds after the tab closes
 * does nothing; and it is a dead end — the moment the server can push, the
 * notification has to come from the worker anyway. Going through the
 * registration from day one means the display path is already the one push
 * will use, and only the *trigger* changes.
 */

import type { FileHostTransport } from "../file-host-config/client"
import {
  createFileHostTransport,
  FileHostNotConfiguredError,
  requestJSON,
} from "../file-host-config/client"
import type { NudgeDecision } from "./index"

/** Kept in step by hand with the same constant in public/sw.js — that file
 * is a plain public/ asset and cannot import from src/. A third copy lives
 * in `nudge::payload` in paulgsc/server; a mismatch shows up as
 * notifications stacking rather than replacing. */
const NUDGE_TAG = "some-ui.study-nudge"

/**
 * Runtime state, not preference, so it is deliberately not in
 * `UserSettings`: the cooldown is a fact about this browser (this is the
 * browser that got interrupted), where the quiet-hours window is a
 * statement about the person and belongs with the settings that will
 * eventually sync.
 */
const LAST_NUDGE_KEY = "some-ui.study-nudge.last-shown.v1"

/**
 * `Notification` is absent in jsdom and on insecure origins;
 * `serviceWorker` is absent in the same places plus Firefox's private
 * windows. Both are checked because the feature needs both, and a caller
 * that has to remember to check two things will eventually check one.
 */
export function nudgesSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "Notification" in window &&
    "PushManager" in window
  )
}

export function nudgePermission(): NotificationPermission {
  if (!nudgesSupported()) return "denied"
  return Notification.permission
}

/**
 * Must be called from a user gesture. Browsers ignore — and Chrome
 * permanently blocks — a permission prompt that a click didn't ask for, so
 * the settings toggle is the only caller and should stay that way.
 */
export async function requestNudgePermission(): Promise<NotificationPermission> {
  if (!nudgesSupported()) return "denied"
  try {
    return await Notification.requestPermission()
  } catch {
    return "denied"
  }
}

let registration: Promise<ServiceWorkerRegistration | null> | null = null

/**
 * Registering twice is harmless (the browser dedupes by script URL), but
 * the promise is memoised anyway so that callers can await "the
 * registration" rather than each holding their own.
 *
 * The scope is `BASE_URL`, not `/`: the Pages build serves this app from a
 * subpath (see vite.config.ts's `base`), and a worker's default scope is
 * the directory it was served from. Passing it explicitly makes the
 * subpath deployment work with no special case, and asserts the intended
 * scope on the root deployment instead of inheriting it.
 */
export async function registerNudgeWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!nudgesSupported()) return null
  registration ??= navigator.serviceWorker
    .register(`${import.meta.env.BASE_URL}sw.js`, {
      scope: import.meta.env.BASE_URL,
    })
    .catch(() => null)
  return registration
}

/**
 * Raise the notification a `decideNudge` result asked for. Returns whether
 * one was actually shown, so the caller only starts the cooldown for a
 * nudge that reached someone.
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
    // A browser refusing to write (private mode, quota) costs a cooldown,
    // not the feature. Failing loudly here would break the nudge over a
    // stamp it can live without.
  }
}

/* ────────────────────────────────────────────────────────────────────────
 * Web Push
 *
 * #907 installed `sw.js`'s `push` handler and stopped there, on purpose:
 * the handler had to be deployed and claimed *before* anything could send
 * to it, because a push arriving at a worker with no `push` listener is
 * dropped. This is the other end — `pushManager.subscribe()`, and telling
 * `file_host` the address it produced. Without it the server can encrypt
 * and VAPID-sign a notification and has nobody to send it to.
 *
 * ## Consent is a precondition, not a preference
 *
 * A subscription now carries the topics the person agreed to, in the same
 * request that creates it — `file_host` has no path that stores one
 * without a grant, and an empty topic list is honoured as "receives
 * nothing" rather than read as "receives everything". So `subscribeToPush`
 * takes topics and there is no default: a person who has never been asked
 * is a person who is never notified, which is the only defensible position
 * for a channel that reaches a locked screen.
 *
 * The topics on offer come from `GET /push/vapid-key` alongside the key,
 * so the settings UI renders what the sender will actually honour rather
 * than a list maintained separately here.
 *
 * Everything below degrades to #907's behaviour rather than failing. A
 * missing or unconfigured backend must cost the closed-browser case, not
 * the feature: `useStudyNudge` still polls, and in static mode it is the
 * only policy there is.
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * How a subscribe attempt ended. Named rather than boolean for the same
 * reason `NudgeSilentReason` is: the settings UI has to be able to say
 * which of these happened, and "the toggle went back off" is not an
 * explanation.
 */
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
 *
 * Structural rather than the DOM types on purpose: a real
 * `ServiceWorkerRegistration` satisfies these, and a test can supply a fake
 * without reconstructing `permissionState`, `expirationTime`, `getKey` and
 * the rest of an interface none of this code reads. The alternative is a
 * cast per fake, which is how a test ends up asserting against a shape the
 * production code never sees.
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
  /**
   * What they agreed to hear about. No default, and not optional: the one
   * value that must never be guessed here is this one.
   */
  topics: ReadonlyArray<string>
}

/** `topics` is optional: a `file_host` older than the consent work answers
 * with the key alone, and reading that as "no topics on offer" is right. */
type VapidKeyResponse = { public_key: string; topics?: Array<string> }

/**
 * What this deployment can be subscribed to, and the key to subscribe with.
 *
 * Both come from one request because they answer one question — what can
 * this server actually send me — and a settings page that offered a topic
 * the sender does not honour would be asking for a consent it cannot keep.
 */
export type PushOffer = {
  applicationServerKey: Uint8Array<ArrayBuffer>
  topics: Array<string>
}

/**
 * base64url → `Uint8Array`, because `applicationServerKey` will not take
 * the string the server sends.
 *
 * This is the classic silent breakage in every Web Push integration and it
 * is worth being blunt about why: get it wrong and `subscribe()` still
 * succeeds, the row still lands in `push_subscriptions`, and every send
 * afterwards returns `201 Created` from the push service — which means
 * "accepted", not "delivered", and certainly not "decryptable". The
 * failure is a notification that never arrives, with a success status in
 * every log. Hence a test.
 *
 * Two conversions, both easy to skip: base64url's `-_` alphabet back to
 * base64's `+/`, and the padding the server strips.
 */
export function urlBase64ToUint8Array(
  base64url: string
): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64url.length % 4)) % 4)
  const base64 = (base64url + padding).replace(/-/g, "+").replace(/_/g, "/")
  const raw = atob(base64)
  // Backed by an explicit ArrayBuffer, not the default `ArrayBufferLike`:
  // `applicationServerKey` is a `BufferSource`, which excludes a view over
  // a `SharedArrayBuffer`, and the plain `new Uint8Array(n)` overload is
  // wide enough to include one.
  const bytes = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i)
  return bytes
}

/** An uncompressed P-256 point: `0x04` and two 32-byte coordinates. */
const VAPID_KEY_BYTES = 65

function defaultTransport(deps: PushDeps): FileHostTransport | null {
  return deps.transport === undefined
    ? createFileHostTransport()
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
 * Fetch the key rather than baking it in.
 *
 * `applicationServerKey` is baked into every subscription made with it, so
 * a key that disagrees with the server's does not fail loudly — it makes
 * every send return `403` into a log nobody reads, on a feature that is
 * supposed to be quiet most of the time. `GET /push/vapid-key` exists so
 * that rotating the key is not a frontend redeploy.
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
    // Refuse here rather than subscribing with it. A malformed key produces
    // a subscription that looks fine and never delivers, and the row
    // outlives the mistake.
    throw new Error(
      `file_host returned a ${applicationServerKey.byteLength}-byte VAPID key; expected ${VAPID_KEY_BYTES}`
    )
  }
  return { applicationServerKey, topics: topics ?? [] }
}

/**
 * The topics this deployment offers, for the settings UI to render.
 *
 * Returns `[]` when there is no backend or it has no push identity — which
 * the caller shows as "this build cannot notify you with the browser
 * closed" rather than as an empty checklist.
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

/** Translate the ways this can fail into the outcomes above. */
function outcomeOf(error: unknown): PushSubscribeOutcome {
  return error instanceof FileHostNotConfiguredError
    ? "not-configured"
    : "unreachable"
}

/**
 * Register a subscription and the consent that permits sending to it.
 *
 * The browser's `PushSubscription` goes over as-is, flattened alongside
 * `topics`, because the server takes exactly that shape on purpose so that
 * there is no mapping layer here to get wrong. The upsert is keyed on
 * endpoint, so calling this twice does not produce two rows — and calling
 * it again with a different topic list is how consent is *changed*, which
 * is why the settings checklist re-runs it rather than doing anything of
 * its own.
 *
 * An empty `topics` is passed through rather than rejected. It is a real
 * answer — "reminders on, nothing I want to hear about" — and the server
 * honours it as silence; short-circuiting it here would leave the stored
 * grant disagreeing with the checkboxes on screen.
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

    // An existing subscription is reused rather than replaced: it may have
    // been made with this same key, and unsubscribing to re-subscribe would
    // churn the endpoint for nothing. The POST below is an upsert, so
    // re-registering a subscription the server already has is free.
    const subscription =
      (await active.pushManager.getSubscription()) ??
      (await active.pushManager.subscribe({
        // Non-negotiable: Chrome refuses a subscription without it, and
        // the promise it rejects with says nothing useful.
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
 * `{ ...subscription, topics }` — one request, because a subscription
 * without a grant is not a state the server should be able to hold, even
 * briefly.
 *
 * `toJSON()` is what carries `keys.p256dh` and `keys.auth`: spreading a
 * live `PushSubscription` yields an object with no own enumerable
 * properties, so the naive `{ ...subscription, topics }` posts a body with
 * nothing in it but the topic list. That failure is a `422` naming
 * `keys.p256dh`, which at least says so — but only after a subscribe that
 * looked like it worked.
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
 * Turn reminders off at both ends.
 *
 * Dropping only the local subscription would leave the server sending to a
 * live endpoint, and dropping only the row would leave the browser holding
 * one — so both happen, and the server call is attempted even if the local
 * `unsubscribe()` fails, because a stale row is the half that keeps
 * notifying someone who asked it to stop.
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
    // The browser will stop showing them either way once the local
    // subscription is gone; a row the server prunes on its next 410 is a
    // tolerable leftover, and throwing here would leave the settings
    // toggle stuck on.
  }
}

/**
 * What this browser currently believes, asked of the browser rather than
 * of stored settings.
 *
 * A subscription can vanish without the app being told — storage pressure,
 * a permission reset, or the person revoking it in browser settings. A UI
 * that reads only `preferences.enabled` then claims reminders are on for a
 * browser that will never receive one, which is the failure mode this
 * feature can least afford.
 */
export async function hasPushSubscription(
  deps: PushDeps = {}
): Promise<boolean> {
  if (!nudgesSupported()) return false
  const active = await resolveRegistration(deps)
  return (await active?.pushManager.getSubscription()) != null
}

/**
 * Re-register on load, for the subscription the server may have lost.
 *
 * The server prunes a row on `410 Gone` from the push service, which is
 * the correct thing for it to do and leaves the browser holding a
 * subscription nothing will ever send to. There is no endpoint to ask
 * "do you have mine?", and there does not need to be: the POST is an
 * idempotent upsert, so re-posting what we hold is both the check and the
 * repair.
 *
 * This is also where a `pushsubscriptionchange` is finished. That handler
 * retires the dropped endpoint and stops, because a worker has no access
 * to the consent a new subscription would have to carry; the topics live
 * in settings, which only the page can read.
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
