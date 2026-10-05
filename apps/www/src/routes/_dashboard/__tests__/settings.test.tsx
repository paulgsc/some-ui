/**
 * @vitest-environment jsdom
 *
 * Settings' save button (`useIntent`/`IntentButton`). Settings persist through
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

vi.mock("@/components/settings/study-nudge-section", () => ({
  StudyNudgeSection: (): JSX.Element => <div data-testid="study-nudge-stub" />,
}))

const { Route } = await import("@/routes/_dashboard/settings")
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

/** Renders the loaded form, edits the session length, returns Save. */
async function editLength(value: string): Promise<HTMLElement> {
  render(
    withQueryClient(
      <ThemeProvider>
        <SettingsRoute />
      </ThemeProvider>
    )
  )
  await screen.findByText("Settings")
  const input = await screen.findByLabelText(/default session length/i)
  fireEvent.change(input, { target: { value } })
  return screen.getByRole("button", { name: /save changes/i })
}

describe("settings: save button", () => {
  it("double-clicking Save issues exactly one write (thundering-herd regression)", async () => {
    const save = await editLength("25")

    act(() => {
      fireEvent.click(save)
      fireEvent.click(save)
    })

    await waitFor(() => {
      expect(saveSettingsSpy).toHaveBeenCalledTimes(1)
    })
  })

  it("saves, toasts, and the button disables again without a further edit", async () => {
    const save = await editLength("30")
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
    const save = await editLength("25")

    // eslint-disable-next-line @typescript-eslint/require-await -- act's async form is what flushes the microtask-queued mutation state update; see test-support/file-host-sabotage.ts's header.
    await act(async () => {
      fireEvent.click(save)
    })

    await expectSomeFailureAffordance(document.body)
    expectRetryAffordanceTracksRetryable(document.body, true)
  })
})
