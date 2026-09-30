/**
 * Study nudges on the Android app, as native local notifications.
 *
 * An Android WebView has neither the web `Notification` API nor push, so
 * neither delivery path the web builds use exists there. What the OS does
 * have is a scheduler that fires with the app closed - which is the whole
 * point of a nudge. So the device hands it one notification at a time:
 *
 * - **leaving the screen** - `nextNudge` (the policy, stepped forward) picks
 *   the moment, and it is scheduled;
 * - **coming back** - if that moment has passed, the notification was
 *   shown, and its time becomes the cooldown `decideNudge` reads (the same
 *   `localStorage` stamp the web builds write); then whatever is still
 *   pending is cancelled, since sessions or preferences may be about to
 *   change.
 *
 * One notification id, so a reschedule replaces rather than stacks.
 *
 * Only ever imported dynamically, and only by the device build: the plugin
 * is native, and the web builds have no business loading it.
 */
import { LocalNotifications } from "@capacitor/local-notifications"

import type { ScheduledNudge } from "./schedule"
import { recordNudgeShown, setNativeNudgePermission } from "./service-worker"

const NUDGE_ID = 1001
/** When the pending nudge is due, so a return can tell it was shown. */
const SCHEDULED_KEY = "some-ui.study-nudge.native-scheduled-at.v1"

function toWebPermission(state: string): NotificationPermission {
  if (state === "granted") return "granted"
  if (state === "denied") return "denied"
  return "default"
}

export async function refreshNativePermission(): Promise<NotificationPermission> {
  const { display } = await LocalNotifications.checkPermissions()
  const permission = toWebPermission(display)
  setNativeNudgePermission(permission)
  return permission
}

/** From the settings toggle, which is the gesture Android's prompt wants. */
export async function requestNativePermission(): Promise<NotificationPermission> {
  const { display } = await LocalNotifications.requestPermissions()
  const permission = toWebPermission(display)
  setNativeNudgePermission(permission)
  return permission
}

function readScheduledAt(): string | null {
  try {
    return window.localStorage.getItem(SCHEDULED_KEY)
  } catch {
    return null
  }
}

function writeScheduledAt(at: Date | null): void {
  try {
    if (at === null) window.localStorage.removeItem(SCHEDULED_KEY)
    else window.localStorage.setItem(SCHEDULED_KEY, at.toISOString())
  } catch {
    // Loses one cooldown at worst; see `recordNudgeShown`.
  }
}

/** Replaces whatever is pending with `next`, or just clears it for `null`. */
export async function scheduleNativeNudge(
  next: ScheduledNudge | null
): Promise<void> {
  await LocalNotifications.cancel({ notifications: [{ id: NUDGE_ID }] })
  writeScheduledAt(null)
  if (next === null) return
  if ((await refreshNativePermission()) !== "granted") return
  await LocalNotifications.schedule({
    notifications: [
      {
        id: NUDGE_ID,
        title: next.decision.title,
        body: next.decision.body,
        schedule: { at: next.at },
        // Inexact on purpose. The plugin defaults to exact (since 8.3.0), and
        // on Android 12+ an app without exact-alarm access then gets the
        // "Alarms & reminders" settings screen opened on every schedule().
        // A study nudge minutes late is fine, and the APK does not ask for
        // SCHEDULE_EXACT_ALARM (apps/mobile AndroidManifest.xml).
        isExactNotification: false,
        extra: { url: `/sessions/${next.decision.sessionId}` },
      },
    ],
  })
  writeScheduledAt(next.at)
}

/**
 * On the way back to the screen: stamp the cooldown for a nudge whose time
 * came, and cancel one whose time has not.
 */
export async function reconcileNativeNudge(now: Date): Promise<void> {
  const scheduledAt = readScheduledAt()
  if (scheduledAt !== null) {
    const due = new Date(scheduledAt)
    if (!Number.isNaN(due.getTime()) && due <= now) recordNudgeShown(due)
  }
  await scheduleNativeNudge(null)
}

let tapListening = false

/** A tapped nudge opens the session it named. Installed once. */
export function listenForNudgeTaps(): void {
  if (tapListening) return
  tapListening = true
  void LocalNotifications.addListener(
    "localNotificationActionPerformed",
    ({ notification }) => {
      const extra: unknown = notification.extra
      const url =
        typeof extra === "object" &&
        extra !== null &&
        "url" in extra &&
        typeof extra.url === "string"
          ? extra.url
          : null
      // A full navigation, not a router push: this can arrive before the
      // router has mounted, on a cold start from the notification itself.
      if (url !== null) window.location.assign(url)
    }
  )
}
