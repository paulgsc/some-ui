/**
 * @vitest-environment jsdom
 *
 * `SessionsList`'s empty-list early return must not skip the `refreshError`
 * banner: an empty cache whose refresh failed is not a confident "No sessions
 * yet". Nor the hand-off strip: reflections outlive a deleted session.
 */

import { cachedQueryResult, withQueryClient } from "@/test-support/query-client"
import { routeComponent } from "@/test-support/router-stubs"
import type * as ReactRouterModule from "@tanstack/react-router"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { reflections } from "@/lib/session-reflection"
import type * as TenantModule from "@/lib/tenant"

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

const { Route } = await import("@/routes/_dashboard/sessions/index")
const SessionsRoute = routeComponent(Route)

afterEach(() => {
  cleanup()
  refetch.mockClear()
})

describe("SessionsRoute: an empty cached list through a failed refresh", () => {
  it.each([
    {
      refreshFailed: true,
      title:
        "shows the refresh-failed banner alongside 'No sessions yet', not silently",
    },
    {
      refreshFailed: false,
      title:
        "still shows a plain 'No sessions yet' with no banner when the empty read has no refresh failure (sanity)",
    },
  ])("$title", ({ refreshFailed }) => {
    mockResult = cachedQueryResult([], refreshFailed, { refetch })

    render(withQueryClient(<SessionsRoute />))

    expect(screen.getByText("No sessions yet.")).toBeTruthy()
    expect(document.querySelector('[role="alert"]') !== null).toBe(
      refreshFailed
    )
  })
})

describe("SessionsRoute: no sessions left, reflections still kept", () => {
  it("shows the hand-off strip, so they can still be let go", () => {
    localStorage.clear()
    reflections.keep({
      id: "t1",
      sessionId: "deleted-session",
      createdAt: new Date().toISOString(),
      atMs: null,
      body: { kind: "text", text: "particles" },
    })
    mockResult = cachedQueryResult([], false, { refetch })

    render(withQueryClient(<SessionsRoute />))

    expect(screen.getByText("No sessions yet.")).toBeTruthy()
    expect(
      screen.getByRole("region", { name: "Your reflections" })
    ).toBeTruthy()
  })
})
