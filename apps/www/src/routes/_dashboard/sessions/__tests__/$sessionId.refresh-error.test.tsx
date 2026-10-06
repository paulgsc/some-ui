/**
 * @vitest-environment jsdom
 *
 * `SessionPlayer`'s `ready` arm must not drop `refreshError`: a cached `null`
 * whose refresh failed is not "Session not found" (the Safety invariant the
 * `failed` arm exists for), and cached content through a failed refresh
 * carries a warning.
 *
 * `LivePlayer` is mocked: this asserts `SessionPlayer`'s own branching, and
 * the real player drives the app-wide orchestrator and media hooks.
 * `useSession` is mocked directly, since reaching "cached `null`, latest
 * refetch errored" through a real cache needs a multi-phase fetch sequence
 * (see `profile.route-arrival.test.tsx`'s header).
 */

import type { JSX } from "react"
import { cachedQueryResult, withQueryClient } from "@/test-support/query-client"
import { sessionRecord } from "@/test-support/session-record"
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
    const { withPlainLink } = await import("@/test-support/router-stubs")
    return withPlainLink(await importOriginal<typeof ReactRouterModule>())
  }
)

const { SessionPlayer } = await import(
  "@/routes/_dashboard/sessions/$sessionId"
)

afterEach(() => {
  cleanup()
  refetch.mockClear()
})

function renderPlayer(
  data: SessionRecord | null,
  refreshFailed: boolean
): void {
  mockResult = cachedQueryResult(data, refreshFailed, { refetch })
  render(withQueryClient(<SessionPlayer sessionId="session-1" />))
}

const alert = (): Element | null => document.querySelector('[role="alert"]')

describe("SessionPlayer: a cached null through a failed refresh is not 'not found'", () => {
  it("shows a failure affordance, not 'Session not found', when the cached null's own refresh just failed", () => {
    renderPlayer(null, true)

    expect(alert()).not.toBeNull()
    expect(screen.queryByText("Session not found")).toBeNull()
  })

  it("still shows 'Session not found' for a cached null with no refresh failure (sanity)", () => {
    renderPlayer(null, false)

    expect(screen.getByText("Session not found")).toBeTruthy()
    expect(alert()).toBeNull()
  })
})

describe("SessionPlayer: a cached non-null session through a failed refresh is not silently stale", () => {
  it("shows a failure affordance alongside the draft guard, not in place of it", () => {
    renderPlayer(sessionRecord({ status: "draft" }), true)

    expect(alert()).not.toBeNull()
    expect(
      screen.getByText("This session hasn't been started yet")
    ).toBeTruthy()
  })

  it.each([
    {
      refreshFailed: true,
      title:
        "shows a failure affordance alongside the live player, not in place of it",
    },
    {
      refreshFailed: false,
      title:
        "shows neither the draft guard's nor the live player's refresh banner with no refresh failure (sanity)",
    },
  ])("$title", ({ refreshFailed }) => {
    renderPlayer(sessionRecord({ status: "active" }), refreshFailed)

    expect(alert() !== null).toBe(refreshFailed)
    expect(screen.getByTestId("live-player-stub")).toBeTruthy()
  })
})
