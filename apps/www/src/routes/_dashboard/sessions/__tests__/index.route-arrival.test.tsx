/**
 * @vitest-environment jsdom
 *
 * Gate 0 (route-arrival handoff, r1): the terminal TanStack state a failed,
 * uncached `GET /sessions` actually reaches, and what `SessionsRoute`
 * renders for it - not a mocked `{data, isLoading}` stub, but the real
 * `useSessions()` hook driven by a real `QueryClient` over a sabotaged
 * `global.fetch`, exactly like `index.intent.test.tsx`'s write-path sabotage
 * but for the route's own initial read.
 *
 * `useSessions` gates on `useHasDecorativeSession()` (see `lib/tenant/hooks.ts`),
 * so this file calls the real `createDecorativeSession()` rather than mocking
 * `@/lib/tenant` the way the other sessions/index test files do - mocking the
 * hook away would hide the exact defect under test.
 */

import type { JSX, ReactNode } from "react"
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
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- see index.test.tsx's identical stand-in
      Link: (({ children, ...props }: { children?: ReactNode }) => (
        <a {...props}>{children}</a>
      )) as typeof ReactRouterModule.Link,
    }
  }
)

const { Route } = await import("@/routes/_dashboard/sessions/index")
// eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- see index.test.tsx's identical assertion
const SessionsRoute = Route.options.component as () => JSX.Element

beforeAll(() => {
  createDecorativeSession()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

/** No retries - what matters here is the pending -> terminal transition
 * itself, not how many attempts TanStack spends getting there (that's
 * `providers/tanstack-query.tsx`'s `retry: 3`, unrelated to this defect). */
function withFreshQueryClient(children: ReactNode): JSX.Element {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

function neverSettlingFetch(): typeof fetch {
  return vi.fn(() => new Promise<Response>(() => {}))
}

describe("SessionsRoute: initial read outcomes (route-arrival Gate 0/G-1/G-2)", () => {
  it("renders the skeleton while the read is still pending", () => {
    vi.stubGlobal("fetch", neverSettlingFetch())

    render(withFreshQueryClient(<SessionsRoute />))

    expect(document.querySelectorAll(".animate-pulse").length).toBe(3)
  })

  it("G-0a: a failed uncached read must not still be showing the skeleton once it has settled", async () => {
    const restore = installFileHostSabotage("connection-refused")

    render(withFreshQueryClient(<SessionsRoute />))

    // Let the query actually settle to its terminal state before asserting -
    // this is the real `isError`/`data`/`isLoading` transition, not an
    // assumption about timing.
    await waitFor(() => {
      expect(document.querySelectorAll(".animate-pulse").length).toBe(0)
    })

    // The bug this gate exists to catch: `isLoading || !sessions` stays true
    // forever once `isLoading` goes false and `sessions` is still undefined,
    // so pre-fix this assertion is what fails - the skeleton is gone from
    // the DOM query above only because nothing else re-renders it, not
    // because the route noticed the failure.
    await expectSomeFailureAffordance(document.body)
    expectRetryAffordanceTracksRetryable(document.body, true)
    restore()
  })

  it("a non-retryable read failure (feature not configured) shows no dead retry control", async () => {
    const restore = installFileHostSabotage("not-configured")

    render(withFreshQueryClient(<SessionsRoute />))

    await expectSomeFailureAffordance(document.body)
    expectRetryAffordanceTracksRetryable(document.body, false)
    restore()
  })

  it("retrying a failed read recovers to the ready list once the transport heals", async () => {
    const restore = installFileHostSabotage("connection-refused")
    render(withFreshQueryClient(<SessionsRoute />))
    await expectSomeFailureAffordance(document.body)

    restore()
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify([
              {
                id: "session-1",
                name: "Vocabulary warm-up",
                status: "draft",
                activities: [],
                scenes: [],
                layoutMode: "basic",
                totalDurationMs: 0,
                createdAt: "2026-01-01T00:00:00.000Z",
                updatedAt: "2026-01-01T00:00:00.000Z",
              },
            ]),
            { status: 200 }
          )
        )
      )
    )

    screen.getByRole("button", { name: /try again/i }).click()

    await waitFor(() => {
      expect(screen.getByText("Vocabulary warm-up")).toBeTruthy()
    })
  })

  it("a successful empty read shows the empty state, not the skeleton and not a failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(new Response(JSON.stringify([]), { status: 200 }))
      )
    )

    render(withFreshQueryClient(<SessionsRoute />))

    await waitFor(() => {
      expect(screen.getByText("No sessions yet.")).toBeTruthy()
    })
    expect(document.querySelectorAll(".animate-pulse").length).toBe(0)
    expect(document.querySelector('[role="alert"]')).toBeNull()
  })

  it("a never-settling read stays pending rather than falsely resolving to empty or failed", async () => {
    vi.stubGlobal("fetch", neverSettlingFetch())

    render(withFreshQueryClient(<SessionsRoute />))
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(document.querySelectorAll(".animate-pulse").length).toBe(3)
    expect(screen.queryByText("No sessions yet.")).toBeNull()
    expect(document.querySelector('[role="alert"]')).toBeNull()
  })
})
