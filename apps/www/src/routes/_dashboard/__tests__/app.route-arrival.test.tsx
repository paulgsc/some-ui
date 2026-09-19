/**
 * @vitest-environment jsdom
 *
 * #968 (MS8)'s acceptance criteria, reconciled with the broader route-arrival
 * model (r1): `DashboardHome`'s `RecentSessions` used to be fed
 * `useSessions()`'s `data` with a `= []` default, coercing "pending" and
 * "failed" into the same "no sessions yet" copy as a genuine empty list.
 * `ProfileSummary` (same file) already branched on `isLoading` correctly but
 * had the sibling defect from F-5: a failed read stayed on the skeleton
 * forever instead of surfacing a failure.
 *
 * `useProfile`/`useSessions` are mocked directly (`ActivityLauncher` also
 * calls both internally and is mocked away so its own unrelated logic
 * doesn't have to tolerate the same fixture) - see
 * `profile.route-arrival.test.tsx`'s header for why this is a `UseQueryResult`
 * stub rather than a sabotaged transport for these two localStorage-backed
 * queries.
 */

import type { JSX, ReactNode } from "react"
import {
  expectRetryAffordanceTracksRetryable,
  expectSomeFailureAffordance,
} from "@/test-support/file-host-sabotage"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type * as ReactRouterModule from "@tanstack/react-router"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type * as TenantModule from "@/lib/tenant"
import type { SessionRecord, UserProfile } from "@/lib/tenant"

const refetch = vi.fn()

let profileResult: ReturnType<typeof TenantModule.useProfile>
let sessionsResult: ReturnType<typeof TenantModule.useSessions>

vi.mock(
  "@/lib/tenant",
  async (importOriginal): Promise<typeof TenantModule> => {
    const actual = await importOriginal<typeof TenantModule>()
    return {
      ...actual,
      useProfile: () => profileResult,
      useSessions: () => sessionsResult,
    }
  }
)

vi.mock("@/components/activity/activity-launcher", () => ({
  ActivityLauncher: (): null => null,
}))

vi.mock(
  "@tanstack/react-router",
  async (importOriginal): Promise<typeof ReactRouterModule> => {
    const actual = await importOriginal<typeof ReactRouterModule>()
    return {
      ...actual,
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- see sessions/index.test.tsx's identical stand-in
      Link: (({ children, ...props }: { children?: ReactNode }) => (
        <a {...props}>{children}</a>
      )) as typeof ReactRouterModule.Link,
    }
  }
)

const { Route } = await import("@/routes/_dashboard/app")
// eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- see sessions/index.test.tsx's identical assertion
const DashboardHome = Route.options.component as () => JSX.Element

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

function fixtureSession(id: string, name: string): SessionRecord {
  return {
    id,
    name,
    status: "draft",
    activities: [],
    scenes: [],
    layoutMode: "basic",
    totalDurationMs: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  }
}

function fakeProfileResult(
  fields: Partial<ReturnType<typeof TenantModule.useProfile>>
): ReturnType<typeof TenantModule.useProfile> {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- stubbing TanStack Query's rich UseQueryResult with only the fields queryOutcome() reads; the real shape has no minimal constructor.
  return { refetch, ...fields } as ReturnType<typeof TenantModule.useProfile>
}

function fakeSessionsResult(
  fields: Partial<ReturnType<typeof TenantModule.useSessions>>
): ReturnType<typeof TenantModule.useSessions> {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- see fakeProfileResult above
  return { refetch, ...fields } as ReturnType<typeof TenantModule.useSessions>
}

const READY_PROFILE = fakeProfileResult({
  data: FIXTURE_PROFILE,
  isLoading: false,
  isError: false,
  error: null,
})

describe("DashboardHome: ProfileSummary read outcomes", () => {
  it("a failed profile read shows a failure affordance, not a stuck skeleton", async () => {
    profileResult = fakeProfileResult({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("boom"),
    })
    sessionsResult = fakeSessionsResult({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
    })

    render(withQueryClient(<DashboardHome />))

    await expectSomeFailureAffordance(document.body)
    expectRetryAffordanceTracksRetryable(document.body, true)
  })

  it("a stale cached profile with a failed refresh keeps showing it, with a visible refresh-failed signal", () => {
    profileResult = fakeProfileResult({
      data: FIXTURE_PROFILE,
      isLoading: false,
      isError: true,
      error: new Error("refresh failed"),
    })
    sessionsResult = fakeSessionsResult({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
    })

    render(withQueryClient(<DashboardHome />))

    expect(screen.getByText("Yuna")).toBeTruthy()
    expect(document.querySelector('[role="alert"]')).not.toBeNull()
  })
})

describe("DashboardHome: RecentSessions read outcomes (#968 acceptance criteria)", () => {
  it("a pending sessions read shows a loading placeholder, not 'No sessions yet'", () => {
    profileResult = READY_PROFILE
    sessionsResult = fakeSessionsResult({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
    })

    render(withQueryClient(<DashboardHome />))

    expect(screen.queryByText(/no sessions yet/i)).toBeNull()
    expect(document.querySelectorAll(".animate-pulse").length).toBeGreaterThan(
      0
    )
  })

  it("a successful empty sessions read shows 'No sessions yet'", () => {
    profileResult = READY_PROFILE
    sessionsResult = fakeSessionsResult({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
    })

    render(withQueryClient(<DashboardHome />))

    expect(screen.getByText(/no sessions yet/i)).toBeTruthy()
    expect(document.querySelector('[role="alert"]')).toBeNull()
  })

  it("a failed sessions read (after retries) shows a failure state, not the empty-state copy", async () => {
    profileResult = READY_PROFILE
    sessionsResult = fakeSessionsResult({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("boom"),
    })

    render(withQueryClient(<DashboardHome />))

    expect(screen.queryByText(/no sessions yet/i)).toBeNull()
    await expectSomeFailureAffordance(document.body)
  })

  it("a successful nonempty sessions read renders the list", () => {
    profileResult = READY_PROFILE
    sessionsResult = fakeSessionsResult({
      data: [fixtureSession("session-1", "Vocabulary warm-up")],
      isLoading: false,
      isError: false,
      error: null,
    })

    render(withQueryClient(<DashboardHome />))

    expect(screen.getByText("Vocabulary warm-up")).toBeTruthy()
    expect(screen.queryByText(/no sessions yet/i)).toBeNull()
  })

  it("a stale cached list with a failed refresh keeps showing the list, with a visible refresh-failed signal", () => {
    profileResult = READY_PROFILE
    sessionsResult = fakeSessionsResult({
      data: [fixtureSession("session-1", "Vocabulary warm-up")],
      isLoading: false,
      isError: true,
      error: new Error("refresh failed"),
    })

    render(withQueryClient(<DashboardHome />))

    expect(screen.getByText("Vocabulary warm-up")).toBeTruthy()
    expect(document.querySelector('[role="alert"]')).not.toBeNull()
  })
})
