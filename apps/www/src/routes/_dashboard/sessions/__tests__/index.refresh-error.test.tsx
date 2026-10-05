/**
 * @vitest-environment jsdom
 *
 * `SessionsList`'s empty-list early return must not skip the `refreshError`
 * banner: an empty cache whose refresh failed is not a confident "No sessions
 * yet".
 */

import { cachedQueryResult, withQueryClient } from "@/test-support/query-client"
import { routeComponent } from "@/test-support/router-stubs"
import type * as ReactRouterModule from "@tanstack/react-router"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

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
