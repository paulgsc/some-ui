/**
 * @vitest-environment jsdom
 *
 * Bot review on this PR's own first head: `SessionsList`'s empty-list early
 * return ran before the `refreshError` banner, so a previously-successful
 * empty cache whose background refresh just failed rendered a confident
 * "No sessions yet" with no indication anything had gone wrong.
 */

import type { JSX, ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
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

const { Route } = await import("@/routes/_dashboard/sessions/index")
// eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- see sessions/index.test.tsx's identical assertion
const SessionsRoute = Route.options.component as () => JSX.Element

afterEach(() => {
  cleanup()
  refetch.mockClear()
})

function withQueryClient(children: ReactNode): JSX.Element {
  const client = new QueryClient()
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

function fakeResult(
  fields: Partial<ReturnType<typeof TenantModule.useSessions>>
): ReturnType<typeof TenantModule.useSessions> {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- stubbing TanStack Query's rich UseQueryResult with only the fields queryOutcome() reads; the real shape has no minimal constructor.
  return { refetch, ...fields } as ReturnType<typeof TenantModule.useSessions>
}

describe("SessionsRoute: an empty cached list through a failed refresh", () => {
  it("shows the refresh-failed banner alongside 'No sessions yet', not silently", () => {
    mockResult = fakeResult({
      data: [],
      isLoading: false,
      isError: true,
      error: new Error("refresh failed"),
    })

    render(withQueryClient(<SessionsRoute />))

    expect(screen.getByText("No sessions yet.")).toBeTruthy()
    expect(document.querySelector('[role="alert"]')).not.toBeNull()
  })

  it("still shows a plain 'No sessions yet' with no banner when the empty read has no refresh failure (sanity)", () => {
    mockResult = fakeResult({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
    })

    render(withQueryClient(<SessionsRoute />))

    expect(screen.getByText("No sessions yet.")).toBeTruthy()
    expect(document.querySelector('[role="alert"]')).toBeNull()
  })
})
