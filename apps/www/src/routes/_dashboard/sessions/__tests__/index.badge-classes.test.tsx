/**
 * @vitest-environment jsdom
 *
 * `tests/session-viewport/sessions-badge-containment.spec.ts` mirrors this
 * route's classes as a static fixture; this asserts the real `SessionsRoute`
 * still ships them, so a regression fails here without a browser. jsdom has
 * no layout, so it cannot replace that spec's wrapping check.
 *
 * The `topik` fixture is the real catalog entry and config behind the
 * reported string "TOPIK Study: Beginner • 15 min"; `catalogWorstCase()` is
 * the real catalog's longest summary (`src/test-support/catalog-worst-case.ts`).
 */

import { catalogWorstCase } from "@/test-support/catalog-worst-case"
import { fakeQueryResult, withQueryClient } from "@/test-support/query-client"
import { routeComponent } from "@/test-support/router-stubs"
import { sessionRecord } from "@/test-support/session-record"
import type * as ReactRouterModule from "@tanstack/react-router"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type * as TenantModule from "@/lib/tenant"
import type { SessionRecord } from "@/lib/tenant"

const REPORTED_SESSION = sessionRecord({
  id: "session-1192",
  status: "completed",
  activities: [
    {
      activityId: "topik",
      config: { level: "beginner", durationMinutes: 15 },
    },
  ],
})

const worstCase = catalogWorstCase()
const WORST_CASE_SESSION: SessionRecord = {
  ...REPORTED_SESSION,
  id: "session-worst-case",
  activities: [{ activityId: worstCase.activityId, config: worstCase.config }],
}

vi.mock(
  "@tanstack/react-router",
  async (importOriginal): Promise<typeof ReactRouterModule> => {
    const { withPlainLink } = await import("@/test-support/router-stubs")
    return withPlainLink(await importOriginal<typeof ReactRouterModule>())
  }
)

// Mutated per test, so one mock serves both fixtures.
let sessionsFixture: Array<SessionRecord> = [REPORTED_SESSION]

vi.mock(
  "@/lib/tenant",
  async (importOriginal): Promise<typeof TenantModule> => {
    const actual = await importOriginal<typeof TenantModule>()
    return {
      ...actual,
      useSessions: () =>
        fakeQueryResult({ data: sessionsFixture, isLoading: false }),
    }
  }
)

const { Route } = await import("@/routes/_dashboard/sessions/index")
const SessionsRoute = routeComponent(Route)

afterEach(() => {
  cleanup()
  sessionsFixture = [REPORTED_SESSION]
})

describe("sessions list: the classes the badge-containment spec assumes", () => {
  it("the activity summary pill still carries max-w-full truncate", () => {
    render(withQueryClient(<SessionsRoute />))

    const badge = screen.getByText("TOPIK Study: Beginner • 15 min")
    expect(badge.className).toContain("max-w-full")
    expect(badge.className).toContain("truncate")
  })

  it("the status pill still carries whitespace-nowrap", () => {
    render(withQueryClient(<SessionsRoute />))

    // The "Completed" *section heading* (an <h2>) also matches this text -
    // disambiguated from the status Badge (a <div>) by tag.
    const badge = screen.getByText("Completed", { selector: "div" })
    expect(badge.className).toContain("whitespace-nowrap")
  })

  it("the real catalog's longest summary still carries max-w-full truncate", () => {
    sessionsFixture = [WORST_CASE_SESSION]
    render(withQueryClient(<SessionsRoute />))

    const badge = screen.getByText(worstCase.label)
    expect(badge.className).toContain("max-w-full")
    expect(badge.className).toContain("truncate")
  })

  it("the row still stacks on mobile and un-stacks at sm:", () => {
    render(withQueryClient(<SessionsRoute />))

    const checkbox = screen.getByRole("checkbox")
    const cardContent = checkbox.closest('[class*="flex-col"]')

    expect(cardContent).not.toBeNull()
    expect(cardContent?.className).toContain("flex-col")
    expect(cardContent?.className).toContain("sm:flex-row")
  })
})
