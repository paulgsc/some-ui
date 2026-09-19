/**
 * @vitest-environment jsdom
 *
 * G-2 (route-arrival handoff, r1): `new.tsx`'s edit-draft path has the same
 * defect family as `$sessionId.tsx` (F-5) - `!session` meant "not found" for
 * both a genuine absence and a failed read. Asserts the three are distinct.
 *
 * Renders `EditSessionRoute` directly (now exported by `new.tsx` for exactly
 * this) rather than `NewSessionRoute`, which needs `Route.useSearch()`.
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

const { EditSessionRoute } = await import("./new")

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

describe("EditSessionRoute: initial read outcomes", () => {
  it("renders the composer skeleton while pending", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {}))
    )

    render(withFreshQueryClient(<EditSessionRoute sessionId="draft-1" />))

    expect(document.querySelectorAll(".animate-pulse").length).toBeGreaterThan(
      0
    )
  })

  it("a failed read shows a failure affordance, not 'Draft not found'", async () => {
    const restore = installFileHostSabotage("connection-refused")

    render(withFreshQueryClient(<EditSessionRoute sessionId="draft-1" />))

    await expectSomeFailureAffordance(document.body)
    expectRetryAffordanceTracksRetryable(document.body, true)
    expect(screen.queryByText("Draft not found")).toBeNull()
    restore()
  })

  it("a successful null read (genuine absence) shows 'Draft not found'", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response("null", { status: 200 })))
    )

    render(withFreshQueryClient(<EditSessionRoute sessionId="draft-1" />))

    await waitFor(() => {
      expect(screen.getByText("Draft not found")).toBeTruthy()
    })
    expect(document.querySelector('[role="alert"]')).toBeNull()
  })
})
