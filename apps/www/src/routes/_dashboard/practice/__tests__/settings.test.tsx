/**
 * @vitest-environment jsdom
 *
 * Settings' save button (`useIntent`/`IntentButton`), on Practice's settings
 * (`components/settings/study-settings`), which the web's Settings carries.
 * Settings persist through
 * `SettingsRepository` straight to `localStorage`, so writes are observed and
 * failures injected by spying on `SettingsRepository.prototype.save`; there
 * is no `fetch` to sabotage. A non-`FileHost*Error` maps to
 * `toIntentError`'s `kind: "unknown"`, always retryable.
 */

import type { JSX } from "react"
import { ThemeProvider } from "@/providers/theme"
import {
  expectRetryAffordanceTracksRetryable,
  expectSomeFailureAffordance,
} from "@/test-support/file-host-sabotage"
import { withQueryClient } from "@/test-support/query-client"
import { routeComponent } from "@/test-support/router-stubs"
import { QueryClient } from "@tanstack/react-query"
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react"
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"

import { markSignedIn } from "@/lib/auth"
import type { NudgePreferences } from "@/lib/study-nudge"
import { DEFAULT_NUDGE_PREFERENCES } from "@/lib/study-nudge"
import type { UserSettings } from "@/lib/tenant"
import { settingsKey } from "@/lib/tenant"
import { SettingsRepository } from "@/lib/tenant/settings-repository"

const toastSpy = vi.fn()
// Installed before importing the route: hooks.ts creates its repository at
// module evaluation time.
const saveSettingsSpy = vi.spyOn(SettingsRepository.prototype, "save")

vi.mock("sonner", () => ({
  toast: (...args: Array<unknown>): void => {
    toastSpy(...args)
  },
}))

// The one edit these tests make: the reminders on or off.
vi.mock("@/components/settings/study-nudge-section", () => ({
  StudyNudgeSection: ({
    preferences,
    onChange,
  }: {
    preferences: NudgePreferences
    onChange: (next: NudgePreferences) => void
  }): JSX.Element => (
    <button
      type="button"
      onClick={() =>
        onChange({ ...preferences, enabled: !preferences.enabled })
      }
    >
      Toggle reminders
    </button>
  ),
}))

const { Route } = await import("@/routes/_dashboard/practice/settings")
const SettingsRoute = routeComponent(Route)

beforeEach(() => {
  toastSpy.mockClear()
  saveSettingsSpy.mockClear()
  window.localStorage.clear()
  // The settings query stays disabled without a session (`lib/tenant/hooks.ts`).
  markSignedIn()
})

afterEach(() => {
  cleanup()
})

afterAll(() => {
  saveSettingsSpy.mockRestore()
})

/** Renders the loaded form, toggles the reminders, returns Save. */
async function editReminders(
  client: QueryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
): Promise<HTMLElement> {
  render(
    withQueryClient(
      <ThemeProvider>
        <SettingsRoute />
      </ThemeProvider>,
      client
    )
  )
  await screen.findByText("Settings")
  fireEvent.click(await screen.findByText("Toggle reminders"))
  return screen.getByRole("button", { name: /save changes/i })
}

describe("settings: save button", () => {
  it("double-clicking Save issues exactly one write (thundering-herd regression)", async () => {
    const save = await editReminders()

    act(() => {
      fireEvent.click(save)
      fireEvent.click(save)
    })

    await waitFor(() => {
      expect(saveSettingsSpy).toHaveBeenCalledTimes(1)
    })
  })

  it("saves, toasts, and the button disables again without a further edit", async () => {
    const save = await editReminders()
    expect(save.hasAttribute("disabled")).toBe(false)

    act(() => {
      fireEvent.click(save)
    })

    await waitFor(() => {
      expect(toastSpy).toHaveBeenCalledWith("Settings saved")
      expect(
        screen
          .getByRole("button", { name: /save changes/i })
          .hasAttribute("disabled")
      ).toBe(true)
    })
  })
})

describe("settings: save button, repository write fails", () => {
  it("tells the person the save failed, with a retry control (unknown errors are always retryable)", async () => {
    saveSettingsSpy.mockRejectedValueOnce(new Error("localStorage write boom"))
    const save = await editReminders()

    // eslint-disable-next-line @typescript-eslint/require-await -- act's async form is what flushes the microtask-queued mutation state update; see test-support/file-host-sabotage.ts's header.
    await act(async () => {
      fireEvent.click(save)
    })

    await expectSomeFailureAffordance(document.body)
    expectRetryAffordanceTracksRetryable(document.body, true)
  })
})

describe("settings: save keeps what it does not edit", () => {
  it("does not undo an audio change made in the header while the form was open", async () => {
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    const save = await editReminders(client)

    // The header's audio menu writes straight through to the same record
    // (lib/audio-preferences), after the form opened.
    client.setQueryData<UserSettings>(settingsKey, (current) =>
      current
        ? {
            ...current,
            audio: { ...current.audio, speech: { enabled: false, volume: 1 } },
          }
        : current
    )
    // The cache tells its readers on the next task, as a person's later tap
    // would find it.
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)))
    act(() => {
      fireEvent.click(save)
    })

    await waitFor(() => {
      expect(saveSettingsSpy).toHaveBeenCalledTimes(1)
    })
    const saved = saveSettingsSpy.mock.calls[0]?.[0]
    expect(saved.audio.speech.enabled).toBe(false)
    // And the form's own edit goes with it.
    expect(saved.notifications.enabled).toBe(!DEFAULT_NUDGE_PREFERENCES.enabled)
  })
})
