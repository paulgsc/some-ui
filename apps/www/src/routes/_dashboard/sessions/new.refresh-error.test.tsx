/**
 * @vitest-environment jsdom
 *
 * Same bot-review finding as `$sessionId.refresh-error.test.tsx`, for
 * `EditSessionRoute`'s identical `ready(null, refreshError)` shape.
 */

import type { ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type * as ReactRouterModule from "@tanstack/react-router"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type * as TenantModule from "@/lib/tenant"

const refetch = vi.fn()
let mockResult: ReturnType<typeof TenantModule.useSession>

vi.mock(
  "@/lib/tenant",
  async (importOriginal): Promise<typeof TenantModule> => {
    const actual = await importOriginal<typeof TenantModule>()
    return { ...actual, useSession: () => mockResult }
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

const { EditSessionRoute } = await import("./new")

afterEach(() => {
  cleanup()
  refetch.mockClear()
})

function withQueryClient(children: ReactNode): ReactNode {
  const client = new QueryClient()
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

function fakeResult(
  fields: Partial<ReturnType<typeof TenantModule.useSession>>
): ReturnType<typeof TenantModule.useSession> {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- stubbing TanStack Query's rich UseQueryResult with only the fields queryOutcome() reads; the real shape has no minimal constructor.
  return { refetch, ...fields } as ReturnType<typeof TenantModule.useSession>
}

describe("EditSessionRoute: a cached null through a failed refresh is not 'not found'", () => {
  it("shows a failure affordance, not 'Draft not found', when the cached null's own refresh just failed", () => {
    mockResult = fakeResult({
      data: null,
      isLoading: false,
      isError: true,
      error: new Error("refresh failed"),
    })

    render(withQueryClient(<EditSessionRoute sessionId="draft-1" />))

    expect(document.querySelector('[role="alert"]')).not.toBeNull()
    expect(screen.queryByText("Draft not found")).toBeNull()
  })

  it("still shows 'Draft not found' for a cached null with no refresh failure (sanity)", () => {
    mockResult = fakeResult({
      data: null,
      isLoading: false,
      isError: false,
      error: null,
    })

    render(withQueryClient(<EditSessionRoute sessionId="draft-1" />))

    expect(screen.getByText("Draft not found")).toBeTruthy()
    expect(document.querySelector('[role="alert"]')).toBeNull()
  })
})
