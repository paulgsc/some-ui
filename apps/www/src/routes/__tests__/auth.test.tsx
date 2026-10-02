/**
 * @vitest-environment jsdom
 *
 * Where a server is optional, the passkey screen is a choice and not a gate: it
 * offers the device as plainly as the account, and picking it is remembered.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { authority } from "@/lib/authority"

const navigated = vi.hoisted((): Array<unknown> => [])
let search: { redirect?: string } = {}

vi.mock("@tanstack/react-router", () => ({
  createFileRoute:
    () =>
    (options: object): object => ({
      options,
      useSearch: (): { redirect?: string } => search,
    }),
  useNavigate:
    (): ((to: unknown) => Promise<void>) =>
    (to: unknown): Promise<void> => {
      navigated.push(to)
      return Promise.resolve()
    },
}))

vi.mock("@/lib/passkey", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  passkeysSupported: (): boolean => true,
}))

const { Route } = await import("@/routes/auth")

beforeEach(() => {
  window.localStorage.clear()
  window.history.replaceState(null, "", "/auth")
  authority.resetForTests()
  search = {}
  navigated.length = 0
})

afterEach(() => {
  cleanup()
})

function renderAuth(): void {
  const Page = Route.options.component
  if (!Page) throw new Error("the /auth route has no component")
  render(<Page />)
}

describe("the passkey screen", () => {
  it("offers the device beside the account, and says what that means", () => {
    renderAuth()
    expect(
      screen.getByRole("button", { name: /use some ui on this device/i })
    ).toBeTruthy()
    expect(screen.getByText(/your sessions stay in this browser/i)).toBeTruthy()
  })

  it("remembers the choice and carries on to the app", () => {
    renderAuth()
    fireEvent.click(
      screen.getByRole("button", { name: /use some ui on this device/i })
    )
    expect(authority.getSnapshot().choice).toBe("local")
    expect(navigated).toEqual([{ href: "/app" }])
  })

  it("goes where the person was headed", () => {
    search = { redirect: "/sessions" }
    renderAuth()
    fireEvent.click(
      screen.getByRole("button", { name: /use some ui on this device/i })
    )
    expect(navigated).toEqual([{ href: "/sessions" }])
  })

  it("lists what an account keeps, in full", () => {
    renderAuth()
    expect(screen.getByText(/items you save to shelves/i)).toBeTruthy()
  })
})
