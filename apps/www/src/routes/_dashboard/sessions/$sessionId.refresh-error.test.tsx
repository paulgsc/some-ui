/**
 * @vitest-environment jsdom
 *
 * Bot review on this PR's own first head: `SessionPlayer`'s `ready` arm
 * discarded `refreshError` and rendered a confident "Session not found" for
 * a cached `null` whose background refresh had actually failed - the same
 * Safety-invariant violation the `failed` arm exists to avoid, just reached
 * through the `ready(null, refreshError)` shape instead of `failed` itself.
 *
 * A second bot review, one round later, caught the mirror gap: the *non-null*
 * branches (draft guard, live player) discarded `refreshError` just as
 * confidently, mounting stale cached content with no warning at all. `Live
 * Player` is mocked here rather than rendered for real - no test in this repo
 * mounts the real one (it drives the app-wide mock orchestrator, several
 * media hooks, and half a dozen child components), and what this file is
 * actually asserting is `SessionPlayer`'s own branching decision, not
 * anything `LivePlayer` itself renders.
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
import type { SessionRecord } from "@/lib/tenant"

vi.mock("@/components/player/live-player", () => ({
  LivePlayer: ({ session }: { session: SessionRecord }): JSX.Element => (
    <div data-testid="live-player-stub">{session.id}</div>
  ),
}))

const refetch = vi.fn()
let mockResult: ReturnType<typeof TenantModule.useSession>

function fakeSession(status: SessionRecord["status"]): SessionRecord {
  return {
    id: "session-1",
    name: "Vocabulary warm-up",
    status,
    activities: [],
    scenes: [],
    layoutMode: "basic",
    totalDurationMs: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  }
}

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

describe("SessionPlayer: a cached non-null session through a failed refresh is not silently stale", () => {
  it("shows a failure affordance alongside the draft guard, not in place of it", () => {
    mockResult = fakeResult({
      data: fakeSession("draft"),
      isLoading: false,
      isError: true,
      error: new Error("refresh failed"),
    })

    render(withQueryClient(<SessionPlayer sessionId="session-1" />))

    expect(document.querySelector('[role="alert"]')).not.toBeNull()
    expect(
      screen.getByText("This session hasn't been started yet")
    ).toBeTruthy()
  })

  it("shows a failure affordance alongside the live player, not in place of it", () => {
    mockResult = fakeResult({
      data: fakeSession("active"),
      isLoading: false,
      isError: true,
      error: new Error("refresh failed"),
    })

    render(withQueryClient(<SessionPlayer sessionId="session-1" />))

    expect(document.querySelector('[role="alert"]')).not.toBeNull()
    expect(screen.getByTestId("live-player-stub")).toBeTruthy()
  })

  it("shows neither the draft guard's nor the live player's refresh banner with no refresh failure (sanity)", () => {
    mockResult = fakeResult({
      data: fakeSession("active"),
      isLoading: false,
      isError: false,
      error: null,
    })

    render(withQueryClient(<SessionPlayer sessionId="session-1" />))

    expect(document.querySelector('[role="alert"]')).toBeNull()
    expect(screen.getByTestId("live-player-stub")).toBeTruthy()
  })
})
