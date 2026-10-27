/**
 * What this browser keeps about nudges: when the last one went out, and the
 * Android app's notification permission as last read from the OS.
 *
 * Its own module because both `./service-worker` and `./native` write it, and
 * `./service-worker` loads `./native` lazily (device build only): were it
 * kept in `./service-worker`, `./native` would import it back, a cycle.
 */

/**
 * Runtime state, not preference, so not in `UserSettings`: the cooldown is a
 * fact about this browser, where quiet hours are about the person.
 */
const LAST_NUDGE_KEY = "some-ui.study-nudge.last-shown.v1"

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
    // Ignored: a refused write (private mode, quota) costs a cooldown, not the feature.
  }
}

/**
 * The Android app's notification permission, as last read from the OS.
 * Android's answer is asynchronous and `nudgePermission` is not, so
 * `./native` writes it here whenever it asks, and `useStudyNudge` asks on
 * mount.
 */
let nativePermission: NotificationPermission = "default"

export function setNativeNudgePermission(
  permission: NotificationPermission
): void {
  nativePermission = permission
}

export function nativeNudgePermission(): NotificationPermission {
  return nativePermission
}
