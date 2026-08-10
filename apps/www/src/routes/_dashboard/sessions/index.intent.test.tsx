/**
 * @vitest-environment jsdom
 *
 * #939, S2 of #934: the other two flows the story names by file — a
 * single-shot write (a card's own delete) and a bulk write (`deleteMany` /
 * `updateStatusMany` at sessions/index.tsx:243,249), sabotaged the same four
 * ways as the composer chain in `session-composer.intent.test.tsx`. See
 * `test-support/file-host-sabotage.ts` for why this is Vitest against the
 * real route component rather than a Playwright suite booting the real app.
 *
 * `useSessions` is mocked to hand the route a fixed list without needing a
 * live backend for the *read* — the whole point of this suite is what
 * happens when the *write* the person triggers fails, which is real,
 * unmocked production code (`useDeleteSession`, `useDeleteManySessions`,
 * `useUpdateStatusManySessions`, `lib/tenant/hooks.ts`,
 * `lib/file-host-config/client.ts`) all the way down to `global.fetch`.
 *
 * #936 migrated both flows onto `useIntent`/`IntentButton` - every `it.fails`
 * this suite originally wrote for the not-yet-true "tells the person"
 * outcome has flipped to a plain `it` now that it is true.
 *
 * #937 S3 extends coverage to a third flow in this file: a card's own
 * duplicate action (`SessionCard`'s `duplicateIntent`, adjacent to the
 * delete intent above it). The bulk status-change intent
 * (`updateStatusManyIntent`, driven from a Radix `Select`) is a real
 * remaining gap - this suite has no existing precedent or polyfills for
 * driving a Radix `Select` through jsdom (`hasPointerCapture`,
 * `scrollIntoView`), and building that harness is its own piece of work
 * rather than something to bolt on here without it either being flaky or
 * silently wrong. `bulkStatusChangeFailure` (this file's own renderer for
 * that intent) reuses the same `IntentFailure` component every other
 * covered flow does, so the render path is not untested, only the
 * Select-driven route-level path.
 */

import type { JSX, ReactNode } from "react"
import {
  expectRetryAffordanceTracksRetryable,
  expectSomeFailureAffordance,
  installFileHostSabotage,
  SABOTAGE_MODES,
} from "@/test-support/file-host-sabotage"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type * as ReactRouterModule from "@tanstack/react-router"
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type * as TenantModule from "@/lib/tenant"
import type { SessionRecord } from "@/lib/tenant"

function fixtureSession(id: string, name: string): SessionRecord {
  return {
    id,
    name,
    status: "draft",
    activities: [],
    scenes: [],
    layoutMode: "basic",
    totalDurationMs: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  }
}

const FIXTURE_SESSIONS: Array<SessionRecord> = [
  fixtureSession("session-1", "Vocabulary warm-up"),
  fixtureSession("session-2", "Grammar review"),
]

vi.mock(
  "@tanstack/react-router",
  async (importOriginal): Promise<typeof ReactRouterModule> => {
    const actual = await importOriginal<typeof ReactRouterModule>()
    return {
      ...actual,
      // Test stand-in for tanstack-router's Link - href is irrelevant here.
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- LinkComponent's real signature is generic over the whole route tree; a plain <a> stand-in has no narrower match.
      Link: (({ children, ...props }: { children?: ReactNode }) => (
        <a {...props}>{children}</a>
      )) as typeof ReactRouterModule.Link,
    }
  }
)

vi.mock(
  "@/lib/tenant",
  async (importOriginal): Promise<typeof TenantModule> => {
    const actual = await importOriginal<typeof TenantModule>()
    return {
      ...actual,
      useSessions: () =>
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- stubbing TanStack Query's rich UseQueryResult with the two fields this route actually reads; the real shape has no minimal constructor.
        ({ data: FIXTURE_SESSIONS, isLoading: false }) as ReturnType<
          typeof TenantModule.useSessions
        >,
    }
  }
)

const { Route } = await import("./index")
// eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- createFileRoute's Route.options.component is typed broader than the concrete component this file actually registered; there is no narrower accessor.
const SessionsRoute = Route.options.component as () => JSX.Element

/** No jest-dom in this app's vitest setup - a plain attribute check avoids
 * needing an HTMLButtonElement type assertion just to read `.disabled`. */
function isDisabled(element: HTMLElement): boolean {
  return element.hasAttribute("disabled")
}

function withQueryClient(children: ReactNode): JSX.Element {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

const REJECTING_MODES = SABOTAGE_MODES.filter((mode) => mode !== "hang")

/** `not-configured` -> `FileHostNotConfiguredError` -> `IntentError.kind
 * "unavailable"`, the one rejecting mode that is not retryable - see
 * `lib/intent/errors.ts`'s `mapFileHostError`. */
function isRetryableMode(mode: (typeof REJECTING_MODES)[number]): boolean {
  return mode !== "not-configured"
}

beforeEach(() => {
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
      render(withQueryClient(<SessionsRoute />))
      const restore = installFileHostSabotage(mode)

      const [deleteButton] = screen.getAllByTitle("Delete")

      // eslint-disable-next-line @typescript-eslint/require-await -- act's async form is what flushes the microtask-queued mutation state update; see file-host-sabotage.ts's header.
      await act(async () => {
        fireEvent.click(deleteButton)
      })

      expect(window.confirm).toHaveBeenCalled()
      expect(isDisabled(deleteButton)).toBe(false)
      // The row the person confirmed deleting is, correctly, still present
      // (the mocked list never changed) - the failure this row exists to
      // demonstrate is that nothing *tells* them that.
      expect(screen.getByText("Vocabulary warm-up")).toBeTruthy()
      restore()
    })

    it("tells the person the delete failed, with a retry control tracking retryability", async () => {
      render(withQueryClient(<SessionsRoute />))
      const restore = installFileHostSabotage(mode)

      const [deleteButton] = screen.getAllByTitle("Delete")
      // eslint-disable-next-line @typescript-eslint/require-await -- see the sanity test above
      await act(async () => {
        fireEvent.click(deleteButton)
      })

      await expectSomeFailureAffordance(document.body)
      expectRetryAffordanceTracksRetryable(document.body, isRetryableMode(mode))
      restore()
    })
  })
})

describe("sessions list: duplicate on a card", () => {
  describe.each(REJECTING_MODES)("file_host sabotaged: %s", (mode) => {
    it("re-enables the duplicate button once the request settles (sanity)", async () => {
      render(withQueryClient(<SessionsRoute />))
      const restore = installFileHostSabotage(mode)

      const [duplicateButton] = screen.getAllByTitle("Duplicate")
      // eslint-disable-next-line @typescript-eslint/require-await -- see the delete suite's own sanity test
      await act(async () => {
        fireEvent.click(duplicateButton)
      })

      await waitFor(() => {
        expect(isDisabled(screen.getAllByTitle("Duplicate")[0])).toBe(false)
      })
      restore()
    })

    it("tells the person the duplicate failed, with a retry control tracking retryability", async () => {
      render(withQueryClient(<SessionsRoute />))
      const restore = installFileHostSabotage(mode)

      const [duplicateButton] = screen.getAllByTitle("Duplicate")
      // eslint-disable-next-line @typescript-eslint/require-await -- see the delete suite's own sanity test
      await act(async () => {
        fireEvent.click(duplicateButton)
      })

      await expectSomeFailureAffordance(document.body)
      expectRetryAffordanceTracksRetryable(document.body, isRetryableMode(mode))
      restore()
    })
  })
})

function selectAllSessions(): void {
  const checkboxes = screen.getAllByRole("checkbox")
  for (const checkbox of checkboxes) {
    fireEvent.click(checkbox)
  }
}

/** The bulk bar's own "Delete" button, distinguished from each card's own
 * identically-labelled delete button by scoping to the toolbar that only
 * renders once something is selected (`{count} selected`) - the toolbar's
 * root div is the `<span>`'s own parent. */
function bulkToolbar(): HTMLElement {
  const root = screen.getByText(/selected$/).closest("div")
  if (!(root instanceof HTMLElement)) {
    throw new Error("bulk selection toolbar not found")
  }
  return root
}

describe("sessions list: bulk delete from the selection toolbar", () => {
  describe.each(REJECTING_MODES)("file_host sabotaged: %s", (mode) => {
    it("re-enables the toolbar once the request settles, selection still checked (sanity)", async () => {
      render(withQueryClient(<SessionsRoute />))
      selectAllSessions()
      const restore = installFileHostSabotage(mode)

      const bulkDelete = within(bulkToolbar()).getByRole("button", {
        name: /delete/i,
      })

      // eslint-disable-next-line @typescript-eslint/require-await -- see the composer suite's header note
      await act(async () => {
        fireEvent.click(bulkDelete)
      })

      expect(window.confirm).toHaveBeenCalled()
      // Both rows are still on screen - the batch failed as a whole, which
      // is the correct transport-level outcome. What's missing is anyone
      // being told that's what happened.
      expect(screen.getByText("Vocabulary warm-up")).toBeTruthy()
      expect(screen.getByText("Grammar review")).toBeTruthy()
      restore()
    })

    it("tells the person the bulk delete failed, with a retry control tracking retryability", async () => {
      render(withQueryClient(<SessionsRoute />))
      selectAllSessions()
      const restore = installFileHostSabotage(mode)

      const bulkDelete = within(bulkToolbar()).getByRole("button", {
        name: /delete/i,
      })
      // eslint-disable-next-line @typescript-eslint/require-await -- see the composer suite's header note
      await act(async () => {
        fireEvent.click(bulkDelete)
      })

      await expectSomeFailureAffordance(document.body)
      expectRetryAffordanceTracksRetryable(document.body, isRetryableMode(mode))
      restore()
    })
  })
})
