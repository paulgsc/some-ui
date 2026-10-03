/**
 * @vitest-environment jsdom
 *
 * Bot review on this PR's own head: when the sessions read failed for good,
 * Home's study card fell back to an empty list and said "nothing in
 * progress", offering Start over a session that was only unreadable.
 */

import type { JSX, ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type * as ReactRouterModule from "@tanstack/react-router"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
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

// An "apk" workspace, stubbed in the test build's profile; its cards are
// tested in @some-ui/aph, and only the study card is under test here.
vi.mock("@some-ui/aph", () => ({
  AphTodayCard: (): null => null,
  AphTodayEntries: (): null => null,
}))

const { Route } = await import("@/routes/_dashboard/_apk/today")
// eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- see sessions/index.test.tsx's identical assertion
const TodayRoute = Route.options.component as () => JSX.Element

afterEach(() => {
  cleanup()
  refetch.mockClear()
})

function withQueryClient(children: ReactNode): JSX.Element {
  return (
    <QueryClientProvider client={new QueryClient()}>
      {children}
    </QueryClientProvider>
  )
}

function fakeResult(
  fields: Partial<ReturnType<typeof TenantModule.useSessions>>
): ReturnType<typeof TenantModule.useSessions> {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- stubbing TanStack Query's rich UseQueryResult with only the fields queryOutcome() reads; the real shape has no minimal constructor.
  return { refetch, ...fields } as ReturnType<typeof TenantModule.useSessions>
}

describe("Home's study card", () => {
  it("says the sessions could not be read, and retries, rather than offering Start", () => {
    mockResult = fakeResult({
      data: undefined,
      isError: true,
      error: new Error("offline"),
    })

    render(withQueryClient(<TodayRoute />))

    expect(screen.getByText(/couldn’t read your sessions/)).toBeTruthy()
    expect(screen.queryByText("nothing in progress")).toBeNull()
    expect(screen.queryByText("Start")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Retry" }))
    expect(refetch).toHaveBeenCalledTimes(1)
  })

  it("offers Start only once the list is known to hold nothing in progress", () => {
    mockResult = fakeResult({ data: [], isError: false })

    render(withQueryClient(<TodayRoute />))

    expect(screen.getByText("nothing in progress")).toBeTruthy()
    expect(screen.getByText("Start")).toBeTruthy()
  })
})
