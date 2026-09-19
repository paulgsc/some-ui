/**
 * @vitest-environment jsdom
 *
 * #937 S3: coverage extension for the settings save form's `useIntent`
 * failure path. Not sabotaged via `test-support/file-host-sabotage.ts` -
 * settings persist through `SettingsRepository` straight to `localStorage`
 * (see `settings.test.tsx`'s own header), never through `file_host`/`fetch`,
 * so there is no `global.fetch` to stub. The failure is injected the same
 * way `settings.test.tsx` already spies on the repository: reject
 * `SettingsRepository.prototype.save` directly.
 *
 * Because the thrown error isn't one of `lib/file-host-config/client.ts`'s
 * three `FileHost*Error` classes, `mapFileHostError` falls through to
 * `@some-ui/intent-kit`'s generic `toIntentError` - `kind: "unknown"`,
 * `retryable: true` always (see `intent-error.ts`'s own doc comment). There
 * is exactly one realistic failure mode here, not four sabotage modes.
 */

import type { JSX, ReactNode } from "react"
import { ThemeProvider } from "@/providers/theme"
import {
  expectRetryAffordanceTracksRetryable,
  expectSomeFailureAffordance,
} from "@/test-support/file-host-sabotage"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterAll, afterEach, beforeEach, describe, it, vi } from "vitest"

import { createDecorativeSession } from "@/lib/auth-session"
import { SettingsRepository } from "@/lib/tenant/settings-repository"

const saveSettingsSpy = vi.spyOn(SettingsRepository.prototype, "save")

vi.mock("sonner", () => ({
  toast: (): void => {
    // Success-path copy is settings.test.tsx's concern; this suite only
    // exercises the failure path.
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
  saveSettingsSpy.mockClear()
  window.localStorage.clear()
  // This route only ever renders behind the router's auth guard - the
  // settings query it reads stays disabled without a session (see
  // `lib/tenant/hooks.ts`), so tests rendering it directly need one too.
  createDecorativeSession()
})

afterEach(() => {
  cleanup()
})

afterAll(() => {
  saveSettingsSpy.mockRestore()
})

async function renderLoaded(): Promise<void> {
  render(withProviders(<SettingsRoute />))
  await screen.findByText("Settings")
}

describe("settings: save button, repository write fails", () => {
  it("tells the person the save failed, with a retry control (unknown errors are always retryable)", async () => {
    saveSettingsSpy.mockRejectedValueOnce(new Error("localStorage write boom"))
    await renderLoaded()

    const input = await screen.findByLabelText(/default session length/i)
    fireEvent.change(input, { target: { value: "25" } })

    const save = screen.getByRole("button", { name: /save changes/i })
    // eslint-disable-next-line @typescript-eslint/require-await -- act's async form is what flushes the microtask-queued mutation state update; see test-support/file-host-sabotage.ts's header.
    await act(async () => {
      fireEvent.click(save)
    })

    await expectSomeFailureAffordance(document.body)
    expectRetryAffordanceTracksRetryable(document.body, true)
  })
})
