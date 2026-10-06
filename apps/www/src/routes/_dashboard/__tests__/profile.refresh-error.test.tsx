/**
 * @vitest-environment jsdom
 *
 * `ProfileRoute`'s `ready` arm must not drop `refreshError` and present a
 * cached profile as authoritative. `useProfile` is mocked directly; see
 * `profile.route-arrival.test.tsx`'s header for why.
 */

import { cachedQueryResult, withQueryClient } from "@/test-support/query-client"
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

describe("ProfileRoute: a cached profile through a failed refresh is not silently stale", () => {
  it.each([
    {
      refreshFailed: true,
      title: "shows a failure affordance alongside the still-editable form",
    },
    {
      refreshFailed: false,
      title: "shows no failure affordance with no refresh failure (sanity)",
    },
  ])("$title", ({ refreshFailed }) => {
    mockResult = cachedQueryResult(FIXTURE_PROFILE, refreshFailed, { refetch })

    render(withQueryClient(<ProfileRoute />))

    expect(document.querySelector('[role="alert"]') !== null).toBe(
      refreshFailed
    )
    expect(screen.getByDisplayValue("Yuna")).toBeTruthy()
  })
})
