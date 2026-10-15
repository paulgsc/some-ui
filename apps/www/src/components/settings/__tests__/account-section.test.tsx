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
  const server = { base: "https://home.example/api/file-host" }
  return { auth, navigated, server }
})

vi.mock("@/lib/file-host-config", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  absoluteFileHostBase: (): string => calls.server.base,
}))

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
  startPairing: (): Promise<{ code: string; expiresAt: number }> => {
    calls.auth.push("startPairing")
    return Promise.resolve({ code: "K7QF2M9X", expiresAt: 1_700_000_000_000 })
  },
}))

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const { AccountSection } = await import("@/components/settings/account-section")

afterEach(() => {
  cleanup()
  calls.auth.length = 0
  calls.navigated.length = 0
  calls.server.base = "https://home.example/api/file-host"
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
    expect(screen.getByText(/no name, email or phone number/i)).toBeTruthy()
    expect(screen.getByText(/no email to recover your account/i)).toBeTruthy()
  })

  it("does not promise what the server cannot show it holds", () => {
    render(<AccountSection />)
    // The old copy said "never ... your device's details" and that deleting
    // removes "everything the server stores"; neither is something a screen
    // can promise (sessions are stored under the account, logs and backups
    // outlive a delete). Pin the honest wording so it cannot drift back.
    expect(screen.queryByText(/device's details/i)).toBeNull()
    expect(screen.queryByText(/everything the server stores/i)).toBeNull()
    expect(
      screen.getByText(/sessions and when you start and finish them/i)
    ).toBeTruthy()
    // The sign-up screen lists the shelf items and reminders too; so does this.
    expect(screen.getByText(/items you save to shelves/i)).toBeTruthy()
    expect(screen.getByText(/turn on reminders/i)).toBeTruthy()
    expect(
      screen.getByText(/does not rewrite server logs or backups/i)
    ).toBeTruthy()
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

  it("pairs a phone only when asked, showing the code and the address to type with it", async () => {
    render(<AccountSection />)
    expect(calls.auth).toEqual([])
    expect(screen.queryByText(/code for your phone/i)).toBeNull()

    await press(/pair a phone/i)
    expect(calls.auth).toEqual(["startPairing"])
    expect(screen.getByText("K7QF 2M9X")).toBeTruthy()
    expect(screen.getByText("https://home.example/api/file-host")).toBeTruthy()
    expect(screen.getByText(/works once, until/i)).toBeTruthy()
    expect(screen.getByRole("button", { name: /get a new code/i })).toBeTruthy()
  })

  it("offers no code for a server the phone cannot pair with over https", () => {
    calls.server.base = "http://192.168.1.10:3000"
    render(<AccountSection />)
    expect(screen.getByText(/phones pair over https only/i)).toBeTruthy()
    expect(
      screen.getByRole("button", { name: /pair a phone/i })
    ).toHaveProperty("disabled", true)
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
