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

import type { NudgeDecision } from "./index"

/** Kept in step by hand with the same constant in public/sw.js — that file
 * is a plain public/ asset and cannot import from src/. */
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
