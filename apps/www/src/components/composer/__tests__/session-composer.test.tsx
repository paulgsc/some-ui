/**
 * @vitest-environment jsdom
 *
 * The composer's save flows: the double-submit guard, the honest
 * middle-failure message for a new session's "Save & Play" chain, and the
 * success paths' navigation targets and toast copy.
 */

import { sessionRecord } from "@/test-support/session-record"
import { signInForTests } from "@/test-support/sign-in"
import { resetViewport, setViewport } from "@/test-support/viewport"
import type * as ReactRouterModule from "@tanstack/react-router"
import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
} from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { renderAtReviewStep as renderReview } from "./helpers"

// These suites are about the account's store failing: start from an account.
beforeEach(() => {
  signInForTests()
})

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

const { SessionComposer } = await import(
  "@/components/composer/session-composer"
)

type FetchCall = { method: string; url: string; body: unknown }

/** `body.name` of a parsed request body, or "untitled". */
function nameFrom(body: unknown): string {
  if (typeof body !== "object" || body === null || !("name" in body)) {
    return "untitled"
  }
  const { name } = body
  return typeof name === "string" ? name : "untitled"
}

/** A `global.fetch` answering session-shaped JSON for create and PATCH, and
 * recording every call so tests can count creates and updates. */
function installFileHostSuccess(options: {
  failPatch?: boolean
  /** Default 500 (retryable). A 4xx is a definitive activate rejection:
   * non-retryable, but not `blocksResubmission`. */
  failPatchStatus?: number
}): {
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
      const record = sessionRecord({
        id: `session-${createdCount}`,
        name: nameFrom(body),
      })
      return new Response(JSON.stringify(record), { status: 200 })
    }

    if (method === "PATCH") {
      if (options.failPatch) {
        return new Response(
          JSON.stringify({
            error: { code: "internal_error", message: "boom" },
          }),
          { status: options.failPatchStatus ?? 500 }
        )
      }
      const sessionId = url.split("/sessions/")[1]
      return new Response(
        JSON.stringify(
          sessionRecord({
            id: sessionId,
            name: "untitled",
            status: "active",
            startedAt: "2026-01-01T00:00:00.000Z",
          })
        ),
        { status: 200 }
      )
    }

    // Anything else (the incidental list read lib/tenant/hooks.ts triggers)
    // fails as a connection refused, which the production code tolerates.
    return Promise.reject(new TypeError("Failed to fetch"))
  }

  vi.stubGlobal("fetch", impl)
  return { calls, restore: () => vi.unstubAllGlobals() }
}

const creates = (calls: Array<FetchCall>): Array<FetchCall> =>
  calls.filter((c) => c.method === "POST" && c.url.includes("/sessions"))

const isDisabled = (name: RegExp): boolean =>
  screen.getByRole("button", { name }).hasAttribute("disabled")

const renderAtReviewStep = (): Promise<void> => renderReview(SessionComposer)

beforeEach(() => {
  navigateSpy.mockClear()
  toastSpy.mockClear()
  // The wizard: these flows walk it with Continue, which is the wide layout.
  setViewport(false)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  resetViewport()
})

describe("SessionComposer: Save & Play, new session - success path and regressions", () => {
  it("double-clicking Save & Play creates exactly one session (thundering-herd regression)", async () => {
    const { calls, restore } = installFileHostSuccess({})
    await renderAtReviewStep()

    const saveAndPlay = screen.getByRole("button", { name: /save.*play/i })
    // No `act`/`await` between the two clicks: a fast double-click.
    act(() => {
      fireEvent.click(saveAndPlay)
      fireEvent.click(saveAndPlay)
    })

    // Wait for the chain's terminal signal (navigate), not for the count to
    // read 1, which is already true before a duplicate POST would land.
    await waitFor(() => {
      expect(navigateSpy).toHaveBeenCalled()
    })

    expect(creates(calls)).toHaveLength(1)
    restore()
  })

  it("saves as draft: toast copy, and a navigation that replaces the spent composer", async () => {
    const { restore } = installFileHostSuccess({})
    await renderAtReviewStep()

    const saveDraft = screen.getByRole("button", { name: /save as draft/i })
    fireEvent.click(saveDraft)

    await waitFor(() => {
      expect(toastSpy).toHaveBeenCalledWith("Session saved as draft")
      expect(navigateSpy).toHaveBeenCalledWith({
        to: "/sessions",
        replace: true,
      })
    })
    restore()
  })

  it("save & play: replaces the composer with the new session's player, no toast", async () => {
    const { restore } = installFileHostSuccess({})
    await renderAtReviewStep()

    const saveAndPlay = screen.getByRole("button", { name: /save.*play/i })
    fireEvent.click(saveAndPlay)

    await waitFor(() => {
      expect(navigateSpy).toHaveBeenCalledWith({
        to: "/sessions/$sessionId",
        params: { sessionId: "session-1" },
        replace: true,
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

    // The create succeeded, so "Save as draft" (a second POST) is disabled;
    // "Save & Play"'s "Try again" retries only the activate PATCH.
    expect(isDisabled(/save as draft/i)).toBe(true)

    expect(creates(calls)).toHaveLength(1)

    fireEvent.click(screen.getByRole("button", { name: /try again/i }))

    await waitFor(() => {
      const patches = calls.filter((c) => c.method === "PATCH")
      expect(patches.length).toBeGreaterThanOrEqual(2)
    })

    const patches = calls.filter((c) => c.method === "PATCH")
    // Still exactly one session created; retry only re-ran the PATCH.
    expect(creates(calls)).toHaveLength(1)
    expect(patches.length).toBeGreaterThanOrEqual(2)
    restore()
  })

  it("a definitive (non-retryable) activate failure disables Save & Play too - not just its sibling - so its own onPress fallback can't restart the chain", async () => {
    const { calls, restore } = installFileHostSuccess({
      failPatch: true,
      failPatchStatus: 400,
    })
    await renderAtReviewStep()

    const saveAndPlay = screen.getByRole("button", { name: /save.*play/i })
    fireEvent.click(saveAndPlay)

    await screen.findByRole("alert")
    // A 4xx is not retryable: no "Try again", and the `onPress` fallback
    // (which would restart the whole chain) is disabled too.
    expect(screen.queryByRole("button", { name: /try again/i })).toBeNull()
    expect(isDisabled(/save.*play/i)).toBe(true)
    expect(isDisabled(/save as draft/i)).toBe(true)

    // A disabled button fires no click, so no second POST.
    fireEvent.click(saveAndPlay)
    expect(creates(calls)).toHaveLength(1)
    restore()
  })
})
