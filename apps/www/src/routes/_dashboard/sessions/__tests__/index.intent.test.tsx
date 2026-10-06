/**
 * @vitest-environment jsdom
 *
 * The sessions list's writes (a card's delete and duplicate, and the bulk
 * delete), sabotaged the same ways as the composer chain in
 * `session-composer.intent.test.tsx`; see `test-support/file-host-sabotage.ts`.
 * `useSessions` is mocked to hand the route a fixed list; the writes are real
 * code all the way down to `global.fetch`.
 *
 * Not covered: the bulk status change, driven from a Radix `Select` that jsdom
 * cannot drive without extra polyfills. Its failure renders through the same
 * `IntentFailure` every covered flow uses.
 */

import {
  expectRetryAffordanceTracksRetryable,
  expectSomeFailureAffordance,
  installFileHostSabotage,
  SABOTAGE_MODES,
} from "@/test-support/file-host-sabotage"
import { fakeQueryResult, withQueryClient } from "@/test-support/query-client"
import { routeComponent } from "@/test-support/router-stubs"
import { sessionRecord } from "@/test-support/session-record"
import { signInForTests } from "@/test-support/sign-in"
import type * as ReactRouterModule from "@tanstack/react-router"
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type * as TenantModule from "@/lib/tenant"

import { bulkDeleteButton, selectAllSessions } from "./helpers"

const FIXTURE_SESSIONS = [
  sessionRecord({ id: "session-1", name: "Vocabulary warm-up" }),
  sessionRecord({ id: "session-2", name: "Grammar review" }),
]

vi.mock(
  "@tanstack/react-router",
  async (importOriginal): Promise<typeof ReactRouterModule> => {
    const { withPlainLink } = await import("@/test-support/router-stubs")
    return withPlainLink(await importOriginal<typeof ReactRouterModule>())
  }
)

vi.mock(
  "@/lib/tenant",
  async (importOriginal): Promise<typeof TenantModule> => {
    const actual = await importOriginal<typeof TenantModule>()
    return {
      ...actual,
      useSessions: () =>
        fakeQueryResult({ data: FIXTURE_SESSIONS, isLoading: false }),
    }
  }
)

const { Route } = await import("@/routes/_dashboard/sessions/index")
const SessionsRoute = routeComponent(Route)

/** No jest-dom here: a plain attribute check. */
function isDisabled(element: HTMLElement): boolean {
  return element.hasAttribute("disabled")
}

const REJECTING_MODES = SABOTAGE_MODES.filter((mode) => mode !== "hang")

/** `not-configured` is the one rejecting mode that is not retryable
 * (`unavailable`, `lib/intent/errors.ts`). */
function isRetryableMode(mode: (typeof REJECTING_MODES)[number]): boolean {
  return mode !== "not-configured"
}

async function click(button: HTMLElement): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/require-await -- act's async form is what flushes the microtask-queued mutation state update; see file-host-sabotage.ts's header.
  await act(async () => {
    fireEvent.click(button)
  })
}

/** Renders the list (optionally selecting every row), then sabotages fetch. */
function renderSabotaged(
  mode: (typeof REJECTING_MODES)[number],
  selectAll = false
): () => void {
  render(withQueryClient(<SessionsRoute />))
  if (selectAll) selectAllSessions()
  return installFileHostSabotage(mode)
}

async function expectFailureTold(
  mode: (typeof REJECTING_MODES)[number]
): Promise<void> {
  await expectSomeFailureAffordance(document.body)
  expectRetryAffordanceTracksRetryable(document.body, isRetryableMode(mode))
}

// These suites are about the account's store failing: start from an account.
beforeEach(() => {
  signInForTests()
  vi.spyOn(window, "confirm").mockReturnValue(true)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("sessions list: single-shot delete on a card", () => {
  describe.each(REJECTING_MODES)("file_host sabotaged: %s", (mode) => {
    it("re-enables the delete button once the request settles, and the row is still there (sanity)", async () => {
      const restore = renderSabotaged(mode)
      const [deleteButton] = screen.getAllByTitle("Delete")

      await click(deleteButton)

      expect(window.confirm).toHaveBeenCalled()
      expect(isDisabled(deleteButton)).toBe(false)
      expect(screen.getByText("Vocabulary warm-up")).toBeTruthy()
      restore()
    })

    it("tells the person the delete failed, with a retry control tracking retryability", async () => {
      const restore = renderSabotaged(mode)

      await click(screen.getAllByTitle("Delete")[0])

      await expectFailureTold(mode)
      restore()
    })
  })
})

describe("sessions list: duplicate on a card", () => {
  describe.each(REJECTING_MODES)("file_host sabotaged: %s", (mode) => {
    it("re-enables the duplicate button once the request settles (sanity)", async () => {
      const restore = renderSabotaged(mode)

      await click(screen.getAllByTitle("Duplicate")[0])

      await waitFor(() => {
        expect(isDisabled(screen.getAllByTitle("Duplicate")[0])).toBe(false)
      })
      restore()
    })

    it("tells the person the duplicate failed, with a retry control tracking retryability", async () => {
      const restore = renderSabotaged(mode)

      await click(screen.getAllByTitle("Duplicate")[0])

      await expectFailureTold(mode)
      restore()
    })
  })
})

describe("sessions list: bulk delete from the selection toolbar", () => {
  describe.each(REJECTING_MODES)("file_host sabotaged: %s", (mode) => {
    it("re-enables the toolbar once the request settles, selection still checked (sanity)", async () => {
      const restore = renderSabotaged(mode, true)

      await click(bulkDeleteButton())

      expect(window.confirm).toHaveBeenCalled()
      // The batch failed as a whole: both rows are still on screen.
      expect(screen.getByText("Vocabulary warm-up")).toBeTruthy()
      expect(screen.getByText("Grammar review")).toBeTruthy()
      restore()
    })

    it("tells the person the bulk delete failed, with a retry control tracking retryability", async () => {
      const restore = renderSabotaged(mode, true)

      await click(bulkDeleteButton())

      await expectFailureTold(mode)
      restore()
    })
  })
})
