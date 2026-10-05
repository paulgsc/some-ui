/**
 * Turning "Reminders and progress sync" on or off, as one sequence.
 *
 * The order is the point, and it is coordination, so it lives here and not in
 * the switch's component (`docs/monorepo-boundaries.md`, R1):
 *
 * - **Off**: the push subscription is ended at both ends *first*, through the
 *   reporting transport while it is still allowed, and only then does the
 *   setting flip. Flipping first would make the call that tells the server
 *   impossible, and leave its row for this browser behind.
 * - **On**: the setting flips first (it is what lets a transport out), and then,
 *   if reminders were already asked for and permitted, this browser registers
 *   at once instead of waiting for a toggle off and on.
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
