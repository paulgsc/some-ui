/**
 * @vitest-environment jsdom
 *
 * The APK removes SCHEDULE_EXACT_ALARM (apps/mobile AndroidManifest.xml), so
 * every nudge must be scheduled inexact. Left to the plugin's default
 * (exact, since @capacitor/local-notifications 8.3.0), each schedule() on
 * Android 12+ would open the "Alarms & reminders" settings screen instead.
 *
 * Being inexact, a nudge can still be pending after its time, so a return
 * to the app asks the OS what is pending before stamping the cooldown.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const plugin = vi.hoisted(() => ({
  cancel: vi.fn(() => Promise.resolve()),
  schedule: vi.fn(() => Promise.resolve({ notifications: [] })),
  checkPermissions: vi.fn(() => Promise.resolve({ display: "granted" })),
  getPending: vi.fn(
    (): Promise<{ notifications: Array<{ id: number }> }> =>
      Promise.resolve({ notifications: [] })
  ),
}))
vi.mock("@capacitor/local-notifications", () => ({
  LocalNotifications: plugin,
}))

const { reconcileNativeNudge, scheduleNativeNudge, showNativeTestNudge } =
  await import("@/lib/study-nudge/native")
const { readLastNudgeAt } = await import("@/lib/study-nudge/service-worker")

const DUE = new Date(2026, 8, 30, 14, 0, 0)
const NUDGE = {
  at: DUE,
  decision: {
    kind: "nudge" as const,
    sessionId: "s1",
    title: "Korean review",
    body: "Ready when you are",
  },
}

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

describe("reconcileNativeNudge", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
  })

  it("stamps the cooldown for a nudge the OS delivered", async () => {
    await scheduleNativeNudge(NUDGE)
    await reconcileNativeNudge(new Date(DUE.getTime() + 60_000))
    expect(readLastNudgeAt()).toBe(DUE.toISOString())
  })

  it("does not, for an inexact nudge still pending after its time", async () => {
    await scheduleNativeNudge(NUDGE)
    plugin.getPending.mockResolvedValueOnce({ notifications: [{ id: 1001 }] })
    await reconcileNativeNudge(new Date(DUE.getTime() + 60_000))
    expect(readLastNudgeAt()).toBeNull()
    expect(plugin.cancel).toHaveBeenLastCalledWith({
      notifications: [{ id: 1001 }],
    })
  })
})

describe("showNativeTestNudge", () => {
  beforeEach(() => vi.clearAllMocks())

  it("shows now, under its own id, without touching the real nudge", async () => {
    await expect(showNativeTestNudge(NUDGE.decision)).resolves.toBe(true)
    expect(plugin.cancel).not.toHaveBeenCalled()
    expect(plugin.schedule).toHaveBeenCalledWith({
      notifications: [
        { id: 1002, title: "Korean review", body: "Ready when you are" },
      ],
    })
  })

  it("says so when the OS will not show it", async () => {
    plugin.checkPermissions.mockResolvedValueOnce({ display: "denied" })
    await expect(showNativeTestNudge(NUDGE.decision)).resolves.toBe(false)
    expect(plugin.schedule).not.toHaveBeenCalled()
  })
})
