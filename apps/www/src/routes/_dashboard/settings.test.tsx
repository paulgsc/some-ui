/**
 * @vitest-environment jsdom
 *
 * #946/S3: settings' save button migrated to `useIntent`/`IntentButton`.
 * The double-submit regression (settings persists to `localStorage`
 * directly, no network mock needed - see `settings-repository.ts`), the
 * toast copy lifted verbatim, and the pre-existing `disabled={!isDirty}`
 * gate doing double duty as the double-terminal reset `use-intent.ts`'s
 * own header names this form as the example of.
 */

import type { JSX, ReactNode } from "react"
import { ThemeProvider } from "@/providers/theme"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const toastSpy = vi.fn()

vi.mock("sonner", () => ({
  toast: (...args: Array<unknown>): void => {
    toastSpy(...args)
  },
}))

vi.mock("@/components/settings/study-nudge-section", () => ({
  StudyNudgeSection: (): JSX.Element => <div data-testid="study-nudge-stub" />,
}))

const { Route } = await import("./settings")
// eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- createFileRoute's Route.options.component is typed broader than the concrete component this file actually registered; there is no narrower accessor.
const SettingsRoute = Route.options.component as () => JSX.Element

function withProviders(children: ReactNode): JSX.Element {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  })
  return (
    <QueryClientProvider client={client}>
      <ThemeProvider>{children}</ThemeProvider>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  toastSpy.mockClear()
  window.localStorage.clear()
})

afterEach(() => {
  cleanup()
})

async function renderLoaded(): Promise<void> {
  render(withProviders(<SettingsRoute />))
  await screen.findByText("Settings")
}

describe("settings: save button", () => {
  it("double-clicking Save issues exactly one write (thundering-herd regression)", async () => {
    const storageTarget =
      typeof Storage !== "undefined" ? Storage.prototype : window.localStorage

    const writeSpy = vi.spyOn(storageTarget, "setItem")

    await renderLoaded()

    const input = await screen.findByLabelText(/default session length/i)
    fireEvent.change(input, { target: { value: "25" } })

    const save = screen.getByRole("button", { name: /save changes/i })

    act(() => {
      fireEvent.click(save)
      fireEvent.click(save)
    })

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 250))
    })

    const settingsWrites = writeSpy.mock.calls.filter(
      ([key]) => key === "some-ui.tenant.settings.v1"
    )
    await waitFor(() => {
      expect(settingsWrites).toHaveLength(1)
    })
    writeSpy.mockRestore()
  })

  it("saves, toasts, and the button disables again without a further edit - unchanged from pre-migration", async () => {
    await renderLoaded()

    const input = await screen.findByLabelText(/default session length/i)
    fireEvent.change(input, { target: { value: "30" } })

    const save = screen.getByRole("button", { name: /save changes/i })
    expect(save.hasAttribute("disabled")).toBe(false)

    await act(async () => {
      fireEvent.click(save)
      await new Promise((resolve) => setTimeout(resolve, 250))
    })

    expect(toastSpy).toHaveBeenCalledWith("Settings saved")
    expect(
      screen
        .getByRole("button", { name: /save changes/i })
        .hasAttribute("disabled")
    ).toBe(true)
  })
})
