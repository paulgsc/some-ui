/**
 * @vitest-environment jsdom
 *
 * `SettingsRoute` must not show a skeleton forever once a read has failed.
 * `useSettings` is mocked directly, as in `profile.route-arrival.test.tsx`:
 * `settingsRepository` is localStorage-backed and does not reject.
 */

import { ThemeProvider } from "@/providers/theme"
import {
  expectRetryAffordanceTracksRetryable,
  expectSomeFailureAffordance,
} from "@/test-support/file-host-sabotage"
import {
  cachedQueryResult,
  failedQueryResult,
  pendingQueryResult,
  withQueryClient,
} from "@/test-support/query-client"
import { routeComponent } from "@/test-support/router-stubs"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { DEFAULT_AUDIO_PREFERENCES } from "@/lib/audio-preferences"
import { DEFAULT_NUDGE_PREFERENCES } from "@/lib/study-nudge"
import type * as TenantModule from "@/lib/tenant"
import type { UserSettings } from "@/lib/tenant"

const refetch = vi.fn()

let mockResult: ReturnType<typeof TenantModule.useSettings>

vi.mock(
  "@/lib/tenant",
  async (importOriginal): Promise<typeof TenantModule> => {
    const actual = await importOriginal<typeof TenantModule>()
    return {
      ...actual,
      useSettings: () => mockResult,
    }
  }
)

// `StudyNudgeSection` (inside `SettingsForm`) reaches for notification/push
// APIs this test has no reason to exercise.
vi.mock("@/components/settings/study-nudge-section", () => ({
  StudyNudgeSection: (): null => null,
}))

const { Route } = await import("@/routes/_dashboard/settings")
const SettingsRoute = routeComponent(Route)

afterEach(() => {
  cleanup()
  refetch.mockClear()
})

const FIXTURE_SETTINGS: UserSettings = {
  ttsVoice: { provider: "openai", voiceId: null },
  deviceVoiceId: "",
  audio: DEFAULT_AUDIO_PREFERENCES,
  notifications: DEFAULT_NUDGE_PREFERENCES,
  defaultSessionDurationMinutes: 10,
  defaultLayoutTree: "study",
}

function renderRoute(result: typeof mockResult): void {
  mockResult = result
  render(
    withQueryClient(
      <ThemeProvider>
        <SettingsRoute />
      </ThemeProvider>
    )
  )
}

describe("SettingsRoute: initial read outcomes", () => {
  it("a failed read (isError, no data) shows a failure affordance instead of an eternal skeleton", async () => {
    renderRoute(failedQueryResult({ refetch }))

    expect(document.querySelectorAll(".animate-pulse").length).toBe(0)
    await expectSomeFailureAffordance(document.body)
    expectRetryAffordanceTracksRetryable(document.body, true)
  })

  it("a pending read (no data yet, not errored) shows the skeleton", () => {
    renderRoute(pendingQueryResult({ refetch }))

    expect(document.querySelectorAll(".animate-pulse").length).toBeGreaterThan(
      0
    )
    expect(document.querySelector('[role="alert"]')).toBeNull()
  })

  it("a successful read renders the settings form", () => {
    renderRoute(cachedQueryResult(FIXTURE_SETTINGS, false, { refetch }))

    expect(screen.getByText("Settings")).toBeTruthy()
    expect(document.querySelector('[role="alert"]')).toBeNull()
  })
})
