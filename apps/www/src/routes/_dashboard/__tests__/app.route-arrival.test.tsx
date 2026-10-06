/**
 * @vitest-environment jsdom
 *
 * `DashboardHome`'s read outcomes: `RecentSessions` must tell pending, failed
 * and empty apart (#968), and `ProfileSummary` must leave the skeleton on a
 * failed read. `useProfile`/`useSessions` are mocked directly
 * (`ActivityLauncher`, which also calls both, is mocked away); see
 * `profile.route-arrival.test.tsx`'s header for why.
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
import { sessionRecord } from "@/test-support/session-record"
import type * as ReactRouterModule from "@tanstack/react-router"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type * as TenantModule from "@/lib/tenant"
import type { UserProfile } from "@/lib/tenant"

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
    const { withPlainLink } = await import("@/test-support/router-stubs")
    return withPlainLink(await importOriginal<typeof ReactRouterModule>())
  }
)

const { Route } = await import("@/routes/_dashboard/app")
const DashboardHome = routeComponent(Route)

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

const READY_PROFILE = cachedQueryResult(FIXTURE_PROFILE, false, { refetch })
const EMPTY_SESSIONS = cachedQueryResult([], false, { refetch })
const ONE_SESSION = [sessionRecord()]

function renderHome(
  profile: typeof profileResult,
  sessions: typeof sessionsResult
): void {
  profileResult = profile
  sessionsResult = sessions
  render(withQueryClient(<DashboardHome />))
}

const alert = (): Element | null => document.querySelector('[role="alert"]')

describe("DashboardHome: ProfileSummary read outcomes", () => {
  it("a failed profile read shows a failure affordance, not a stuck skeleton", async () => {
    renderHome(failedQueryResult({ refetch }), EMPTY_SESSIONS)

    await expectSomeFailureAffordance(document.body)
    expectRetryAffordanceTracksRetryable(document.body, true)
  })

  it("a stale cached profile with a failed refresh keeps showing it, with a visible refresh-failed signal", () => {
    renderHome(
      cachedQueryResult(FIXTURE_PROFILE, true, { refetch }),
      EMPTY_SESSIONS
    )

    expect(screen.getByText("Yuna")).toBeTruthy()
    expect(alert()).not.toBeNull()
  })
})

describe("DashboardHome: RecentSessions read outcomes", () => {
  it("a pending sessions read shows a loading placeholder, not 'No sessions yet'", () => {
    renderHome(READY_PROFILE, pendingQueryResult({ refetch }))

    expect(screen.queryByText(/no sessions yet/i)).toBeNull()
    expect(document.querySelectorAll(".animate-pulse").length).toBeGreaterThan(
      0
    )
  })

  it("a successful empty sessions read shows 'No sessions yet'", () => {
    renderHome(READY_PROFILE, EMPTY_SESSIONS)

    expect(screen.getByText(/no sessions yet/i)).toBeTruthy()
    expect(alert()).toBeNull()
  })

  it("a failed sessions read (after retries) shows a failure state, not the empty-state copy", async () => {
    renderHome(READY_PROFILE, failedQueryResult({ refetch }))

    expect(screen.queryByText(/no sessions yet/i)).toBeNull()
    await expectSomeFailureAffordance(document.body)
  })

  it("a successful nonempty sessions read renders the list", () => {
    renderHome(
      READY_PROFILE,
      cachedQueryResult(ONE_SESSION, false, { refetch })
    )

    expect(screen.getByText("Vocabulary warm-up")).toBeTruthy()
    expect(screen.queryByText(/no sessions yet/i)).toBeNull()
  })

  it("a stale cached list with a failed refresh keeps showing the list, with a visible refresh-failed signal", () => {
    renderHome(READY_PROFILE, cachedQueryResult(ONE_SESSION, true, { refetch }))

    expect(screen.getByText("Vocabulary warm-up")).toBeTruthy()
    expect(alert()).not.toBeNull()
  })
})
