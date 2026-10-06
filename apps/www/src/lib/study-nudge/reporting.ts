/**
 * Turning "Reminders and progress sync" on or off, as one sequence; the order
 * is coordination, so it lives here (`docs/monorepo-boundaries.md`, R1):
 *
 * - **Off**: end the push subscription at both ends *first*, while the
 *   reporting transport is allowed, then flip the setting.
 * - **On**: flip first (it lets a transport out), then register at once if
 *   reminders were already asked for and permitted.
 */

import { authority } from "@/lib/authority"

import type { NudgePreferences } from "./index"
import {
  nudgePermission,
  nudgesSupported,
  subscribeToPush,
  unsubscribeFromPush,
} from "./service-worker"

export type ReportingHooks = {
  /** Reporting is on but this browser could not be registered for push. */
  readonly notRegistered: () => void
}

export async function setReporting(
  on: boolean,
  preferences: NudgePreferences,
  hooks: ReportingHooks
): Promise<void> {
  if (!on) {
    await unsubscribeFromPush()
    authority.setReporting(false)
    return
  }
  authority.setReporting(true)
  if (!preferences.enabled || !nudgesSupported()) return
  // Never prompts: this is not the gesture that earns a permission request.
  if (nudgePermission() !== "granted") return
  const outcome = await subscribeToPush({ topics: preferences.pushTopics })
  if (outcome !== "subscribed") hooks.notRegistered()
}
