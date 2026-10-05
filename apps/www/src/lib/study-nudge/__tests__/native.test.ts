/**
 * @vitest-environment jsdom
 *
 * The APK omits SCHEDULE_EXACT_ALARM (AndroidManifest.xml), so every nudge is
 * scheduled inexact (the plugin's exact default would open "Alarms &
 * reminders" on Android 12+). An inexact nudge can be pending after its time,
 * so a return asks the OS what is pending before stamping the cooldown. In
 * the "apk" build a nudge carries "Not today: say why".
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const build = vi.hoisted(() => ({ apk: false }))
vi.mock("virtual:build-profile", () => ({
  profile: "native-test",
  audiences: [],
  hasAudience: (audience: string): boolean =>
    audience === "public" || (audience === "apk" && build.apk),
}))

const plugin = vi.hoisted(() => ({
  cancel: vi.fn(() => Promise.resolve()),
  schedule: vi.fn(() => Promise.resolve({ notifications: [] })),
  checkPermissions: vi.fn(() => Promise.resolve({ display: "granted" })),
  registerActionTypes: vi.fn(() => Promise.resolve()),
  getPending: vi.fn(
    (): Promise<{ notifications: Array<{ id: number }> }> =>
      Promise.resolve({ notifications: [] })
  ),
}))
vi.mock("@capacitor/local-notifications", () => ({
  LocalNotifications: plugin,
}))

const {
  nudgeTarget,
  reconcileNativeNudge,
  scheduleNativeNudge,
  showNativeTestNudge,
} = await import("@/lib/study-nudge/native")
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

describe('the nudge\'s "Not today" button', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => {
    build.apk = false
  })

  it("rides on every nudge in the Android app's build", async () => {
    build.apk = true
    await scheduleNativeNudge(NUDGE)
    expect(plugin.registerActionTypes).toHaveBeenCalledWith({
      types: [
        {
          id: "study-nudge",
          actions: [{ id: "not-today", title: "Not today: say why" }],
        },
      ],
    })
    expect(plugin.schedule).toHaveBeenCalledWith({
      notifications: [
        expect.objectContaining({ id: 1001, actionTypeId: "study-nudge" }),
      ],
    })
  })

  it("and on the test nudge, so the test shows what a nudge will", async () => {
    build.apk = true
    await showNativeTestNudge(NUDGE.decision)
    expect(plugin.schedule).toHaveBeenCalledWith({
      notifications: [
        expect.objectContaining({ id: 1002, actionTypeId: "study-nudge" }),
      ],
    })
  })

  it("is left off where there is no soundbites page", async () => {
    await scheduleNativeNudge(NUDGE)
    expect(plugin.registerActionTypes).not.toHaveBeenCalled()
    expect(plugin.schedule).toHaveBeenCalledWith({
      notifications: [expect.objectContaining({ actionTypeId: undefined })],
    })
  })

  it("does not cost the nudge when the button cannot be declared", async () => {
    build.apk = true
    plugin.registerActionTypes.mockRejectedValueOnce(new Error("no"))
    await scheduleNativeNudge(NUDGE)
    expect(plugin.schedule).toHaveBeenCalledWith({
      notifications: [expect.objectContaining({ actionTypeId: undefined })],
    })
  })

  it("opens the soundbites page, listening; a plain tap opens the session", () => {
    build.apk = true
    const extra = { url: "/sessions/s1" }
    expect(nudgeTarget("not-today", extra)).toBe("/soundbites?say=reminder")
    expect(nudgeTarget("tap", extra)).toBe("/sessions/s1")
    expect(nudgeTarget("tap", undefined)).toBeNull()
    build.apk = false
    expect(nudgeTarget("not-today", extra)).toBe("/sessions/s1")
  })
})
