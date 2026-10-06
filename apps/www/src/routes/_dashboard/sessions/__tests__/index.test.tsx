/**
 * @vitest-environment jsdom
 *
 * The sessions list beside `index.intent.test.tsx`'s failure suite: a stored
 * session naming a retired activity, the thundering-herd guard on a row's
 * duplicate, and the bulk selection surviving a failed batch
 * (`lib/intent/render/index.ts`).
 */

import { fakeQueryResult, withQueryClient } from "@/test-support/query-client"
import { routeComponent } from "@/test-support/router-stubs"
import { sessionRecord } from "@/test-support/session-record"
import { signInForTests } from "@/test-support/sign-in"
import { getActivity } from "@some-ui/activity-catalog"
import type * as ReactRouterModule from "@tanstack/react-router"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type * as TenantModule from "@/lib/tenant"

import { bulkDeleteButton, selectAllSessions } from "./helpers"

const FIXTURE_SESSIONS = [
  sessionRecord({ id: "session-1", name: "Vocabulary warm-up" }),
  sessionRecord({
    id: "session-2",
    name: "Grammar review",
    // "interview" has since been retired; the stored record still names it.
    activities: [
      { activityId: "interview", config: {} },
      { activityId: "topik", config: getActivity("topik").defaultConfig },
    ],
  }),
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

const offline = (): Promise<Response> =>
  Promise.reject(new TypeError("Failed to fetch"))

function isChecked(element: HTMLElement): boolean {
  return element instanceof HTMLInputElement && element.checked
}

async function clickAndWait(button: HTMLElement): Promise<void> {
  await act(async () => {
    fireEvent.click(button)
    await new Promise((resolve) => setTimeout(resolve, 20))
  })
}

beforeEach(() => {
  signInForTests()
  vi.spyOn(window, "confirm").mockReturnValue(true)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("sessions list: a stored session that names a retired activity", () => {
  it("still lists the session, with a badge only for what it can still play", () => {
    vi.stubGlobal("fetch", offline)

    render(withQueryClient(<SessionsRoute />))

    expect(screen.getByText("Grammar review")).toBeDefined()
    expect(screen.getByText(/^TOPIK Study:/)).toBeDefined()
  })
})

describe("sessions list: thundering-herd guard on a row's own actions", () => {
  it("double-clicking a card's Duplicate button issues exactly one duplicate request", async () => {
    let duplicateCalls = 0
    const impl: typeof fetch = async (input, init) => {
      if (
        (init?.method ?? "GET") === "POST" &&
        String(input).includes("/duplicate")
      ) {
        duplicateCalls += 1
        return new Response(
          JSON.stringify(
            sessionRecord({
              id: "session-3",
              name: "Vocabulary warm-up (copy)",
            })
          ),
          { status: 200 }
        )
      }
      return offline()
    }
    vi.stubGlobal("fetch", impl)

    render(withQueryClient(<SessionsRoute />))
    const [duplicateButton] = screen.getAllByTitle("Duplicate")

    // No `act`/`await` between the two clicks: a fast double-click.
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
    vi.stubGlobal("fetch", offline)

    render(withQueryClient(<SessionsRoute />))
    selectAllSessions()

    expect(screen.getAllByRole("checkbox").every(isChecked)).toBe(true)

    await clickAndWait(bulkDeleteButton())

    expect(screen.getAllByRole("checkbox").every(isChecked)).toBe(true)
    expect(screen.getByText(/2 selected/)).toBeTruthy()
  })

  it("a successful bulk delete clears the selection", async () => {
    vi.stubGlobal(
      "fetch",
      async (input: RequestInfo | URL, init?: RequestInit) => {
        if (
          (init?.method ?? "GET") === "DELETE" &&
          String(input).endsWith("/sessions")
        ) {
          // Deletes answer with a JSON body too (client.ts's requestJSON).
          return new Response(JSON.stringify({ removed: 2 }), { status: 200 })
        }
        return offline()
      }
    )

    render(withQueryClient(<SessionsRoute />))
    selectAllSessions()

    await clickAndWait(bulkDeleteButton())

    expect(screen.queryByText(/selected$/)).toBeNull()
  })
})
