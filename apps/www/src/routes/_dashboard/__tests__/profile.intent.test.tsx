/**
 * @vitest-environment jsdom
 *
 * The profile save form's failure path. Profile persists through
 * `ProfileRepository` straight to `localStorage`, so the failure is injected
 * by rejecting `ProfileRepository.prototype.save` (as in `settings.test.tsx`);
 * a non-`FileHost*Error` maps to `kind: "unknown"`, always retryable.
 */

import {
  expectRetryAffordanceTracksRetryable,
  expectSomeFailureAffordance,
} from "@/test-support/file-host-sabotage"
import { withQueryClient } from "@/test-support/query-client"
import { routeComponent } from "@/test-support/router-stubs"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterAll, afterEach, beforeEach, describe, it, vi } from "vitest"

import { markSignedIn } from "@/lib/auth"
import { ProfileRepository } from "@/lib/tenant/profile-repository"

const saveProfileSpy = vi.spyOn(ProfileRepository.prototype, "save")

vi.mock("sonner", () => ({
  toast: (): void => {
    // Success-path copy is out of scope for this failure-only suite.
  },
}))

const { Route } = await import("@/routes/_dashboard/profile")
const ProfileRoute = routeComponent(Route)

beforeEach(() => {
  saveProfileSpy.mockClear()
  window.localStorage.clear()
  // The profile query stays disabled without a session (`lib/tenant/hooks.ts`).
  markSignedIn()
})

afterEach(() => {
  cleanup()
})

afterAll(() => {
  saveProfileSpy.mockRestore()
})

async function renderLoaded(): Promise<void> {
  render(withQueryClient(<ProfileRoute />))
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
