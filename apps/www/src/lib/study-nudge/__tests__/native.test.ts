/**
 * The APK removes SCHEDULE_EXACT_ALARM (apps/mobile AndroidManifest.xml), so
 * every nudge must be scheduled inexact. Left to the plugin's default
 * (exact, since @capacitor/local-notifications 8.3.0), each schedule() on
 * Android 12+ would open the "Alarms & reminders" settings screen instead.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const plugin = vi.hoisted(() => ({
  cancel: vi.fn(() => Promise.resolve()),
  schedule: vi.fn(() => Promise.resolve({ notifications: [] })),
  checkPermissions: vi.fn(() => Promise.resolve({ display: "granted" })),
}))
vi.mock("@capacitor/local-notifications", () => ({
  LocalNotifications: plugin,
}))

const { scheduleNativeNudge } = await import("@/lib/study-nudge/native")

describe("scheduleNativeNudge", () => {
  beforeEach(() => vi.clearAllMocks())

  it("schedules the nudge as an inexact alarm", async () => {
    await scheduleNativeNudge({
      at: new Date(2026, 8, 30, 14, 0, 0),
      decision: {
        kind: "nudge",
        sessionId: "s1",
        title: "Korean review",
        body: "Ready when you are",
      },
    })

    expect(plugin.schedule).toHaveBeenCalledTimes(1)
    expect(plugin.schedule).toHaveBeenCalledWith({
      notifications: [expect.objectContaining({ isExactNotification: false })],
    })
  })
})
