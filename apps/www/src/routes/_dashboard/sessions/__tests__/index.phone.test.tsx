/**
 * @vitest-environment jsdom
 *
 * The phone's sessions list (Practice's Study tab): rows that open on a tap,
 * "New" always at the top, and letting a session go through the
 * ConfirmSheet: deleted on a phone that is not paired, and on a paired one
 * kept on home first, staying here when home can't keep it
 * (`lib/home-link/study-let-go`, whose own test holds each end). Vitest
 * builds the `lan` profile, so the build profile is mocked to the phone's
 * here, with its device backend, and the link to home is a fake whose
 * pairing each test sets.
 */

import { noAnswer } from "@/test-support/no-answer"
import { withQueryClient } from "@/test-support/query-client"
import { routeComponent } from "@/test-support/router-stubs"
import { sessionRecord } from "@/test-support/session-record"
import { signInForTests } from "@/test-support/sign-in"
import type { HomeAnswer, HomeCall } from "@some-ui/core-utils"
import { addFailureSink } from "@some-ui/intent-kit"
import type * as ReactRouterModule from "@tanstack/react-router"
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react"
import { toast } from "sonner"
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"

import type * as BuildProfileModule from "@/lib/build-profile"
import type { HomeLink, HomeLinkState } from "@/lib/home-link"
import {
  readDurableFailure,
  writeDurableFailure,
} from "@/lib/intent/durable-failure"
import type * as TenantModule from "@/lib/tenant"
import type { SessionRecord } from "@/lib/tenant"

const UNPAIRED: HomeLinkState = {
  link: { kind: "unpaired", note: null },
  activity: { kind: "idle" },
  pairFailure: null,
}

const PAIRED: HomeLinkState = {
  link: {
    kind: "paired",
    base: "https://home.example/api/v1",
    id: "pairing-1",
    notForgotten: false,
  },
  activity: { kind: "idle" },
  pairFailure: null,
}

const rows = vi.hoisted((): { list: Array<SessionRecord> } => ({ list: [] }))

const home = vi.hoisted(
  (): { state: HomeLinkState | null; send: HomeCall | null } => ({
    state: null,
    send: null,
  })
)

vi.mock("@/lib/home-link", async () => {
  const { hostOf } = await import("@/lib/home-link/address")
  const current = (): HomeLinkState => {
    if (home.state === null) throw new Error("no pairing set")
    return home.state
  }
  return {
    hostOf,
    useHomeLink: current,
    homeLink: (): Pick<HomeLink, "load" | "getSnapshot" | "send"> => ({
      load: (): Promise<void> => Promise.resolve(),
      getSnapshot: current,
      send: async <T,>(
        run: (send: HomeCall) => Promise<T>
      ): Promise<{ kind: "done"; value: T }> => {
        if (home.send === null) throw new Error("no send")
        return { kind: "done", value: await run(home.send) }
      },
    }),
  }
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
    const { withPlainLink } = await import("@/test-support/router-stubs")
    return withPlainLink(await importOriginal<typeof ReactRouterModule>())
  }
)

// The list as a real query over `rows`, so a let-go's refresh shows the row
// leaving.
vi.mock(
  "@/lib/tenant",
  async (importOriginal): Promise<typeof TenantModule> => {
    const { useQuery } = await import("@tanstack/react-query")
    return {
      ...(await importOriginal<typeof TenantModule>()),
      useSessions: () =>
        useQuery({
          queryKey: ["tenant", "sessions"],
          queryFn: () => Promise.resolve([...rows.list]),
          initialData: () => [...rows.list],
        }),
    }
  }
)
// The phone's own database is the list: home holding it lets it go there.
vi.mock("@/lib/home-link/let-go", () => ({
  letGoUnchanged: (held: ReadonlyArray<{ id: string }>): Promise<number> => {
    rows.list = rows.list.filter((s) => !held.some((h) => h.id === s.id))
    return Promise.resolve(held.length)
  },
}))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

// The Android app's build has its device backend; the route picks the row's
// "Let it go" by it when it loads.
vi.stubEnv("VITE_DEVICE_BACKEND", "true")
const { Route } = await import("@/routes/_dashboard/sessions/index")
const SessionsRoute = routeComponent(Route)

let deletes: Array<string>
let deleteStatus = 200

const EVENING = sessionRecord({ id: "session-1", name: "Evening reading" })

/**
 * A home that keeps what it is sent, as `file_host` answers `/sessions`: a
 * create under the id it names, a patch, and a read of either.
 */
function keepingHome(): HomeCall {
  const held = new Map<string, Record<string, unknown>>()
  const answer = (status: number, body: unknown): Promise<HomeAnswer> =>
    Promise.resolve({ status, body: JSON.stringify(body) })
  return (method, path, body) => {
    const sent: unknown = typeof body === "string" ? JSON.parse(body) : {}
    const fields = typeof sent === "object" && sent !== null ? sent : {}
    if (method === "POST" && path === "/sessions") {
      const created: Record<string, unknown> = {
        ...fields,
        status: "draft",
        origin: "user",
        totalDurationMs: 0,
        createdAt: "2026-11-01T00:00:00.000Z",
        updatedAt: "2026-11-01T00:00:00.000Z",
      }
      held.set(String(created.id), created)
      return answer(200, created)
    }
    const there = held.get(decodeURIComponent(path.replace("/sessions/", "")))
    if (there === undefined) return answer(404, { error: "not_found" })
    if (method === "PATCH") Object.assign(there, fields)
    return answer(200, there)
  }
}

beforeEach(() => {
  signInForTests()
  rows.list = [EVENING]
  deletes = []
  deleteStatus = 200
  home.state = UNPAIRED
  home.send = null
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === "DELETE") deletes.push(String(input))
    // The client reads every answer as JSON (`requestJSON`); a read of the
    // session finds it on the phone.
    const body =
      init?.method === undefined || init.method === "GET"
        ? JSON.stringify(
            sessionRecord({ id: "session-1", name: "Evening reading" })
          )
        : "{}"
    const status = init?.method === "DELETE" ? deleteStatus : 200
    return Promise.resolve(new Response(body, { status }))
  })
})

afterAll(() => {
  vi.unstubAllEnvs()
})

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function openMenuAndLetGo(): HTMLElement {
  fireEvent.click(
    screen.getByRole("button", { name: "More for Evening reading" })
  )
  fireEvent.click(screen.getByRole("button", { name: "Let it go" }))
  return screen.getByRole("dialog", { name: "Let this session go?" })
}

describe("sessions list on the phone", () => {
  it("opens a row on a tap and keeps New at the top, with no multi-select", () => {
    render(withQueryClient(<SessionsRoute />))

    expect(screen.queryByRole("checkbox")).toBeNull()
    // The router stub renders `to`, not `href` (test-support/router-stubs).
    expect(screen.getByText("New").closest("a")?.getAttribute("to")).toBe(
      "/sessions/new"
    )
    expect(
      screen.getByText("Evening reading").closest("a")?.getAttribute("to")
    ).toBe("/sessions/new")
  })

  it("on a phone that is not paired, lets a session go only once the sheet is answered yes", async () => {
    render(withQueryClient(<SessionsRoute />))

    const sheet = openMenuAndLetGo()
    expect(
      within(sheet).getByText(
        '"Evening reading" leaves this phone, and can\'t be brought back.'
      )
    ).toBeTruthy()
    expect(deletes).toEqual([])
    await act(async () => {
      fireEvent.click(within(sheet).getByRole("button", { name: "Let it go" }))
      await new Promise((resolve) => setTimeout(resolve, 20))
    })

    expect(deletes).toHaveLength(1)
    expect(deletes[0]).toContain("session-1")
    expect(screen.queryByRole("alert")).toBeNull()
  })

  it("says so in the row when letting it go fails, reports it, and lets it go on a retry", async () => {
    deleteStatus = 500
    const reports: Array<string> = []
    const stop = addFailureSink((failure) => {
      reports.push(failure.port)
    })
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    render(withQueryClient(<SessionsRoute />))

    const sheet = openMenuAndLetGo()
    await act(async () => {
      fireEvent.click(within(sheet).getByRole("button", { name: "Let it go" }))
      await new Promise((resolve) => setTimeout(resolve, 20))
    })

    const alert = await screen.findByRole("alert")
    expect(deletes).toHaveLength(1)
    expect(reports).toEqual(["intent"])

    deleteStatus = 200
    await act(async () => {
      fireEvent.click(within(alert).getByRole("button", { name: "Try again" }))
      await new Promise((resolve) => setTimeout(resolve, 20))
    })
    stop()

    expect(deletes).toHaveLength(2)
    expect(screen.queryByRole("alert")).toBeNull()
    expect(reports).toEqual(["intent"])
  })

  it("on a paired phone, lets it go once home holds it, says so, and the row leaves", async () => {
    home.state = PAIRED
    home.send = keepingHome()
    writeDurableFailure("session-1", { kind: "unknown", summary: "Not saved" })
    render(withQueryClient(<SessionsRoute />))

    const sheet = openMenuAndLetGo()
    await act(async () => {
      fireEvent.click(within(sheet).getByRole("button", { name: "Let it go" }))
      await new Promise((resolve) => setTimeout(resolve, 20))
    })

    expect(vi.mocked(toast.success)).toHaveBeenCalledWith(
      "Gone from this phone. home.example keeps it."
    )
    expect(await screen.findByText("No sessions yet.")).toBeTruthy()
    expect(screen.queryByText("Evening reading")).toBeNull()
    // Nothing deleted it but home's word, and its warning went with it.
    expect(deletes).toEqual([])
    expect(readDurableFailure("session-1")).toBeNull()
  })

  it("on a paired phone, says home keeps it, and keeps it here when home can't be reached", async () => {
    home.state = PAIRED
    const sent: Array<string> = []
    home.send = (method, path): Promise<never> => {
      sent.push(`${method} ${path}`)
      return Promise.reject(noAnswer())
    }
    render(withQueryClient(<SessionsRoute />))

    const sheet = openMenuAndLetGo()
    expect(
      within(sheet).getByText(
        '"Evening reading" leaves this phone, and home.example keeps it. If home.example can\'t, it stays here.'
      )
    ).toBeTruthy()
    await act(async () => {
      fireEvent.click(within(sheet).getByRole("button", { name: "Let it go" }))
      await new Promise((resolve) => setTimeout(resolve, 20))
    })

    // It asked home to keep it, and the phone deleted nothing.
    expect(sent).toContain("POST /sessions")
    expect(deletes).toEqual([])
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Couldn't reach home.example. Are you on the home network? It stays on this phone."
    )
  })

  it("keeps the session when the sheet is answered no", () => {
    render(withQueryClient(<SessionsRoute />))

    const sheet = openMenuAndLetGo()
    fireEvent.click(within(sheet).getByRole("button", { name: "Keep it" }))

    expect(screen.queryByRole("dialog")).toBeNull()
    expect(deletes).toEqual([])
  })
})
