/**
 * @vitest-environment jsdom
 *
 * G-2 (route-arrival handoff, r1): the player route's own `!session` branch
 * used to mean "not found" for both a genuine absence *and* a failed read
 * with no data (F-5). This asserts the three are now distinct: pending,
 * failed, and successful-null all render differently, and only the last one
 * says "Session not found."
 *
 * Renders `SessionPlayer` (the sessionId-prop component `$sessionId.tsx`
 * splits out for exactly this) rather than the route's own
 * `Route.useParams()`-driven component - see that file's header comment.
 */

import type { ReactNode } from "react"
import {
  expectRetryAffordanceTracksRetryable,
  expectSomeFailureAffordance,
  installFileHostSabotage,
} from "@/test-support/file-host-sabotage"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type * as ReactRouterModule from "@tanstack/react-router"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"

import { createDecorativeSession } from "@/lib/auth-session"

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

// `usePresenceLease` opens a study-nudge lease over `file_host` on mount;
// irrelevant to what this route renders for a read outcome, and would
// otherwise add its own requests to the same sabotaged `fetch`.
vi.mock("@/lib/study-nudge/use-presence-lease", () => ({
  usePresenceLease: (): undefined => undefined,
}))

const { SessionPlayer } = await import("./$sessionId")

beforeAll(() => {
  createDecorativeSession()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function withFreshQueryClient(children: ReactNode): ReactNode {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe("SessionPlayer: initial read outcomes", () => {
  it("renders the skeleton while pending", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {}))
    )

    render(withFreshQueryClient(<SessionPlayer sessionId="session-1" />))

    expect(document.querySelectorAll(".animate-pulse").length).toBeGreaterThan(
      0
    )
  })

  it("a failed read shows a failure affordance, not 'Session not found'", async () => {
    const restore = installFileHostSabotage("connection-refused")

    render(withFreshQueryClient(<SessionPlayer sessionId="session-1" />))

    await expectSomeFailureAffordance(document.body)
    expectRetryAffordanceTracksRetryable(document.body, true)
    expect(screen.queryByText("Session not found")).toBeNull()
    restore()
  })

  it("a successful null read (genuine absence) shows 'Session not found'", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response("null", { status: 200 })))
    )

    render(withFreshQueryClient(<SessionPlayer sessionId="session-1" />))

    await waitFor(() => {
      expect(screen.getByText("Session not found")).toBeTruthy()
    })
    expect(document.querySelector('[role="alert"]')).toBeNull()
  })

  it("a successful draft session renders the draft guard, not the skeleton or not-found", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              id: "session-1",
              name: "Vocabulary warm-up",
              status: "draft",
              activities: [],
              scenes: [],
              layoutMode: "basic",
              totalDurationMs: 0,
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
            }),
            { status: 200 }
          )
        )
      )
    )

    render(withFreshQueryClient(<SessionPlayer sessionId="session-1" />))

    await waitFor(() => {
      expect(
        screen.getByText("This session hasn't been started yet")
      ).toBeTruthy()
    })
    expect(screen.queryByText("Session not found")).toBeNull()
    expect(document.querySelector('[role="alert"]')).toBeNull()
  })
})
