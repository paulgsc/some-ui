/**
 * @vitest-environment jsdom
 *
 * Home's study card must not read a failed sessions read as "nothing in
 * progress" and offer Start over a session that is only unreadable.
 */

import { fakeQueryResult, withQueryClient } from "@/test-support/query-client"
import { routeComponent } from "@/test-support/router-stubs"
import { sessionRecord } from "@/test-support/session-record"
import { seedStop, stopRecord } from "@/test-support/session-stop"
import type * as ReactRouterModule from "@tanstack/react-router"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { latestStop, PICK_UP_MS } from "@/lib/session-stop"
import type * as TenantModule from "@/lib/tenant"
import type { SessionRecord } from "@/lib/tenant"

const refetch = vi.fn()
const updateSession = vi.fn()
let mockResult: ReturnType<typeof TenantModule.useSessions>

vi.mock(
  "@/lib/tenant",
  async (importOriginal): Promise<typeof TenantModule> => {
    const actual = await importOriginal<typeof TenantModule>()
    return {
      ...actual,
      useSessions: () => mockResult,
      useUpdateSession: () => ({
        ...actual.useUpdateSession(),
        mutate: updateSession,
      }),
    }
  }
)

vi.mock(
  "@tanstack/react-router",
  async (importOriginal): Promise<typeof ReactRouterModule> => {
    const { withPlainLink } = await import("@/test-support/router-stubs")
    return withPlainLink(await importOriginal<typeof ReactRouterModule>())
  }
)

// An "apk" workspace, stubbed in the test build's profile; its cards are
// tested in @some-ui/aph, and only the study card is under test here.
vi.mock("@some-ui/aph", () => ({
  AphTodayCard: (): null => null,
  AphTodayEntries: (): null => null,
}))

const { Route } = await import("@/routes/_dashboard/_apk/today")
const TodayRoute = routeComponent(Route)

afterEach(() => {
  cleanup()
  refetch.mockClear()
  updateSession.mockClear()
  localStorage.clear()
})

type Sessions = Array<SessionRecord>

function renderWith(
  fields: Parameters<typeof fakeQueryResult<Sessions>>[0]
): void {
  mockResult = fakeQueryResult<Sessions>({ refetch, ...fields })
  render(withQueryClient(<TodayRoute />))
}

describe("Home's study card", () => {
  it("says the sessions could not be read, and retries, rather than offering Start", () => {
    renderWith({ data: undefined, isError: true, error: new Error("offline") })

    expect(screen.getByText(/couldn’t read your sessions/)).toBeTruthy()
    expect(screen.queryByText("nothing in progress")).toBeNull()
    expect(screen.queryByText("Start")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Retry" }))
    expect(refetch).toHaveBeenCalledTimes(1)
  })

  it("keeps a cached list through a failed refresh, and says it may be stale", () => {
    renderWith({ data: [], isError: true, error: new Error("refresh failed") })

    expect(screen.getByText("nothing in progress")).toBeTruthy()
    expect(screen.getByText(/this may be out of date/)).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Retry" }))
    expect(refetch).toHaveBeenCalledTimes(1)
  })

  it("offers Start only once the list is known to hold nothing in progress", () => {
    renderWith({ data: [], isError: false })

    expect(screen.getByText("nothing in progress")).toBeTruthy()
    expect(screen.getByText("Start")).toBeTruthy()
    expect(screen.queryByText(/this may be out of date/)).toBeNull()
  })

  it("says a session was finished today, and still offers another round", () => {
    renderWith({ data: [finished("Korean", 15 * 60_000)], isError: false })

    expect(screen.getByText("Studied today")).toBeTruthy()
    expect(screen.getByText("15 min · Korean")).toBeTruthy()
    expect(screen.getByText("Another round")).toBeTruthy()
    expect(screen.queryByText(/Not today/)).toBeNull()
  })

  it("offers Resume over Studied today while a session is still open", () => {
    const open = { ...finished("Open", 0), status: "paused" as const }
    renderWith({ data: [open, finished("Korean", 60_000)], isError: false })

    expect(screen.getByText("Resume")).toBeTruthy()
    expect(screen.queryByText("Studied today")).toBeNull()
  })

  it("offers Pick up for a session stopped within the window", () => {
    const open = { ...finished("Open", 0), status: "active" as const }
    seedStop(stopRecord(5 * 60_000, { sessionId: "Open" }))
    renderWith({ data: [open], isError: false })

    expect(screen.getByText("Pick up")).toBeTruthy()
    expect(screen.getByText("Stopped at 12:18 · Open")).toBeTruthy()
    expect(updateSession).not.toHaveBeenCalled()
  })

  it("closes a stop past the window as it stood, dated when it stopped", () => {
    const open = { ...finished("Open", 0), status: "active" as const }
    const stop = seedStop(
      stopRecord(PICK_UP_MS + 60_000, { sessionId: "Open" })
    )
    renderWith({ data: [open], isError: false })

    expect(updateSession).toHaveBeenCalledWith({
      id: "Open",
      patch: {
        status: "completed",
        completedAt: stop.stoppedAt,
        finalElapsedMs: 738_000,
      },
    })
    expect(latestStop("Open")?.outcome).toBe("lapsed")
  })

  it("asks once, optionally, why a finished session was cut short", () => {
    seedStop(stopRecord(0, { sessionId: "Korean", outcome: "done" }))
    renderWith({
      data: [finished("Korean", 738_000, 1_200_000)],
      isError: false,
    })

    expect(screen.getByText("Cut short at 12:18.")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: /call or message/i }))
    expect(latestStop("Korean")).toMatchObject({
      reason: "call",
      reasonFrom: "home",
    })
  })
})

function finished(
  name: string,
  elapsedMs: number,
  totalDurationMs = elapsedMs
): SessionRecord {
  return sessionRecord({
    id: name,
    name,
    status: "completed",
    totalDurationMs,
    completedAt: new Date().toISOString(),
    finalElapsedMs: elapsedMs,
  })
}
