/**
 * @vitest-environment jsdom
 *
 * The phone's sessions list (Practice's Study tab): rows that open on a tap,
 * "New" always at the top, and letting a session go through the
 * ConfirmSheet. Vitest builds the `lan` profile, so the build profile is
 * mocked to the phone's here.
 */

import { fakeQueryResult, withQueryClient } from "@/test-support/query-client"
import { routeComponent } from "@/test-support/router-stubs"
import { sessionRecord } from "@/test-support/session-record"
import { signInForTests } from "@/test-support/sign-in"
import type * as ReactRouterModule from "@tanstack/react-router"
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type * as BuildProfileModule from "@/lib/build-profile"
import type * as TenantModule from "@/lib/tenant"

vi.mock(
  "@/lib/build-profile",
  async (importOriginal): Promise<typeof BuildProfileModule> => ({
    ...(await importOriginal<typeof BuildProfileModule>()),
    MOBILE_APP: true,
  })
)

vi.mock(
  "@tanstack/react-router",
  async (importOriginal): Promise<typeof ReactRouterModule> => {
    const { withPlainLink } = await import("@/test-support/router-stubs")
    return withPlainLink(await importOriginal<typeof ReactRouterModule>())
  }
)

vi.mock(
  "@/lib/tenant",
  async (importOriginal): Promise<typeof TenantModule> => ({
    ...(await importOriginal<typeof TenantModule>()),
    useSessions: () =>
      fakeQueryResult({
        data: [sessionRecord({ id: "session-1", name: "Evening reading" })],
        isLoading: false,
      }),
  })
)

const { Route } = await import("@/routes/_dashboard/sessions/index")
const SessionsRoute = routeComponent(Route)

let deletes: Array<string>

beforeEach(() => {
  signInForTests()
  deletes = []
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === "DELETE") deletes.push(String(input))
    return Promise.resolve(new Response(null, { status: 204 }))
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function openMenuAndLetGo(): HTMLElement {
  fireEvent.click(
    screen.getByRole("button", { name: "More for Evening reading" })
  )
  fireEvent.click(screen.getByRole("button", { name: "Let it go" }))
  return screen.getByRole("dialog", { name: "Let this session go?" })
}

describe("sessions list on the phone", () => {
  it("opens a row on a tap and keeps New at the top, with no multi-select", () => {
    render(withQueryClient(<SessionsRoute />))

    expect(screen.queryByRole("checkbox")).toBeNull()
    // The router stub renders `to`, not `href` (test-support/router-stubs).
    expect(screen.getByText("New").closest("a")?.getAttribute("to")).toBe(
      "/sessions/new"
    )
    expect(
      screen.getByText("Evening reading").closest("a")?.getAttribute("to")
    ).toBe("/sessions/new")
  })

  it("lets a session go only once the sheet is answered yes", async () => {
    render(withQueryClient(<SessionsRoute />))

    const sheet = openMenuAndLetGo()
    expect(deletes).toEqual([])
    await act(async () => {
      fireEvent.click(within(sheet).getByRole("button", { name: "Let it go" }))
      await new Promise((resolve) => setTimeout(resolve, 20))
    })

    expect(deletes).toHaveLength(1)
    expect(deletes[0]).toContain("session-1")
  })

  it("keeps the session when the sheet is answered no", () => {
    render(withQueryClient(<SessionsRoute />))

    const sheet = openMenuAndLetGo()
    fireEvent.click(within(sheet).getByRole("button", { name: "Keep it" }))

    expect(screen.queryByRole("dialog")).toBeNull()
    expect(deletes).toEqual([])
  })
})
