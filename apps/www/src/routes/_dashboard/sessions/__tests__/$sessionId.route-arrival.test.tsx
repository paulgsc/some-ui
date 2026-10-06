/**
 * @vitest-environment jsdom
 *
 * The player route's pending, failed and successful-null reads render
 * differently, and only the last says "Session not found." Renders
 * `SessionPlayer`, the sessionId-prop component `$sessionId.tsx` splits out.
 */

import {
  expectRetryAffordanceTracksRetryable,
  expectSomeFailureAffordance,
  installFileHostSabotage,
} from "@/test-support/file-host-sabotage"
import { withQueryClient } from "@/test-support/query-client"
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

// `usePresenceLease` would add its own requests to the sabotaged `fetch`.
vi.mock("@/lib/study-nudge/use-presence-lease", () => ({
  usePresenceLease: (): undefined => undefined,
}))

const { SessionPlayer } = await import(
  "@/routes/_dashboard/sessions/$sessionId"
)

beforeAll(() => {
  markSignedIn()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const renderPlayer = (): void => {
  render(withQueryClient(<SessionPlayer sessionId="session-1" />))
}

describe("SessionPlayer: initial read outcomes", () => {
  it("renders the skeleton while pending", () => {
    vi.stubGlobal("fetch", hangingFetch())

    renderPlayer()

    expect(document.querySelectorAll(".animate-pulse").length).toBeGreaterThan(
      0
    )
  })

  it("a failed read shows a failure affordance, not 'Session not found'", async () => {
    const restore = installFileHostSabotage("connection-refused")

    renderPlayer()

    await expectSomeFailureAffordance(document.body)
    expectRetryAffordanceTracksRetryable(document.body, true)
    expect(screen.queryByText("Session not found")).toBeNull()
    restore()
  })

  it("a successful null read (genuine absence) shows 'Session not found'", async () => {
    vi.stubGlobal("fetch", jsonFetch(null))

    renderPlayer()

    await waitFor(() => {
      expect(screen.getByText("Session not found")).toBeTruthy()
    })
    expect(document.querySelector('[role="alert"]')).toBeNull()
  })

  it("a successful draft session renders the draft guard, not the skeleton or not-found", async () => {
    vi.stubGlobal("fetch", jsonFetch(sessionRecord()))

    renderPlayer()

    await waitFor(() => {
      expect(
        screen.getByText("This session hasn't been started yet")
      ).toBeTruthy()
    })
    expect(screen.queryByText("Session not found")).toBeNull()
    expect(document.querySelector('[role="alert"]')).toBeNull()
  })
})
