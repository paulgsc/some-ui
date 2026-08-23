/**
 * @vitest-environment jsdom
 *
 * `StudyNudgeWatcher`'s whole body - registering a service worker,
 * reconciling a push subscription, polling every five minutes, plus the
 * sessions/settings queries `hooks.test.tsx` covers separately - is work
 * with nothing to do until there is a tenant workspace. `AppProviders`
 * mounts this tree above the router, so it renders on the public landing
 * page and the passkey screen too; this asserts it doesn't mount
 * `StudyNudgeWatcher` at all until a session exists, rather than mounting
 * it and hoping its internals no-op.
 */

import type { ReactNode } from "react"
import { render } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

const studyNudgeWatcherSpy = vi.fn()

vi.mock("./study-nudge", () => ({
  StudyNudgeWatcher: (): null => {
    studyNudgeWatcherSpy()
    return null
  },
}))

vi.mock("./tts", () => ({
  TTSProvider: ({ children }: { children?: ReactNode }): ReactNode => children,
}))

let hasSession = false
vi.mock("@/lib/auth-session", () => ({
  useHasDecorativeSession: (): boolean => hasSession,
}))

describe("AppProviders: does not mount StudyNudgeWatcher before there is a session", () => {
  it("skips it while signed out and mounts it once signed in", async () => {
    hasSession = false
    const { AppProviders } = await import("./index")

    const { rerender } = render(
      <AppProviders>
        <div>routed content</div>
      </AppProviders>
    )

    expect(studyNudgeWatcherSpy).not.toHaveBeenCalled()

    hasSession = true
    rerender(
      <AppProviders>
        <div>routed content</div>
      </AppProviders>
    )

    expect(studyNudgeWatcherSpy).toHaveBeenCalled()
  })
})
