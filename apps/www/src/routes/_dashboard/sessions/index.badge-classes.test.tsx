/**
 * @vitest-environment jsdom
 *
 * #1193's own review flagged that `tests/session-viewport/
 * sessions-badge-containment.spec.ts` mirrors this route's classes as a
 * hand-written static fixture, so it stays green even if the real
 * `whitespace-nowrap`/row-stacking classes it mirrors are later removed
 * from this file - a synchronization gap between the geometry proof and the
 * production component it's proving something about.
 *
 * This is the other half: renders the *real*, current `SessionsRoute`
 * (`@tanstack/react-router` and `@/lib/tenant` mocked exactly as
 * `index.test.tsx` does, unmodified from there) and asserts the actual
 * rendered classNames directly, so a regression here fails immediately,
 * fast, with no browser - not silently, three commits later, in a Playwright
 * fixture nobody thought to re-check. jsdom computes no real layout, so it
 * can't stand in for `sessions-badge-containment.spec.ts`'s own job (does
 * this text actually wrap in a real browser); it can only prove the classes
 * that spec assumes are still the classes this component actually ships.
 *
 * The activity fixture (`topik`, `{ level: "beginner", durationMinutes: 15 }`)
 * isn't arbitrary - it's the real catalog entry and config that produce
 * #1192's exact reported string ("TOPIK Study: Beginner • 15 min") through
 * the real `summarizeConfig`, not a hand-typed lookalike. A second fixture
 * below uses `catalogWorstCase()` - a live build (not this repo's tests)
 * found that `whitespace-nowrap` alone still overflows a long enough real
 * summary, which is why the activity pill's class changed again, to
 * `max-w-full truncate` (see `src/test-support/catalog-worst-case.ts` for
 * why that's computed from the real catalog rather than hand-typed).
 */

import type { JSX, ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type * as ReactRouterModule from "@tanstack/react-router"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type * as TenantModule from "@/lib/tenant"
import type { SessionRecord } from "@/lib/tenant"
import { catalogWorstCase } from "@/test-support/catalog-worst-case"

const REPORTED_SESSION: SessionRecord = {
  id: "session-1192",
  name: "Vocabulary warm-up",
  status: "completed",
  activities: [
    {
      activityId: "topik",
      config: { level: "beginner", durationMinutes: 15 },
    },
  ],
  scenes: [],
  layoutMode: "basic",
  totalDurationMs: 0,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
}

const worstCase = catalogWorstCase()
const WORST_CASE_SESSION: SessionRecord = {
  ...REPORTED_SESSION,
  id: "session-worst-case",
  activities: [
    { activityId: worstCase.activityId, config: worstCase.config },
  ],
}

vi.mock(
  "@tanstack/react-router",
  async (importOriginal): Promise<typeof ReactRouterModule> => {
    const actual = await importOriginal<typeof ReactRouterModule>()
    return {
      ...actual,
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- LinkComponent's real signature is generic over the whole route tree; a plain <a> stand-in has no narrower match.
      Link: (({ children, ...props }: { children?: ReactNode }) => (
        <a {...props}>{children}</a>
      )) as typeof ReactRouterModule.Link,
    }
  }
)

// Mutated per-test (see `renderWith` below) rather than fixed at mock-setup
// time, so this one mock can serve both the reported-string fixture and the
// catalog-worst-case fixture without a second render harness.
let sessionsFixture: Array<SessionRecord> = [REPORTED_SESSION]

vi.mock(
  "@/lib/tenant",
  async (importOriginal): Promise<typeof TenantModule> => {
    const actual = await importOriginal<typeof TenantModule>()
    return {
      ...actual,
      useSessions: () =>
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- stubbing TanStack Query's rich UseQueryResult with the two fields this route actually reads; the real shape has no minimal constructor.
        ({ data: sessionsFixture, isLoading: false }) as ReturnType<
          typeof TenantModule.useSessions
        >,
    }
  }
)

const { Route } = await import("./index")
// eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- createFileRoute's Route.options.component is typed broader than the concrete component this file actually registered; there is no narrower accessor.
const SessionsRoute = Route.options.component as () => JSX.Element

function withQueryClient(children: ReactNode): JSX.Element {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

afterEach(() => {
  cleanup()
  sessionsFixture = [REPORTED_SESSION]
})

describe("sessions list: the classes #1193's geometry fixture assumes", () => {
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
