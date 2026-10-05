/**
 * @vitest-environment jsdom
 *
 * `SettingsRoute`'s `ready(settings, refreshError)` shape, as in
 * `profile.refresh-error.test.tsx`.
 */

import type { JSX } from "react"
import { ThemeProvider } from "@/providers/theme"
import { cachedQueryResult, withQueryClient } from "@/test-support/query-client"
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

function renderRoute(): JSX.Element {
  return withQueryClient(
    <ThemeProvider>
      <SettingsRoute />
    </ThemeProvider>
  )
}

const FIXTURE_SETTINGS: UserSettings = {
  ttsVoice: { provider: "openai", voiceId: null },
  deviceVoiceId: "",
  audio: DEFAULT_AUDIO_PREFERENCES,
  notifications: DEFAULT_NUDGE_PREFERENCES,
  defaultSessionDurationMinutes: 10,
  defaultLayoutTree: "study",
}

describe("SettingsRoute: a cached settings record through a failed refresh is not silently stale", () => {
  it.each([
    {
      refreshFailed: true,
      title: "shows a failure affordance alongside the still-editable form",
    },
    {
      refreshFailed: false,
      title: "shows no failure affordance with no refresh failure (sanity)",
    },
  ])("$title", ({ refreshFailed }) => {
    mockResult = cachedQueryResult(FIXTURE_SETTINGS, refreshFailed, { refetch })

    render(renderRoute())

    expect(document.querySelector('[role="alert"]') !== null).toBe(
      refreshFailed
    )
    expect(screen.getByText("Settings")).toBeTruthy()
  })
})
