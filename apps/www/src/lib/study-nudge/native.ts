/**
 * Study nudges on the Android app, as native local notifications.
 *
 * A WebView has no web `Notification` API and no push, but the OS scheduler
 * fires with the app closed, so the device hands it one notification at a
 * time:
 *
 * - **leaving the screen**: `nextNudge` picks the moment and it is scheduled;
 * - **coming back**: if that moment passed and the OS no longer holds it as
 *   pending, it was shown, and its time becomes the cooldown `decideNudge`
 *   reads (an inexact alarm can still be pending after its time). Whatever is
 *   still pending is then cancelled.
 *
 * One notification id, so a reschedule replaces rather than stacks; the
 * settings test has its own. A nudge's one button, **Not today: say why**,
 * opens the soundbites page listening (`?say=reminder`), when the reason is
 * freshest.
 *
 * Only ever imported dynamically, and only by the device build.
 */
import { LocalNotifications } from "@capacitor/local-notifications"

import { hasAudience } from "@/lib/build-profile"

import type { NudgeDecision } from "./index"
import type { ScheduledNudge } from "./schedule"
import { recordNudgeShown, setNativeNudgePermission } from "./service-worker"

const NUDGE_ID = 1001
const TEST_NUDGE_ID = 1002
/** When the pending nudge is due, so a return can tell it was shown. */
const SCHEDULED_KEY = "some-ui.study-nudge.native-scheduled-at.v1"
/** The nudge's action group, and its one action. */
const NUDGE_ACTIONS = "study-nudge"
const NOT_TODAY = "not-today"
/** Where "Not today" goes: the soundbites page, listening on arrival. */
const NOT_TODAY_URL = "/soundbites?say=reminder"

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

/**
 * Declares the "Not today" button (only where the soundbites page exists,
 * "apk"). The plugin keeps action groups across launches; repeating it per
 * schedule costs nothing.
 */
async function nudgeActionTypeId(): Promise<string | undefined> {
  if (!hasAudience("apk")) return undefined
  try {
    await LocalNotifications.registerActionTypes({
      types: [
        {
          id: NUDGE_ACTIONS,
          actions: [{ id: NOT_TODAY, title: "Not today: say why" }],
        },
      ],
    })
    return NUDGE_ACTIONS
  } catch {
    // The nudge still matters more than its button.
    return undefined
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
  const actionTypeId = await nudgeActionTypeId()
  await LocalNotifications.schedule({
    notifications: [
      {
        id: NUDGE_ID,
        actionTypeId,
        title: next.decision.title,
        body: next.decision.body,
        schedule: { at: next.at },
        // Inexact on purpose: the plugin defaults to exact (8.3.0+), which on
        // Android 12+ opens "Alarms & reminders" on every schedule() for an
        // app without SCHEDULE_EXACT_ALARM (not requested; AndroidManifest.xml).
        isExactNotification: false,
        extra: { url: `/sessions/${next.decision.sessionId}` },
      },
    ],
  })
  writeScheduledAt(next.at)
}

/**
 * On the way back to the screen: stamp the cooldown for a nudge the OS
 * delivered, and cancel one it has not.
 */
export async function reconcileNativeNudge(now: Date): Promise<void> {
  const scheduledAt = readScheduledAt()
  if (scheduledAt !== null) {
    const due = new Date(scheduledAt)
    const { notifications } = await LocalNotifications.getPending()
    const pending = notifications.some(({ id }) => id === NUDGE_ID)
    if (!pending && !Number.isNaN(due.getTime()) && due <= now) {
      recordNudgeShown(due)
    }
  }
  await scheduleNativeNudge(null)
}

/**
 * The settings page's "Send a test", shown now. Returns whether the OS took
 * it; the cooldown is not touched, since nobody was nudged.
 */
export async function showNativeTestNudge(
  decision: Extract<NudgeDecision, { kind: "nudge" }>
): Promise<boolean> {
  if ((await refreshNativePermission()) !== "granted") return false
  // With the real one's button, so the test shows what a nudge will.
  const actionTypeId = await nudgeActionTypeId()
  await LocalNotifications.schedule({
    notifications: [
      {
        id: TEST_NUDGE_ID,
        actionTypeId,
        title: decision.title,
        body: decision.body,
      },
    ],
  })
  return true
}

/** Where a tap on a nudge, or on its "Not today" button, goes. */
export function nudgeTarget(actionId: string, extra: unknown): string | null {
  if (actionId === NOT_TODAY && hasAudience("apk")) return NOT_TODAY_URL
  return typeof extra === "object" &&
    extra !== null &&
    "url" in extra &&
    typeof extra.url === "string"
    ? extra.url
    : null
}

let tapListening = false

/**
 * A tapped nudge opens the session it named; its "Not today" button opens the
 * soundbites page, listening. Installed once.
 */
export function listenForNudgeTaps(): void {
  if (tapListening) return
  tapListening = true
  void LocalNotifications.addListener(
    "localNotificationActionPerformed",
    ({ actionId, notification }) => {
      const url = nudgeTarget(actionId, notification.extra)
      // A full navigation, not a router push: this can arrive before the
      // router has mounted, on a cold start from the notification itself.
      if (url !== null) window.location.assign(url)
    }
  )
}
