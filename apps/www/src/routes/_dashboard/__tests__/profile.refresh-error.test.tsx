/**
 * @vitest-environment jsdom
 *
 * Bot review, one round after the identical gap was caught and fixed in
 * `sessions/$sessionId.tsx`/`new.tsx`: `ProfileRoute`'s `ready` arm discarded
 * `refreshError` too, presenting a cached profile as an authoritative,
 * editable form with no warning that the latest background refresh actually
 * failed. See `profile.route-arrival.test.tsx`'s header for why `useProfile`
 * is mocked directly rather than sabotaging a transport.
 */

import type { JSX, ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
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
// eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- see sessions/index.test.tsx's identical assertion
const ProfileRoute = Route.options.component as () => JSX.Element

afterEach(() => {
  cleanup()
  refetch.mockClear()
})

function withQueryClient(children: ReactNode): JSX.Element {
  const client = new QueryClient()
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

const FIXTURE_PROFILE: UserProfile = {
  id: "local-tenant",
  displayName: "Yuna",
  avatar: "🙂",
  targetTopikLevel: "beginner",
}

function fakeResult(
  fields: Partial<ReturnType<typeof TenantModule.useProfile>>
): ReturnType<typeof TenantModule.useProfile> {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- stubbing TanStack Query's rich UseQueryResult with only the fields queryOutcome() reads; the real shape has no minimal constructor.
  return { refetch, ...fields } as ReturnType<typeof TenantModule.useProfile>
}

describe("ProfileRoute: a cached profile through a failed refresh is not silently stale", () => {
  it("shows a failure affordance alongside the still-editable form", () => {
    mockResult = fakeResult({
      data: FIXTURE_PROFILE,
      isLoading: false,
      isError: true,
      error: new Error("refresh failed"),
    })

    render(withQueryClient(<ProfileRoute />))

    expect(document.querySelector('[role="alert"]')).not.toBeNull()
    expect(screen.getByDisplayValue("Yuna")).toBeTruthy()
  })

  it("shows no failure affordance with no refresh failure (sanity)", () => {
    mockResult = fakeResult({
      data: FIXTURE_PROFILE,
      isLoading: false,
      isError: false,
      error: null,
    })

    render(withQueryClient(<ProfileRoute />))

    expect(document.querySelector('[role="alert"]')).toBeNull()
    expect(screen.getByDisplayValue("Yuna")).toBeTruthy()
  })
})
