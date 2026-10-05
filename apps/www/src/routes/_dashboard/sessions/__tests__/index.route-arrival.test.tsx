/**
 * @vitest-environment jsdom
 *
 * The terminal state a failed, uncached `GET /sessions` reaches, and what
 * `SessionsRoute` renders for it: the real `useSessions()` over a real
 * `QueryClient` and a sabotaged `fetch`, not a stub. `useSessions` gates on
 * the session, so this calls the real `markSignedIn()` rather than mocking
 * `@/lib/tenant`, which would hide the defect under test.
 */

import {
  expectRetryAffordanceTracksRetryable,
  expectSomeFailureAffordance,
  installFileHostSabotage,
} from "@/test-support/file-host-sabotage"
import { withQueryClient } from "@/test-support/query-client"
import { routeComponent } from "@/test-support/router-stubs"
import {
  hangingFetch,
  jsonFetch,
  sessionRecord,
} from "@/test-support/session-record"
import type * as ReactRouterModule from "@tanstack/react-router"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"

import { markSignedIn } from "@/lib/auth"

vi.mock(
  "@tanstack/react-router",
  async (importOriginal): Promise<typeof ReactRouterModule> => {
    const { withPlainLink } = await import("@/test-support/router-stubs")
    return withPlainLink(await importOriginal<typeof ReactRouterModule>())
  }
)

const { Route } = await import("@/routes/_dashboard/sessions/index")
const SessionsRoute = routeComponent(Route)

beforeAll(() => {
  markSignedIn()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

const renderRoute = (): void => {
  render(withQueryClient(<SessionsRoute />))
}

const skeletons = (): number =>
  document.querySelectorAll(".animate-pulse").length

describe("SessionsRoute: initial read outcomes", () => {
  it("renders the skeleton while the read is still pending", () => {
    vi.stubGlobal("fetch", hangingFetch())

    renderRoute()

    expect(skeletons()).toBe(3)
  })

  it("a failed uncached read must not still be showing the skeleton once it has settled", async () => {
    const restore = installFileHostSabotage("connection-refused")

    renderRoute()

    await waitFor(() => {
      expect(skeletons()).toBe(0)
    })
    // `isLoading || !sessions` would stay true with `sessions` undefined: the
    // route must notice the failure, not just stop rendering the skeleton.
    await expectSomeFailureAffordance(document.body)
    expectRetryAffordanceTracksRetryable(document.body, true)
    restore()
  })

  it("a non-retryable read failure (feature not configured) shows no dead retry control", async () => {
    const restore = installFileHostSabotage("not-configured")

    renderRoute()

    await expectSomeFailureAffordance(document.body)
    expectRetryAffordanceTracksRetryable(document.body, false)
    restore()
  })

  it("retrying a failed read recovers to the ready list once the transport heals", async () => {
    const restore = installFileHostSabotage("connection-refused")
    renderRoute()
    await expectSomeFailureAffordance(document.body)

    restore()
    vi.stubGlobal("fetch", jsonFetch([sessionRecord()]))

    screen.getByRole("button", { name: /try again/i }).click()

    await waitFor(() => {
      expect(screen.getByText("Vocabulary warm-up")).toBeTruthy()
    })
  })

  it("a successful empty read shows the empty state, not the skeleton and not a failure", async () => {
    vi.stubGlobal("fetch", jsonFetch([]))

    renderRoute()

    await waitFor(() => {
      expect(screen.getByText("No sessions yet.")).toBeTruthy()
    })
    expect(skeletons()).toBe(0)
    expect(document.querySelector('[role="alert"]')).toBeNull()
  })

  it("a never-settling read stays pending rather than falsely resolving to empty or failed", async () => {
    vi.stubGlobal("fetch", hangingFetch())

    renderRoute()
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(skeletons()).toBe(3)
    expect(screen.queryByText("No sessions yet.")).toBeNull()
    expect(document.querySelector('[role="alert"]')).toBeNull()
  })
})
