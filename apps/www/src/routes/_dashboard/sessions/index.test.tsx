/**
 * @vitest-environment jsdom
 *
 * #946/S3's own regressions for this route, alongside
 * `index.intent.test.tsx`'s failure-visibility suite: the thundering-herd
 * guard on a row's own duplicate action, and the bulk selection's
 * survives-a-failure property `lib/intent/render/index.ts`'s own header
 * commits to verifying "at the migration site rather than asserted there."
 */

import type { JSX, ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type * as ReactRouterModule from "@tanstack/react-router"
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
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

function withQueryClient(children: ReactNode): JSX.Element {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

function bulkToolbar(): HTMLElement {
  const root = screen.getByText(/selected$/).closest("div")
  if (!(root instanceof HTMLElement)) {
    throw new Error("bulk selection toolbar not found")
  }
  return root
}

function selectAllSessions(): void {
  for (const checkbox of screen.getAllByRole("checkbox")) {
    fireEvent.click(checkbox)
  }
}

function isChecked(element: HTMLElement): boolean {
  return element instanceof HTMLInputElement && element.checked
}

beforeEach(() => {
  vi.spyOn(window, "confirm").mockReturnValue(true)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("sessions list: thundering-herd guard on a row's own actions", () => {
  it("double-clicking a card's Duplicate button issues exactly one duplicate request", async () => {
    let duplicateCalls = 0
    const impl: typeof fetch = async (input, init) => {
      const url = String(input)
      if ((init?.method ?? "GET") === "POST" && url.includes("/duplicate")) {
        duplicateCalls += 1
        return new Response(
          JSON.stringify(
            fixtureSession("session-3", "Vocabulary warm-up (copy)")
          ),
          { status: 200 }
        )
      }
      return Promise.reject(new TypeError("Failed to fetch"))
    }
    vi.stubGlobal("fetch", impl)

    render(withQueryClient(<SessionsRoute />))
    const [duplicateButton] = screen.getAllByTitle("Duplicate")

    // No `act`/`await` between the two clicks - the same fast-double-click
    // shape #936 must close for every migrated write, not just the
    // composer's chain.
    act(() => {
      fireEvent.click(duplicateButton)
      fireEvent.click(duplicateButton)
    })

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20))
    })

    expect(duplicateCalls).toBe(1)
  })
})

describe("sessions list: bulk selection survives a failed batch", () => {
  it("a failed bulk delete leaves every row selected, so retrying is one click", async () => {
    vi.stubGlobal("fetch", async () =>
      Promise.reject(new TypeError("Failed to fetch"))
    )

    render(withQueryClient(<SessionsRoute />))
    selectAllSessions()

    const checkboxesBefore = screen.getAllByRole("checkbox")
    expect(checkboxesBefore.every(isChecked)).toBe(true)

    const bulkDelete = within(bulkToolbar()).getByRole("button", {
      name: /delete/i,
    })
    await act(async () => {
      fireEvent.click(bulkDelete)
      await new Promise((resolve) => setTimeout(resolve, 20))
    })

    // The toolbar (and both rows' checkboxes) are still on screen, still
    // checked - a failed batch must not silently drop the selection the
    // person built, since that's what turns "retry" into "reselect everything".
    const checkboxesAfter = screen.getAllByRole("checkbox")
    expect(checkboxesAfter.every(isChecked)).toBe(true)
    expect(screen.getByText(/2 selected/)).toBeTruthy()
  })

  it("a successful bulk delete clears the selection - unchanged from pre-migration", async () => {
    vi.stubGlobal(
      "fetch",
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if ((init?.method ?? "GET") === "DELETE" && url.endsWith("/sessions")) {
          // Every file_host route answers with a JSON body, deletes included
          // (see client.ts's own requestJSON header) - a 204 with no body
          // would make `.json()` throw and the mutation fail, not succeed.
          return new Response(JSON.stringify({ removed: 2 }), { status: 200 })
        }
        return Promise.reject(new TypeError("Failed to fetch"))
      }
    )

    render(withQueryClient(<SessionsRoute />))
    selectAllSessions()

    const bulkDelete = within(bulkToolbar()).getByRole("button", {
      name: /delete/i,
    })
    await act(async () => {
      fireEvent.click(bulkDelete)
      await new Promise((resolve) => setTimeout(resolve, 20))
    })

    expect(screen.queryByText(/selected$/)).toBeNull()
  })
})
