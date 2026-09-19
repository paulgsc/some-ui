/**
 * @vitest-environment jsdom
 *
 * Bot review on this PR's own first head: `SessionPlayer`'s `ready` arm
 * discarded `refreshError` and rendered a confident "Session not found" for
 * a cached `null` whose background refresh had actually failed - the same
 * Safety-invariant violation the `failed` arm exists to avoid, just reached
 * through the `ready(null, refreshError)` shape instead of `failed` itself.
 *
 * `useSession` is mocked directly (a `UseQueryResult` stub) rather than
 * driven through a real query + sabotaged fetch - reaching this exact state
 * (cached `null`, latest refetch errored) through the real cache lifecycle
 * needs a multi-phase fetch/refetch sequence that would obscure the one
 * property under test; see `profile.route-arrival.test.tsx`'s header for
 * the same tradeoff made explicitly elsewhere in this PR.
 */

import type { JSX, ReactNode } from "react"
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

vi.mock("@/lib/study-nudge/use-presence-lease", () => ({
  usePresenceLease: (): undefined => undefined,
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

const { SessionPlayer } = await import("./$sessionId")

afterEach(() => {
  cleanup()
  refetch.mockClear()
})

function withQueryClient(children: ReactNode): JSX.Element {
  const client = new QueryClient()
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

function fakeResult(
  fields: Partial<ReturnType<typeof TenantModule.useSession>>
): ReturnType<typeof TenantModule.useSession> {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- stubbing TanStack Query's rich UseQueryResult with only the fields queryOutcome() reads; the real shape has no minimal constructor.
  return { refetch, ...fields } as ReturnType<typeof TenantModule.useSession>
}

describe("SessionPlayer: a cached null through a failed refresh is not 'not found'", () => {
  it("shows a failure affordance, not 'Session not found', when the cached null's own refresh just failed", () => {
    mockResult = fakeResult({
      data: null,
      isLoading: false,
      isError: true,
      error: new Error("refresh failed"),
    })

    render(withQueryClient(<SessionPlayer sessionId="session-1" />))

    expect(document.querySelector('[role="alert"]')).not.toBeNull()
    expect(screen.queryByText("Session not found")).toBeNull()
  })

  it("still shows 'Session not found' for a cached null with no refresh failure (sanity)", () => {
    mockResult = fakeResult({
      data: null,
      isLoading: false,
      isError: false,
      error: null,
    })

    render(withQueryClient(<SessionPlayer sessionId="session-1" />))

    expect(screen.getByText("Session not found")).toBeTruthy()
    expect(document.querySelector('[role="alert"]')).toBeNull()
  })
})
