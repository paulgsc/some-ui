/**
 * @vitest-environment jsdom
 *
 * #946/S2's own acceptance criteria for the migrated composer: the
 * double-submit regression (a thundering-herd concern the migration must
 * close, not just the failure-visibility one #939 already covers), the
 * honest middle-failure message for a new session's "Save & Play" chain,
 * and success-path behaviour preservation (same navigation targets, same
 * toast copy, lifted verbatim from the pre-migration `onSuccess` bodies).
 */

import type { JSX, ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type * as ReactRouterModule from "@tanstack/react-router"
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const navigateSpy = vi.fn()
const toastSpy = vi.fn()

vi.mock(
  "@tanstack/react-router",
  async (importOriginal): Promise<typeof ReactRouterModule> => {
    const actual = await importOriginal<typeof ReactRouterModule>()
    return { ...actual, useNavigate: () => navigateSpy }
  }
)

vi.mock("sonner", () => ({
  toast: Object.assign(
    (...args: Array<unknown>): void => {
      toastSpy(...args)
    },
    {
      error: (...args: Array<unknown>): void => {
        toastSpy("error", ...args)
      },
    }
  ),
}))

const { SessionComposer } = await import("./session-composer")

function withQueryClient(children: ReactNode): JSX.Element {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

type FetchCall = { method: string; url: string; body: unknown }

/** Reads `body.name` off a JSON-parsed request body without a bare type
 * assertion - `body` is `unknown` by construction (parsed from whatever the
 * test's own fetch mock was handed), and a mock is exactly the place a
 * malformed shape should degrade to a fallback rather than throw. */
function nameFrom(body: unknown): string {
  if (typeof body !== "object" || body === null || !("name" in body)) {
    return "untitled"
  }
  const { name } = body
  return typeof name === "string" ? name : "untitled"
}

/** A `global.fetch` stand-in that answers real session-shaped JSON for the
 * three routes this file's flows touch, and records every call so the
 * regression tests can count POSTs (creates) vs PATCHes (updates)
 * precisely - the whole point of the double-submit and middle-failure
 * assertions below. */
function installFileHostSuccess(options: { failPatch?: boolean }): {
  calls: Array<FetchCall>
  restore: () => void
} {
  const calls: Array<FetchCall> = []
  let createdCount = 0

  const impl: typeof fetch = async (input, init) => {
    const url = String(input)
    const method = init?.method ?? "GET"
    const body: unknown = init?.body ? JSON.parse(String(init.body)) : undefined
    calls.push({ method, url, body })

    if (
      method === "POST" &&
      url.includes("/sessions") &&
      !url.includes("duplicate")
    ) {
      createdCount += 1
      const record = {
        id: `session-${createdCount}`,
        name: nameFrom(body),
        status: "draft",
        activities: [],
        scenes: [],
        layoutMode: "basic",
        totalDurationMs: 0,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      }
      return new Response(JSON.stringify(record), { status: 200 })
    }

    if (method === "PATCH") {
      if (options.failPatch) {
        return new Response(
          JSON.stringify({
            error: { code: "internal_error", message: "boom" },
          }),
          { status: 500 }
        )
      }
      const sessionId = url.split("/sessions/")[1]
      return new Response(
        JSON.stringify({
          id: sessionId,
          name: "untitled",
          status: "active",
          activities: [],
          scenes: [],
          layoutMode: "basic",
          totalDurationMs: 0,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          startedAt: "2026-01-01T00:00:00.000Z",
        }),
        { status: 200 }
      )
    }

    // Anything else (the incidental migration/list check every test in
    // this file triggers just by importing lib/tenant/hooks.ts) fails as a
    // connection refused - handled gracefully by the production code (see
    // sessions-backend.ts's own afterReady/migration .catch).
    return Promise.reject(new TypeError("Failed to fetch"))
  }

  vi.stubGlobal("fetch", impl)
  return { calls, restore: () => vi.unstubAllGlobals() }
}

async function renderAtReviewStep(): Promise<void> {
  render(withQueryClient(<SessionComposer initialActivity="honeycomb" />))
  for (let i = 0; i < 3; i += 1) {
    const continueButton = screen.getByRole("button", { name: /continue/i })
    // eslint-disable-next-line @typescript-eslint/require-await -- act's async form is what flushes the microtask-queued mutation state update.
    await act(async () => {
      fireEvent.click(continueButton)
    })
  }
}

beforeEach(() => {
  navigateSpy.mockClear()
  toastSpy.mockClear()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("SessionComposer: Save & Play, new session - success path and regressions", () => {
  it("double-clicking Save & Play creates exactly one session (thundering-herd regression)", async () => {
    const { calls, restore } = installFileHostSuccess({})
    await renderAtReviewStep()

    const saveAndPlay = screen.getByRole("button", { name: /save.*play/i })
    // No `act`/`await` between the two clicks - the same fast-double-click
    // shape the pre-migration code corrupted data on (two clicks issued two
    // `createSession` calls, silently creating a duplicate session).
    act(() => {
      fireEvent.click(saveAndPlay)
      fireEvent.click(saveAndPlay)
    })

    await waitFor(() => {
      const posts = calls.filter(
        (c) => c.method === "POST" && c.url.includes("/sessions")
      )
      expect(posts).toHaveLength(1)
    })
    restore()
  })

  it("saves as draft: toast copy and navigation target unchanged from the pre-migration onSuccess", async () => {
    const { restore } = installFileHostSuccess({})
    await renderAtReviewStep()

    const saveDraft = screen.getByRole("button", { name: /save as draft/i })
    fireEvent.click(saveDraft)

    await waitFor(() => {
      expect(toastSpy).toHaveBeenCalledWith("Session saved as draft")
      expect(navigateSpy).toHaveBeenCalledWith({ to: "/sessions" })
    })
    restore()
  })

  it("save & play: navigates to the new session's player, no toast - unchanged from pre-migration", async () => {
    const { restore } = installFileHostSuccess({})
    await renderAtReviewStep()

    const saveAndPlay = screen.getByRole("button", { name: /save.*play/i })
    fireEvent.click(saveAndPlay)

    await waitFor(() => {
      expect(navigateSpy).toHaveBeenCalledWith({
        to: "/sessions/$sessionId",
        params: { sessionId: "session-1" },
      })
    })
    expect(toastSpy).not.toHaveBeenCalled()
    restore()
  })

  it("the middle failure (created, but couldn't start) is reported honestly, and no second session is created on retry", async () => {
    const { calls, restore } = installFileHostSuccess({ failPatch: true })
    await renderAtReviewStep()

    const saveAndPlay = screen.getByRole("button", { name: /save.*play/i })
    fireEvent.click(saveAndPlay)

    const alert = await screen.findByRole("alert")
    expect(alert.textContent).toContain("Session saved, but couldn't start it")
    // The chain never navigated - the failure is visible instead.
    expect(navigateSpy).not.toHaveBeenCalled()

    const postsBeforeRetry = calls.filter(
      (c) => c.method === "POST" && c.url.includes("/sessions")
    )
    expect(postsBeforeRetry).toHaveLength(1)

    fireEvent.click(screen.getByRole("button", { name: /try again/i }))

    await waitFor(() => {
      const patches = calls.filter((c) => c.method === "PATCH")
      expect(patches.length).toBeGreaterThanOrEqual(2)
    })

    const postsAfterRetry = calls.filter(
      (c) => c.method === "POST" && c.url.includes("/sessions")
    )
    const patches = calls.filter((c) => c.method === "PATCH")
    // Still exactly one session created; retry only re-ran the PATCH.
    expect(postsAfterRetry).toHaveLength(1)
    expect(patches.length).toBeGreaterThanOrEqual(2)
    restore()
  })
})
