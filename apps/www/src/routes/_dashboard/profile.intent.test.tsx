/**
 * @vitest-environment jsdom
 *
 * #937 S3: coverage extension for the profile save form's `useIntent`
 * failure path - this route had no dedicated test file at all before this
 * one. Same rationale as `settings.intent.test.tsx`: profile persists
 * through `ProfileRepository` straight to `localStorage`, never through
 * `file_host`/`fetch`, so the failure is injected by rejecting
 * `ProfileRepository.prototype.save` directly rather than sabotaging
 * `global.fetch`. The thrown error isn't a `FileHost*Error`, so
 * `mapFileHostError` falls through to `@some-ui/intent-kit`'s generic
 * `toIntentError` - `kind: "unknown"`, `retryable: true` always.
 */

import type { JSX, ReactNode } from "react"
import {
  expectRetryAffordanceTracksRetryable,
  expectSomeFailureAffordance,
} from "@/test-support/file-host-sabotage"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterAll, afterEach, beforeEach, describe, it, vi } from "vitest"

import { ProfileRepository } from "@/lib/tenant/profile-repository"

const saveProfileSpy = vi.spyOn(ProfileRepository.prototype, "save")

vi.mock("sonner", () => ({
  toast: (): void => {
    // Success-path copy is out of scope for this failure-only suite.
  },
}))

const { Route } = await import("./profile")
// eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- createFileRoute's Route.options.component is typed broader than the concrete component this file actually registered; there is no narrower accessor.
const ProfileRoute = Route.options.component as () => JSX.Element

function withProviders(children: ReactNode): JSX.Element {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

beforeEach(() => {
  saveProfileSpy.mockClear()
  window.localStorage.clear()
})

afterEach(() => {
  cleanup()
})

afterAll(() => {
  saveProfileSpy.mockRestore()
})

async function renderLoaded(): Promise<void> {
  render(withProviders(<ProfileRoute />))
  await screen.findByText("Profile")
}

describe("profile: save button, repository write fails", () => {
  it("tells the person the save failed, with a retry control (unknown errors are always retryable)", async () => {
    saveProfileSpy.mockRejectedValueOnce(new Error("localStorage write boom"))
    await renderLoaded()

    const input = await screen.findByLabelText(/display name/i)
    fireEvent.change(input, { target: { value: "New name" } })

    const save = screen.getByRole("button", { name: /save changes/i })
    // eslint-disable-next-line @typescript-eslint/require-await -- act's async form is what flushes the microtask-queued mutation state update; see test-support/file-host-sabotage.ts's header.
    await act(async () => {
      fireEvent.click(save)
    })

    await expectSomeFailureAffordance(document.body)
    expectRetryAffordanceTracksRetryable(document.body, true)
  })
})
