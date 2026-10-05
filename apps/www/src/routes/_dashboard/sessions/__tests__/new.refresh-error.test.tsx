/**
 * @vitest-environment jsdom
 *
 * `EditSessionRoute`'s `ready(draft, refreshError)` shape, as in
 * `$sessionId.refresh-error.test.tsx`. `SessionComposer` is rendered for
 * real: it is light enough to mount directly.
 */

import { cachedQueryResult, withQueryClient } from "@/test-support/query-client"
import { sessionRecord } from "@/test-support/session-record"
import { resetViewport, setViewport } from "@/test-support/viewport"
import type * as ReactRouterModule from "@tanstack/react-router"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type * as TenantModule from "@/lib/tenant"
import type { SessionRecord } from "@/lib/tenant"

const refetch = vi.fn()
let mockResult: ReturnType<typeof TenantModule.useSession>

vi.mock(
  "@/lib/tenant",
  async (importOriginal): Promise<typeof TenantModule> => {
    const actual = await importOriginal<typeof TenantModule>()
    return { ...actual, useSession: () => mockResult }
  }
)

vi.mock(
  "@tanstack/react-router",
  async (importOriginal): Promise<typeof ReactRouterModule> => {
    const { withPlainLink } = await import("@/test-support/router-stubs")
    return withPlainLink(await importOriginal<typeof ReactRouterModule>())
  }
)

const { EditSessionRoute } = await import("@/routes/_dashboard/sessions/new")

beforeEach(() => {
  setViewport(false)
})

afterEach(() => {
  cleanup()
  refetch.mockClear()
  resetViewport()
})

function renderRoute(data: SessionRecord | null, refreshFailed: boolean): void {
  mockResult = cachedQueryResult(data, refreshFailed, { refetch })
  render(withQueryClient(<EditSessionRoute sessionId="draft-1" />))
}

const alert = (): Element | null => document.querySelector('[role="alert"]')

describe("EditSessionRoute: a cached null through a failed refresh is not 'not found'", () => {
  it("shows a failure affordance, not 'Draft not found', when the cached null's own refresh just failed", () => {
    renderRoute(null, true)

    expect(alert()).not.toBeNull()
    expect(screen.queryByText("Draft not found")).toBeNull()
  })

  it("still shows 'Draft not found' for a cached null with no refresh failure (sanity)", () => {
    renderRoute(null, false)

    expect(screen.getByText("Draft not found")).toBeTruthy()
    expect(alert()).toBeNull()
  })
})

describe("EditSessionRoute: a cached non-null draft through a failed refresh is not silently stale", () => {
  it("shows a failure affordance alongside the composer, not in place of it", () => {
    renderRoute(sessionRecord({ id: "draft-1" }), true)

    expect(alert()).not.toBeNull()
    expect(screen.queryByText("Draft not found")).toBeNull()
    // The composer mounted: its first step always has Continue.
    expect(screen.getByRole("button", { name: /continue/i })).toBeTruthy()
  })

  it("shows no failure affordance with no refresh failure (sanity)", () => {
    renderRoute(sessionRecord({ id: "draft-1" }), false)

    expect(alert()).toBeNull()
    expect(screen.getByRole("button", { name: /continue/i })).toBeTruthy()
  })
})
