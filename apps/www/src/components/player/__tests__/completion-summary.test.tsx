/**
 * @vitest-environment jsdom
 *
 * "Play again" duplicates the session: on success it navigates to the
 * composer with the copy; a failure is visible, not a silent re-enable.
 */

import type { ReactNode } from "react"
import { withQueryClient } from "@/test-support/query-client"
import { sessionRecord } from "@/test-support/session-record"
import { seedStop, stopRecord } from "@/test-support/session-stop"
import { signInForTests } from "@/test-support/sign-in"
import type * as ReactRouterModule from "@tanstack/react-router"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { latestStop } from "@/lib/session-stop"

// These suites are about the account's store failing: start from an account.
beforeEach(() => {
  signInForTests()
})

const navigateSpy = vi.fn()

vi.mock(
  "@tanstack/react-router",
  async (importOriginal): Promise<typeof ReactRouterModule> => {
    const actual = await importOriginal<typeof ReactRouterModule>()
    return {
      ...actual,
      useNavigate: () => navigateSpy,
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- LinkComponent's real signature is generic over the whole route tree; a plain <a> stand-in has no narrower match.
      Link: ((props: { children?: ReactNode }) => (
        <a href="/sessions">{props.children}</a>
      )) as typeof ReactRouterModule.Link,
    }
  }
)

const { CompletionSummary } = await import(
  "@/components/player/completion-summary"
)

/** Renders a finished session's summary and presses Play again. */
async function playAgain(): Promise<void> {
  const session = sessionRecord({
    status: "completed",
    totalDurationMs: 60_000,
    finalElapsedMs: 60_000,
  })
  render(withQueryClient(<CompletionSummary session={session} />))

  fireEvent.click(screen.getByRole("button", { name: /play again/i }))
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20))
  })
}

beforeEach(() => {
  navigateSpy.mockClear()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("CompletionSummary: Play again", () => {
  it("navigates to the composer with the duplicated draft on success", async () => {
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

    await playAgain()

    expect(navigateSpy).toHaveBeenCalledWith({
      to: "/sessions/new",
      search: { edit: "session-2" },
    })
  })

  it("shows a visible, actionable failure instead of silently re-enabling", async () => {
    vi.stubGlobal("fetch", async () =>
      Promise.reject(new TypeError("Failed to fetch"))
    )

    await playAgain()

    expect(screen.getByRole("alert")).toBeTruthy()
    expect(navigateSpy).not.toHaveBeenCalled()
  })
})

describe("CompletionSummary: the wrap", () => {
  it("counts a wrap-up in the last minutes as complete, and shows the time added", () => {
    render(
      withQueryClient(
        <CompletionSummary
          session={sessionRecord({
            status: "completed",
            totalDurationMs: 15 * 60_000,
            finalElapsedMs: 14 * 60_000,
          })}
        />
      )
    )
    expect(screen.getByText("Session complete")).toBeTruthy()
    expect(screen.getByText("none")).toBeTruthy()
    cleanup()

    render(
      withQueryClient(
        <CompletionSummary
          session={sessionRecord({
            status: "completed",
            totalDurationMs: 15 * 60_000,
            finalElapsedMs: 20 * 60_000,
          })}
        />
      )
    )
    expect(screen.getByText("+5 min")).toBeTruthy()
  })

  it("keeps a tapped answer, and a second tap clears it", () => {
    localStorage.clear()
    const session = sessionRecord({ status: "completed" })
    render(withQueryClient(<CompletionSummary session={session} />))

    const keen = screen.getByRole("button", { name: "Keen" })
    fireEvent.click(keen)
    expect(keen.getAttribute("aria-pressed")).toBe("true")
    fireEvent.click(keen)
    expect(keen.getAttribute("aria-pressed")).toBe("false")
  })

  it("banks a session stopped and not picked up, and asks why, optionally", () => {
    localStorage.clear()
    const session = sessionRecord({
      status: "completed",
      totalDurationMs: 20 * 60_000,
      finalElapsedMs: 738_000,
    })
    seedStop(stopRecord(0, { sessionId: session.id, outcome: "done" }))
    render(withQueryClient(<CompletionSummary session={session} />))

    expect(screen.getByText("12 min, banked")).toBeTruthy()
    expect(screen.queryByText("Session stopped early")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: /break’s over/i }))
    expect(latestStop(session.id)).toMatchObject({
      reason: "break",
      reasonFrom: "close",
    })
  })
})
