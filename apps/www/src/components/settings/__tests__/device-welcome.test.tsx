/**
 * @vitest-environment jsdom
 *
 * SIGNIN2 (#3088) in the foyer: a phone never paired opens on the welcome,
 * which pairs it with the code only (no name the owner didn't type) and
 * sends nothing until Pair is pressed; "Not now" shows the wings and is
 * remembered on this phone; a paired phone opens on the wings.
 */
import type * as ReactRouterModule from "@tanstack/react-router"
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"

import type { HomeRequest } from "@/lib/device-backend/native-http"

const home = vi.hoisted(
  (): { sent: Array<HomeRequest>; record: string | null; lost: boolean } => ({
    sent: [],
    record: null,
    lost: false,
  })
)

vi.mock("@/lib/build-profile", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  hasAudience: (): boolean => true,
  MOBILE_APP: true,
}))
vi.mock("@/lib/device-backend/native-http", () => ({
  homeRequest: (
    call: HomeRequest
  ): Promise<{ status: number; body: string }> => {
    home.sent.push(call)
    return Promise.resolve(
      call.url.endsWith("/auth/pairing/finish")
        ? { status: 200, body: JSON.stringify({ token: "t", expiresAt: 1 }) }
        : { status: 200, body: "{}" }
    )
  },
}))
vi.mock("@/lib/home-link/credential", () => ({
  nativeCredential: {
    read: (): Promise<{ record: string | null; lost: boolean }> =>
      Promise.resolve({ record: home.record, lost: home.lost }),
    write: (record: string): Promise<void> => {
      home.record = record
      return Promise.resolve()
    },
    clear: (): Promise<void> => {
      home.record = null
      return Promise.resolve()
    },
  },
}))
vi.mock(
  "@tanstack/react-router",
  async (importOriginal): Promise<typeof ReactRouterModule> => {
    const { withPlainLink } = await import("@/test-support/router-stubs")
    return withPlainLink(await importOriginal<typeof ReactRouterModule>())
  }
)

vi.stubEnv("VITE_DEVICE_BACKEND", "true")

beforeAll(async () => {
  await import("@/routes/_dashboard/_apk/foyer")
}, 30_000)

afterEach(() => {
  cleanup()
  home.sent = []
  home.record = null
  home.lost = false
  localStorage.clear()
  vi.resetModules()
})

async function foyer(): Promise<void> {
  const { Route } = await import("@/routes/_dashboard/_apk/foyer")
  const Foyer = Route.options.component
  if (Foyer === undefined) throw new Error("the foyer route draws nothing")
  render(<Foyer />)
}

const wings = (): HTMLElement | null =>
  screen.queryByRole("navigation", { name: "Wings" })

describe("the foyer's welcome", () => {
  it("opens on a phone never paired, and sends nothing until Pair", async () => {
    await foyer()
    expect(
      await screen.findByRole("heading", { name: "Pair this phone with home" })
    ).toBeTruthy()
    expect(wings()).toBeNull()
    // Nothing is filled in for the owner, and no name is asked for yet.
    expect(screen.queryByLabelText(/name this phone/i)).toBeNull()
    expect(home.sent).toEqual([])
  })

  it("pairs with the code only, then shows the wings", async () => {
    await foyer()
    fireEvent.change(await screen.findByLabelText("Home's address"), {
      target: { value: "home.example" },
    })
    fireEvent.change(screen.getByLabelText(/code from your computer/i), {
      target: { value: "K7QF 2M9X" },
    })
    fireEvent.click(
      screen.getByRole("button", { name: /pair with home\.example/i })
    )
    await waitFor(() => expect(wings()).not.toBeNull())
    expect(home.sent).toEqual([
      {
        method: "POST",
        url: "https://home.example/api/v1/auth/pairing/finish",
        body: { code: "K7QF2M9X" },
      },
    ])
  })

  it("shows the wings on Not now, and keeps that on this phone", async () => {
    await foyer()
    fireEvent.click(await screen.findByRole("button", { name: "Not now" }))
    expect(wings()).not.toBeNull()
    cleanup()
    vi.resetModules()
    await foyer()
    await waitFor(() => expect(wings()).not.toBeNull())
    expect(
      screen.queryByRole("heading", { name: /pair this phone/i })
    ).toBeNull()
  })

  it("opens again after a restore lost the pairing, and says so first", async () => {
    localStorage.setItem("some-ui.home.welcome-not-now.v1", "welcome")
    home.lost = true
    await foyer()
    expect(
      await screen.findByText(/pairing didn't survive a restore/i)
    ).toBeTruthy()
  })

  it("opens on the wings on a phone already paired", async () => {
    home.record = JSON.stringify({
      base: "https://home.example/api/v1",
      token: "t",
      id: "p1",
    })
    await foyer()
    await waitFor(() => expect(wings()).not.toBeNull())
  })
})
