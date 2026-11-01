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
import { fakeQueryResult, withQueryClient } from "@/test-support/query-client"
import { routeComponent } from "@/test-support/router-stubs"
import { sessionRecord } from "@/test-support/session-record"
import { signInForTests } from "@/test-support/sign-in"
import type { HomeCall } from "@some-ui/core-utils"
import type * as ReactRouterModule from "@tanstack/react-router"
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react"
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
import type * as TenantModule from "@/lib/tenant"

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

vi.mock(
  "@/lib/tenant",
  async (importOriginal): Promise<typeof TenantModule> => ({
    ...(await importOriginal<typeof TenantModule>()),
    useSessions: () =>
      fakeQueryResult({
        data: [sessionRecord({ id: "session-1", name: "Evening reading" })],
        isLoading: false,
      }),
  })
)

// The Android app's build has its device backend; the route picks the row's
// "Let it go" by it when it loads.
vi.stubEnv("VITE_DEVICE_BACKEND", "true")
const { Route } = await import("@/routes/_dashboard/sessions/index")
const SessionsRoute = routeComponent(Route)

let deletes: Array<string>
let deleteStatus = 200

beforeEach(() => {
  signInForTests()
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

  it("says so in the row when letting it go fails", async () => {
    deleteStatus = 500
    render(withQueryClient(<SessionsRoute />))

    const sheet = openMenuAndLetGo()
    await act(async () => {
      fireEvent.click(within(sheet).getByRole("button", { name: "Let it go" }))
      await new Promise((resolve) => setTimeout(resolve, 20))
    })

    expect(await screen.findByRole("alert")).toBeTruthy()
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
