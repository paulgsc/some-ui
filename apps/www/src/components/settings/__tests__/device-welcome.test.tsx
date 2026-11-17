/**
 * @vitest-environment jsdom
 *
 * SIGNIN2 (#3088) in the foyer: a phone never paired opens on the welcome,
 * which pairs it with the code only (no name the owner didn't type) and
 * sends nothing until Pair is pressed; "Not now" shows the wings and is
 * remembered on this phone; a paired phone opens on the wings. The name
 * field (C498) follows whether home takes a name (`PHONE_NAMES`, from the
 * route snapshot's epoch), which these tests set both ways, so they hold
 * whichever snapshot the build carries.
 */
import type * as ReactRouterModule from "@tanstack/react-router"
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"

import type { HomeRequest } from "@/lib/device-backend/native-http"

const home = vi.hoisted(
  (): {
    sent: Array<HomeRequest>
    record: string | null
    lost: boolean
    /** While set, the phone's record isn't read back yet. */
    held: Promise<void> | null
  } => ({
    sent: [],
    record: null,
    lost: false,
    held: null,
  })
)

/** Whether this build's home takes a name at pairing (`PHONE_NAMES`). */
const naming = vi.hoisted((): { on: boolean } => ({ on: false }))

vi.mock("@/lib/home-link/naming", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  get PHONE_NAMES(): boolean {
    return naming.on
  },
}))
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
    read: async (): Promise<{ record: string | null; lost: boolean }> => {
      await home.held
      return { record: home.record, lost: home.lost }
    },
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
  stopWatch()
  stopWatch = (): void => undefined
  cleanup()
  home.sent = []
  home.record = null
  home.lost = false
  home.held = null
  naming.on = false
  localStorage.clear()
  vi.resetModules()
})

let stopWatch: () => void = (): void => undefined

/** The foyer, with what the app shell keeps of the pairing (`SignInWatch`). */
async function foyer(): Promise<void> {
  const { Route } = await import("@/routes/_dashboard/_apk/foyer")
  const { homeLink } = await import("@/lib/home-link")
  const { watchPairing } = await import("@/lib/home-link/first-run")
  const Foyer = Route.options.component
  if (Foyer === undefined) throw new Error("the foyer route draws nothing")
  stopWatch()
  stopWatch = watchPairing(homeLink())
  render(<Foyer />)
}

const wings = (): HTMLElement | null =>
  screen.queryByRole("navigation", { name: "Wings" })

describe("the foyer's welcome", () => {
  /** Fills in home's address and the code, and presses Pair. */
  async function pairWith(name?: string): Promise<void> {
    fireEvent.change(await screen.findByLabelText("Home's address"), {
      target: { value: "home.example" },
    })
    fireEvent.change(screen.getByLabelText(/code from your computer/i), {
      target: { value: "K7QF 2M9X" },
    })
    if (name !== undefined) {
      fireEvent.change(screen.getByLabelText(/name this phone/i), {
        target: { value: name },
      })
    }
    fireEvent.click(
      screen.getByRole("button", { name: /pair with home\.example/i })
    )
    await waitFor(() => expect(wings()).not.toBeNull())
  }

  const FINISH = "https://home.example/api/v1/auth/pairing/finish"

  for (const takesName of [false, true]) {
    const where = takesName ? "home takes a name" : "home takes no name"

    it(`opens on a phone never paired, and sends nothing until Pair (${where})`, async () => {
      naming.on = takesName
      await foyer()
      expect(
        await screen.findByRole("heading", {
          name: "Pair this phone with home",
        })
      ).toBeTruthy()
      expect(wings()).toBeNull()
      // Nothing is filled in for the owner: a name is asked for only where
      // home takes one, and the field starts empty.
      const field = screen.queryByLabelText(/name this phone/i)
      if (takesName) {
        expect(field).toBeInstanceOf(HTMLInputElement)
        expect(field instanceof HTMLInputElement ? field.value : null).toBe("")
      } else {
        expect(field).toBeNull()
      }
      expect(home.sent).toEqual([])
    })

    it(`pairs with the code only, then shows the wings (${where})`, async () => {
      naming.on = takesName
      await foyer()
      await pairWith()
      // The code alone: no name the owner didn't type.
      expect(home.sent).toEqual([
        { method: "POST", url: FINISH, body: { code: "K7QF2M9X" } },
      ])
    })
  }

  it("sends the name the owner typed, trimmed, where home takes one", async () => {
    naming.on = true
    await foyer()
    await pairWith("  Pixel 8  ")
    expect(home.sent).toEqual([
      {
        method: "POST",
        url: FINISH,
        body: { code: "K7QF2M9X", label: "Pixel 8" },
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
      await screen.findByText(/doesn't come back from a backup/i)
    ).toBeTruthy()
  })

  const PAIRED = JSON.stringify({
    base: "https://home.example/api/v1",
    token: "t",
    id: "p1",
  })

  it("never opens again on a phone the person unpaired, once restarted", async () => {
    home.record = PAIRED
    await foyer()
    await waitFor(() => expect(wings()).not.toBeNull())
    const { homeLink } = await import("@/lib/home-link")
    await act(() => homeLink().unpair())
    // A restart reads no record, as on a phone never paired.
    cleanup()
    vi.resetModules()
    await foyer()
    await waitFor(() => expect(wings()).not.toBeNull())
    expect(
      screen.queryByRole("heading", { name: /pair this phone/i })
    ).toBeNull()
  })

  it("opens after a restore or a move that left the pairing behind, and says so first", async () => {
    home.record = PAIRED
    await foyer()
    await waitFor(() => expect(wings()).not.toBeNull())
    // The backup carries what the phone remembers, never its record.
    cleanup()
    vi.resetModules()
    home.record = null
    await foyer()
    expect(
      await screen.findByText(/doesn't come back from a backup/i)
    ).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Not now" }))
    expect(wings()).not.toBeNull()
    cleanup()
    vi.resetModules()
    await foyer()
    await waitFor(() => expect(wings()).not.toBeNull())
  })

  it("draws nothing while the phone's record is read, so the screen doesn't swap (HS1)", async () => {
    let release: () => void = () => undefined
    home.held = new Promise((resolve) => {
      release = resolve
    })
    await foyer()
    await Promise.resolve()
    expect(wings()).toBeNull()
    expect(
      screen.queryByRole("heading", { name: /pair this phone/i })
    ).toBeNull()
    release()
    expect(
      await screen.findByRole("heading", { name: "Pair this phone with home" })
    ).toBeTruthy()
  })
})
