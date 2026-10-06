/**
 * @vitest-environment jsdom
 *
 * `ProfileRoute` must not show a skeleton forever once a read has failed.
 *
 * `profileRepository` is localStorage-backed (`readJSON` never rejects), so
 * there is no transport to sabotage; `useProfile` is mocked to hand the route
 * the terminal `UseQueryResult` shapes a failing source would produce. A
 * weaker proof than the fetch-sabotaged `/sessions` suite, but the only way
 * to reach that state with today's repository.
 */

import {
  expectRetryAffordanceTracksRetryable,
  expectSomeFailureAffordance,
} from "@/test-support/file-host-sabotage"
import {
  cachedQueryResult,
  failedQueryResult,
  pendingQueryResult,
  withQueryClient,
} from "@/test-support/query-client"
import { routeComponent } from "@/test-support/router-stubs"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type * as TenantModule from "@/lib/tenant"
import type { UserProfile } from "@/lib/tenant"

const refetch = vi.fn()

let mockResult: ReturnType<typeof TenantModule.useProfile>

vi.mock(
  "@/lib/tenant",
  async (importOriginal): Promise<typeof TenantModule> => {
    const actual = await importOriginal<typeof TenantModule>()
    return {
      ...actual,
      useProfile: () => mockResult,
    }
  }
)

const { Route } = await import("@/routes/_dashboard/profile")
const ProfileRoute = routeComponent(Route)

afterEach(() => {
  cleanup()
  refetch.mockClear()
})

const FIXTURE_PROFILE: UserProfile = {
  id: "local-tenant",
  displayName: "Yuna",
  avatar: "🙂",
  targetTopikLevel: "beginner",
}

function renderRoute(result: typeof mockResult): void {
  mockResult = result
  render(withQueryClient(<ProfileRoute />))
}

describe("ProfileRoute: initial read outcomes", () => {
  it("a failed read (isError, no data) shows a failure affordance instead of an eternal skeleton", async () => {
    renderRoute(failedQueryResult({ refetch }))

    expect(document.querySelectorAll(".animate-pulse").length).toBe(0)
    await expectSomeFailureAffordance(document.body)
    expectRetryAffordanceTracksRetryable(document.body, true)
  })

  it("a pending read (no data yet, not errored) shows the skeleton", () => {
    renderRoute(pendingQueryResult({ refetch }))

    expect(document.querySelectorAll(".animate-pulse").length).toBeGreaterThan(
      0
    )
    expect(document.querySelector('[role="alert"]')).toBeNull()
  })

  it("a successful read renders the profile form", () => {
    renderRoute(cachedQueryResult(FIXTURE_PROFILE, false, { refetch }))

    expect(screen.getByDisplayValue("Yuna")).toBeTruthy()
    expect(document.querySelector('[role="alert"]')).toBeNull()
  })
})
