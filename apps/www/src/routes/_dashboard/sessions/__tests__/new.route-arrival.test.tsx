/**
 * @vitest-environment jsdom
 *
 * `new.tsx`'s edit-draft path tells pending, failed and successful-null reads
 * apart. Renders `EditSessionRoute` directly (`NewSessionRoute` needs
 * `Route.useSearch()`).
 */

import {
  expectRetryAffordanceTracksRetryable,
  expectSomeFailureAffordance,
  installFileHostSabotage,
} from "@/test-support/file-host-sabotage"
import { withQueryClient } from "@/test-support/query-client"
import { hangingFetch, jsonFetch } from "@/test-support/session-record"
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

const { EditSessionRoute } = await import("@/routes/_dashboard/sessions/new")

beforeAll(() => {
  markSignedIn()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const renderRoute = (): void => {
  render(withQueryClient(<EditSessionRoute sessionId="draft-1" />))
}

describe("EditSessionRoute: initial read outcomes", () => {
  it("renders the composer skeleton while pending", () => {
    vi.stubGlobal("fetch", hangingFetch())

    renderRoute()

    expect(document.querySelectorAll(".animate-pulse").length).toBeGreaterThan(
      0
    )
  })

  it("a failed read shows a failure affordance, not 'Draft not found'", async () => {
    const restore = installFileHostSabotage("connection-refused")

    renderRoute()

    await expectSomeFailureAffordance(document.body)
    expectRetryAffordanceTracksRetryable(document.body, true)
    expect(screen.queryByText("Draft not found")).toBeNull()
    restore()
  })

  it("a successful null read (genuine absence) shows 'Draft not found'", async () => {
    vi.stubGlobal("fetch", jsonFetch(null))

    renderRoute()

    await waitFor(() => {
      expect(screen.getByText("Draft not found")).toBeTruthy()
    })
    expect(document.querySelector('[role="alert"]')).toBeNull()
  })
})
