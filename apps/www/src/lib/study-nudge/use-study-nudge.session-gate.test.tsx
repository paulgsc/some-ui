/**
 * @vitest-environment jsdom
 *
 * `useStudyNudge` is mounted once above the router (`StudyNudgeWatcher` in
 * `providers/index.tsx`), so it is alive on the public landing page and the
 * passkey screen, not just inside the signed-in dashboard. Before this test
 * existed, `useSessions`/`useSettings` here had no `enabled` gate, so this
 * hook fetched tenant data from the very first paint - the backend request
 * a signed-out visitor should never trigger, no matter what the route guard
 * decided about the page around it.
 */

import { renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

const useSessionsSpy = vi.fn()
const useSettingsSpy = vi.fn()

vi.mock("@/lib/tenant", () => ({
  useSessions: (options?: { enabled?: boolean }): { data: Array<never> } => {
    useSessionsSpy(options)
    return { data: [] }
  },
  useSettings: (options?: { enabled?: boolean }): { data: undefined } => {
    useSettingsSpy(options)
    return { data: undefined }
  },
}))

let hasSession = false
vi.mock("@/lib/auth-session", () => ({
  useHasDecorativeSession: (): boolean => hasSession,
}))

afterEach(() => {
  useSessionsSpy.mockClear()
  useSettingsSpy.mockClear()
  vi.resetModules()
})

describe("useStudyNudge: gates tenant queries on session", () => {
  it("does not enable the sessions/settings queries before sign-in", async () => {
    hasSession = false
    const { useStudyNudge } = await import("./use-study-nudge")
    renderHook(() => useStudyNudge())

    expect(useSessionsSpy).toHaveBeenCalledWith({ enabled: false })
    expect(useSettingsSpy).toHaveBeenCalledWith({ enabled: false })
  })

  it("enables both once a session exists", async () => {
    hasSession = true
    const { useStudyNudge } = await import("./use-study-nudge")
    renderHook(() => useStudyNudge())

    expect(useSessionsSpy).toHaveBeenCalledWith({ enabled: true })
    expect(useSettingsSpy).toHaveBeenCalledWith({ enabled: true })
  })
})
