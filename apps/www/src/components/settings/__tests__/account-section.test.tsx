/**
 * @vitest-environment jsdom
 *
 * The Account section's two promises: deleting the account takes a second,
 * deliberate press, and every way of leaving ends on the passkey screen.
 */

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

const calls = vi.hoisted(() => {
  const auth: Array<string> = []
  const navigated: Array<unknown> = []
  return { auth, navigated }
})

vi.mock("@tanstack/react-router", () => ({
  useNavigate:
    (): ((to: unknown) => Promise<void>) =>
    (to: unknown): Promise<void> => {
      calls.navigated.push(to)
      return Promise.resolve()
    },
}))

vi.mock("@/lib/auth", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  signOut: (): Promise<void> => {
    calls.auth.push("signOut")
    return Promise.resolve()
  },
  signOutEverywhere: (): Promise<void> => {
    calls.auth.push("signOutEverywhere")
    return Promise.resolve()
  },
  deleteAccount: (): Promise<void> => {
    calls.auth.push("deleteAccount")
    return Promise.resolve()
  },
  addPasskey: (): Promise<void> => {
    calls.auth.push("addPasskey")
    return Promise.resolve()
  },
}))

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const { AccountSection } = await import("@/components/settings/account-section")

afterEach(() => {
  cleanup()
  calls.auth.length = 0
  calls.navigated.length = 0
})

async function press(name: RegExp): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }))
    await Promise.resolve()
  })
}

describe("AccountSection", () => {
  it("says what the server keeps, and that there is no recovery by email", () => {
    render(<AccountSection />)
    expect(screen.getByText(/never a name, an email/i)).toBeTruthy()
    expect(screen.getByText(/no email to recover your account/i)).toBeTruthy()
  })

  it("deletes only on the second, explicit press, then leaves for the passkey screen", async () => {
    render(<AccountSection />)

    await press(/^delete account$/i)
    expect(calls.auth).toEqual([])

    await press(/keep my account/i)
    expect(screen.queryByRole("button", { name: /yes, delete/i })).toBeNull()

    await press(/^delete account$/i)
    await press(/yes, delete my account/i)
    expect(calls.auth).toEqual(["deleteAccount"])
    expect(calls.navigated).toEqual([{ to: "/auth" }])
  })

  it.each([
    [/^sign out$/i, "signOut"],
    [/sign out everywhere/i, "signOutEverywhere"],
  ])("%s ends on the passkey screen", async (button, call) => {
    render(<AccountSection />)
    await press(button)
    expect(calls.auth).toEqual([call])
    expect(calls.navigated).toEqual([{ to: "/auth" }])
  })
})
