/**
 * @vitest-environment jsdom
 *
 * Practice's Home: its study card must not read a failed sessions read as
 * "nothing in progress" and offer Start over a session that is only
 * unreadable. Its Rust Rounds card opens the session on the card left last.
 */

import { fakeQueryResult, withQueryClient } from "@/test-support/query-client"
import { routeComponent } from "@/test-support/router-stubs"
import { sessionRecord } from "@/test-support/session-record"
import { seedStop, stopRecord } from "@/test-support/session-stop"
import { keptRounds } from "@some-ui/rust-rounds"
import { RUST_ROUNDS_TITLE } from "@some-ui/rust-rounds/entry"
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

const { Route } = await import("@/routes/_dashboard/_apk/practice/index")
const PracticeHome = routeComponent(Route)

afterEach(() => {
  cleanup()
  refetch.mockClear()
  updateSession.mockClear()
  localStorage.clear()
})

type Sessions = Array<SessionRecord>

function renderWith(fields: Parameters<typeof fakeQueryResult<Sessions>>[0]): {
  refresh: (next: Parameters<typeof fakeQueryResult<Sessions>>[0]) => void
} {
  mockResult = fakeQueryResult<Sessions>({ refetch, ...fields })
  const { rerender } = render(withQueryClient(<PracticeHome />))
  return {
    refresh: (next): void => {
      mockResult = fakeQueryResult<Sessions>({ refetch, ...next })
      rerender(withQueryClient(<PracticeHome />))
    },
  }
}

describe("Practice's study card", () => {
  it("says the sessions could not be read, and retries, rather than offering Start", () => {
    renderWith({ data: undefined, isError: true, error: new Error("offline") })

    expect(screen.getByText(/couldn’t read your sessions/)).toBeTruthy()
    expect(screen.queryByText("nothing in progress")).toBeNull()
    expect(screen.queryByText("Start")).toBeNull()
    expect(screen.queryByText("Next lesson")).toBeNull()
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
    expect(screen.getByRole("button", { name: "Next lesson" })).toBeTruthy()
    expect(screen.queryByText(/this may be out of date/)).toBeNull()
  })

  it("says a session was finished today, and still offers another round", () => {
    renderWith({ data: [finished("Korean", 15 * 60_000)], isError: false })

    expect(screen.getByText("Studied today")).toBeTruthy()
    expect(screen.getByText("15 min · Korean")).toBeTruthy()
    expect(screen.getByText("Another round")).toBeTruthy()
    expect(screen.queryByText(/Not today/)).toBeNull()
  })

  it("counts a finished session with no recorded time at its planned length", () => {
    const { finalElapsedMs: _unset, ...noTime } = finished(
      "Korean",
      15 * 60_000
    )
    renderWith({ data: [noTime], isError: false })

    expect(screen.getByText("15 min · Korean")).toBeTruthy()
  })

  it("offers Resume over Studied today while a session is still open", () => {
    const open = { ...finished("Open", 0), status: "paused" as const }
    renderWith({ data: [open, finished("Korean", 60_000)], isError: false })

    expect(screen.getByText("Resume")).toBeTruthy()
    expect(screen.queryByText("Studied today")).toBeNull()
    expect(screen.queryByText("Next lesson")).toBeNull()
  })

  it("keeps Next lesson on screen once pressed, while the session it starts shows as open", () => {
    const { refresh } = renderWith({ data: [], isError: false })
    fireEvent.click(screen.getByRole("button", { name: "Next lesson" }))
    const open = { ...finished("Korean", 0), status: "active" as const }
    refresh({ data: [open], isError: false })
    expect(screen.getByText("Resume")).toBeTruthy()
    expect(screen.queryByText(/Next lesson|Getting it ready/)).not.toBeNull()
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

  it("asks about the session finished last, not the one listed first", () => {
    seedStop(stopRecord(0, { sessionId: "Late", outcome: "done" }))
    const early = {
      ...finished("Early", 60_000),
      completedAt: new Date(Date.now() - 3_600_000).toISOString(),
    }
    renderWith({
      data: [early, finished("Late", 738_000, 1_200_000)],
      isError: false,
    })

    expect(screen.getByText("Cut short at 12:18.")).toBeTruthy()
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

/** The card's link: the router stub renders it as a plain `<a>`. */
const rustRoundsCard = (): HTMLElement | null =>
  screen.getByText(RUST_ROUNDS_TITLE).closest("a")

describe("Practice's Rust Rounds card", () => {
  it("opens Rust Rounds, saying what it is before any card is played", () => {
    renderWith({ data: [], isError: false })

    const card = rustRoundsCard()
    expect(card?.getAttribute("to")).toBe("/rust-rounds")
    expect(card?.textContent).toContain(
      "Small Rust programs, and what rustc really did with them"
    )
  })

  it("says where it was left: the concept and the card, never how long", () => {
    keptRounds(localStorage).place({
      place: {
        visit: {
          round: "indexing-01",
          card: "c",
          stage: "speak",
          picked: "Panics",
          note: null,
          shown: false,
          pinned: false,
          again: "fresh",
        },
        menu: null,
        title: { concept: "indexing", number: 3 },
      },
      taking: null,
      pending: [],
    })
    renderWith({ data: [], isError: false })

    expect(rustRoundsCard()?.textContent).toContain(
      "Continue: indexing, card 3"
    )
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
