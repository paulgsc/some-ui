/**
 * @vitest-environment jsdom
 *
 * Home's study card must not read a failed sessions read as "nothing in
 * progress" and offer Start over a session that is only unreadable.
 */

import { fakeQueryResult, withQueryClient } from "@/test-support/query-client"
import { routeComponent } from "@/test-support/router-stubs"
import type * as ReactRouterModule from "@tanstack/react-router"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type * as TenantModule from "@/lib/tenant"
import type { SessionRecord } from "@/lib/tenant"

const refetch = vi.fn()
let mockResult: ReturnType<typeof TenantModule.useSessions>

vi.mock(
  "@/lib/tenant",
  async (importOriginal): Promise<typeof TenantModule> => {
    const actual = await importOriginal<typeof TenantModule>()
    return { ...actual, useSessions: () => mockResult }
  }
)

vi.mock(
  "@tanstack/react-router",
  async (importOriginal): Promise<typeof ReactRouterModule> => {
    const { withPlainLink } = await import("@/test-support/router-stubs")
    return withPlainLink(await importOriginal<typeof ReactRouterModule>())
  }
)

// An "apk" workspace, stubbed in the test build's profile; its cards are
// tested in @some-ui/aph, and only the study card is under test here.
vi.mock("@some-ui/aph", () => ({
  AphTodayCard: (): null => null,
  AphTodayEntries: (): null => null,
}))

const { Route } = await import("@/routes/_dashboard/_apk/today")
const TodayRoute = routeComponent(Route)

afterEach(() => {
  cleanup()
  refetch.mockClear()
})

type Sessions = Array<SessionRecord>

function renderWith(
  fields: Parameters<typeof fakeQueryResult<Sessions>>[0]
): void {
  mockResult = fakeQueryResult<Sessions>({ refetch, ...fields })
  render(withQueryClient(<TodayRoute />))
}

describe("Home's study card", () => {
  it("says the sessions could not be read, and retries, rather than offering Start", () => {
    renderWith({ data: undefined, isError: true, error: new Error("offline") })

    expect(screen.getByText(/couldn’t read your sessions/)).toBeTruthy()
    expect(screen.queryByText("nothing in progress")).toBeNull()
    expect(screen.queryByText("Start")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Retry" }))
    expect(refetch).toHaveBeenCalledTimes(1)
  })

  it("keeps a cached list through a failed refresh, and says it may be stale", () => {
    renderWith({ data: [], isError: true, error: new Error("refresh failed") })

    expect(screen.getByText("nothing in progress")).toBeTruthy()
    expect(screen.getByText(/this may be out of date/)).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Retry" }))
    expect(refetch).toHaveBeenCalledTimes(1)
  })

  it("offers Start only once the list is known to hold nothing in progress", () => {
    renderWith({ data: [], isError: false })

    expect(screen.getByText("nothing in progress")).toBeTruthy()
    expect(screen.getByText("Start")).toBeTruthy()
    expect(screen.queryByText(/this may be out of date/)).toBeNull()
  })
})
