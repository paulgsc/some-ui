/**
 * @vitest-environment jsdom
 *
 * G-2 (route-arrival handoff, r1): `SettingsRoute` had the same
 * `isLoading || !settings` skeleton-forever defect as `/sessions` (F-5).
 * See `profile.route-arrival.test.tsx`'s header for why `useSettings` is
 * mocked directly rather than sabotaging a transport - `settingsRepository`
 * is localStorage-backed and does not reject in practice today.
 */

import type { JSX, ReactNode } from "react"
import { ThemeProvider } from "@/providers/theme"
import {
  expectRetryAffordanceTracksRetryable,
  expectSomeFailureAffordance,
} from "@/test-support/file-host-sabotage"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
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

// `StudyNudgeSection` (rendered inside `SettingsForm`) reaches for
// notification/push APIs this jsdom test has no reason to exercise.
vi.mock("@/components/settings/study-nudge-section", () => ({
  StudyNudgeSection: (): null => null,
}))

const { Route } = await import("@/routes/_dashboard/settings")
// eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- see sessions/index.test.tsx's identical assertion
const SettingsRoute = Route.options.component as () => JSX.Element

afterEach(() => {
  cleanup()
  refetch.mockClear()
})

function withQueryClient(children: ReactNode): JSX.Element {
  const client = new QueryClient()
  return (
    <QueryClientProvider client={client}>
      <ThemeProvider>{children}</ThemeProvider>
    </QueryClientProvider>
  )
}

const FIXTURE_SETTINGS: UserSettings = {
  ttsProvider: "openai",
  ttsVoiceId: "",
  audio: DEFAULT_AUDIO_PREFERENCES,
  notifications: DEFAULT_NUDGE_PREFERENCES,
  defaultSessionDurationMinutes: 10,
  defaultLayoutTree: "study",
}

function fakeResult(
  fields: Partial<ReturnType<typeof TenantModule.useSettings>>
): ReturnType<typeof TenantModule.useSettings> {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- stubbing TanStack Query's rich UseQueryResult with only the fields queryOutcome() reads; the real shape has no minimal constructor.
  return { refetch, ...fields } as ReturnType<typeof TenantModule.useSettings>
}

describe("SettingsRoute: initial read outcomes", () => {
  it("a failed read (isError, no data) shows a failure affordance instead of an eternal skeleton", async () => {
    mockResult = fakeResult({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("boom"),
    })

    render(withQueryClient(<SettingsRoute />))

    expect(document.querySelectorAll(".animate-pulse").length).toBe(0)
    await expectSomeFailureAffordance(document.body)
    expectRetryAffordanceTracksRetryable(document.body, true)
  })

  it("a pending read (no data yet, not errored) shows the skeleton", () => {
    mockResult = fakeResult({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
    })

    render(withQueryClient(<SettingsRoute />))

    expect(document.querySelectorAll(".animate-pulse").length).toBeGreaterThan(
      0
    )
    expect(document.querySelector('[role="alert"]')).toBeNull()
  })

  it("a successful read renders the settings form", () => {
    mockResult = fakeResult({
      data: FIXTURE_SETTINGS,
      isLoading: false,
      isError: false,
      error: null,
    })

    render(withQueryClient(<SettingsRoute />))

    expect(screen.getByText("Settings")).toBeTruthy()
    expect(document.querySelector('[role="alert"]')).toBeNull()
  })
})
