/**
 * @vitest-environment jsdom
 *
 * #946/S2: `duplicateSession` migrated to `useIntent` - success target
 * unchanged (navigate to the composer with the copy), and a failure is now
 * visible instead of the button just re-enabling silently.
 */

import type { JSX, ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type * as ReactRouterModule from "@tanstack/react-router"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { SessionRecord } from "@/lib/tenant"

const navigateSpy = vi.fn()

vi.mock(
  "@tanstack/react-router",
  async (importOriginal): Promise<typeof ReactRouterModule> => {
    const actual = await importOriginal<typeof ReactRouterModule>()
    return {
      ...actual,
      useNavigate: () => navigateSpy,
      // Test stand-in for tanstack-router's Link - href is irrelevant here.
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- LinkComponent's real signature is generic over the whole route tree; a plain <a> stand-in has no narrower match.
      Link: ((props: { children?: ReactNode }) => (
        <a href="/sessions">{props.children}</a>
      )) as typeof ReactRouterModule.Link,
    }
  }
)

const { CompletionSummary } = await import("./completion-summary")

function withQueryClient(children: ReactNode): JSX.Element {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

function fixtureSession(): SessionRecord {
  return {
    id: "session-1",
    name: "Vocabulary warm-up",
    status: "completed",
    activities: [],
    scenes: [],
    layoutMode: "basic",
    totalDurationMs: 60_000,
    finalElapsedMs: 60_000,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  }
}

beforeEach(() => {
  navigateSpy.mockClear()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("CompletionSummary: Play again", () => {
  it("navigates to the composer with the duplicated draft on success - unchanged from pre-migration", async () => {
    const impl: typeof fetch = async (input, init) => {
      const url = String(input)
      if (init?.method === "POST" && url.includes("duplicate")) {
        return new Response(
          JSON.stringify({
            id: "session-2",
            name: "Vocabulary warm-up (copy)",
          }),
          { status: 200 }
        )
      }
      return Promise.reject(new TypeError("Failed to fetch"))
    }
    vi.stubGlobal("fetch", impl)

    render(withQueryClient(<CompletionSummary session={fixtureSession()} />))

    fireEvent.click(screen.getByRole("button", { name: /play again/i }))
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20))
    })

    expect(navigateSpy).toHaveBeenCalledWith({
      to: "/sessions/new",
      search: { edit: "session-2" },
    })
  })

  it("shows a visible, actionable failure instead of silently re-enabling", async () => {
    vi.stubGlobal("fetch", async () =>
      Promise.reject(new TypeError("Failed to fetch"))
    )

    render(withQueryClient(<CompletionSummary session={fixtureSession()} />))

    fireEvent.click(screen.getByRole("button", { name: /play again/i }))
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20))
    })

    expect(screen.getByRole("alert")).toBeTruthy()
    expect(navigateSpy).not.toHaveBeenCalled()
  })
})
