/**
 * @vitest-environment jsdom
 *
 * G-2 (route-arrival handoff, r1): `ProfileRoute` had the same
 * `isLoading || !profile` skeleton-forever defect as `/sessions` (F-5).
 *
 * `profileRepository` is localStorage-backed (`readJSON` never rejects - see
 * `lib/tenant/storage.ts`), so unlike `/sessions` there is no real transport
 * to sabotage today; `useProfile` is mocked directly to hand the route the
 * terminal `UseQueryResult` shapes a future failing profile source (or a
 * corrupted-storage edge case) would actually produce. That is a weaker
 * proof than the fetch-sabotaged `/sessions` suite - recorded here rather
 * than glossed over - but the property under test (the route must not
 * render a stuck skeleton once `isError` is true) is the same one, and this
 * is the only way to reach that state given today's repository.
 */

import type { JSX, ReactNode } from "react"
import {
  expectRetryAffordanceTracksRetryable,
  expectSomeFailureAffordance,
} from "@/test-support/file-host-sabotage"
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

describe("ProfileRoute: initial read outcomes", () => {
  it("a failed read (isError, no data) shows a failure affordance instead of an eternal skeleton", async () => {
    mockResult = fakeResult({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("boom"),
    })

    render(withQueryClient(<ProfileRoute />))

    expect(document.querySelectorAll(".animate-pulse").length).toBe(0)
    await expectSomeFailureAffordance(document.body)
    expectRetryAffordanceTracksRetryable(document.body, true)
  })

  it("a pending read (no data yet, not errored) shows the skeleton", () => {
    mockResult = fakeResult({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
    })

    render(withQueryClient(<ProfileRoute />))

    expect(document.querySelectorAll(".animate-pulse").length).toBeGreaterThan(
      0
    )
    expect(document.querySelector('[role="alert"]')).toBeNull()
  })

  it("a successful read renders the profile form", () => {
    mockResult = fakeResult({
      data: FIXTURE_PROFILE,
      isLoading: false,
      isError: false,
      error: null,
    })

    render(withQueryClient(<ProfileRoute />))

    expect(screen.getByDisplayValue("Yuna")).toBeTruthy()
    expect(document.querySelector('[role="alert"]')).toBeNull()
  })
})
