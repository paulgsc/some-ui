/**
 * @vitest-environment jsdom
 *
 * The phone's way into the composer. The Android app has no Home, so its
 * sessions list is the only place a new session can start: the empty list
 * had a link, and a list with sessions in it had none, so the first
 * session composed on the phone was also the last.
 */

import type { JSX, ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type * as ReactRouterModule from "@tanstack/react-router"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type * as BuildProfileModule from "@/lib/build-profile"
import type * as TenantModule from "@/lib/tenant"
import type { SessionRecord } from "@/lib/tenant"

const listed = vi.hoisted(() => {
  const state: { sessions: Array<SessionRecord> } = { sessions: [] }
  return state
})

vi.mock(
  "@/lib/build-profile",
  async (importOriginal): Promise<typeof BuildProfileModule> => ({
    ...(await importOriginal<typeof BuildProfileModule>()),
    MOBILE_APP: true,
  })
)

vi.mock(
  "@tanstack/react-router",
  async (importOriginal): Promise<typeof ReactRouterModule> => {
    const actual = await importOriginal<typeof ReactRouterModule>()
    return {
      ...actual,
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- LinkComponent's real signature is generic over the whole route tree; a plain <a> stand-in has no narrower match.
      Link: (({ children, to }: { children?: ReactNode; to?: string }) => (
        <a href={to}>{children}</a>
      )) as typeof ReactRouterModule.Link,
    }
  }
)

vi.mock(
  "@/lib/tenant",
  async (importOriginal): Promise<typeof TenantModule> => ({
    ...(await importOriginal<typeof TenantModule>()),
    useSessions: () =>
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- stubbing TanStack Query's rich UseQueryResult with the one field this route reads.
      ({ data: listed.sessions }) as ReturnType<
        typeof TenantModule.useSessions
      >,
  })
)

const { Route } = await import("@/routes/_dashboard/sessions/index")
// eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- createFileRoute's Route.options.component is typed broader than the concrete component this file registered; there is no narrower accessor.
const SessionsRoute = Route.options.component as () => JSX.Element

function renderList(): void {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SessionsRoute />
    </QueryClientProvider>
  )
}

afterEach(() => {
  cleanup()
  listed.sessions = []
})

describe("sessions list on the phone: a new session is always one tap away", () => {
  it("from an empty list", () => {
    renderList()

    expect(
      screen
        .getByRole("link", { name: "Start something new" })
        .getAttribute("href")
    ).toBe("/sessions/new")
  })

  it("from a list that already has sessions", () => {
    listed.sessions = [
      {
        id: "session-1",
        name: "Vocabulary warm-up",
        status: "completed",
        activities: [],
        scenes: [],
        layoutMode: "basic",
        totalDurationMs: 0,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ]
    renderList()

    expect(
      screen.getByRole("link", { name: "New session" }).getAttribute("href")
    ).toBe("/sessions/new")
  })
})
