/**
 * @vitest-environment jsdom
 *
 * LA8 on the phone's Settings: opening it reads only the phone's own pairing
 * and sends nothing; the destination is named before any tap; signing out and
 * the clear of finished sessions home holds each take a second, deliberate
 * press, and the clear only reads home, letting go of nothing it does not
 * hold. Once paired, the page says what goes on its own (LA15).
 */

import type { ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { HomeRequest } from "@/lib/device-backend/native-http"
import type { SessionRecord } from "@/lib/tenant/types"

const home = vi.hoisted(
  (): {
    sent: Array<HomeRequest>
    record: string | null
    sessions: Array<SessionRecord>
    gone: Array<string>
    /** Whether home refuses the phone's key, as one that forgot it does. */
    forgot: boolean
    /** The pairing record's read, held until the test ends it (PO1). */
    held: Promise<void> | null
  } => ({
    sent: [],
    record: null,
    sessions: [],
    gone: [],
    forgot: false,
    held: null,
  })
)

const FINISHED: SessionRecord = {
  id: "s1",
  name: "Korean review",
  status: "completed",
  activities: [],
  scenes: [],
  layoutMode: "basic",
  totalDurationMs: 600_000,
  createdAt: "2026-10-14T09:00:00.000Z",
  updatedAt: "2026-10-14T09:00:00.000Z",
  startedAt: "2026-10-14T09:00:00.000Z",
  completedAt: "2026-10-14T09:10:00.000Z",
}

vi.mock("@/lib/device-backend/native-http", () => ({
  homeRequest: (
    call: HomeRequest
  ): Promise<{ status: number; body: string }> => {
    home.sent.push(call)
    if (call.url.endsWith("/auth/pairing/finish")) {
      return Promise.resolve({
        status: 200,
        body: JSON.stringify({ token: "new", expiresAt: 1 }),
      })
    }
    if (home.forgot && call.token !== undefined) {
      return Promise.resolve({ status: 401, body: "{}" })
    }
    // A read of a session finds none.
    return Promise.resolve(
      call.method === "GET"
        ? { status: 404, body: "{}" }
        : { status: 200, body: "{}" }
    )
  },
}))
vi.mock("@/lib/home-link/credential", () => ({
  nativeCredential: {
    read: async (): Promise<{ record: string | null; lost: boolean }> => {
      await home.held
      return { record: home.record, lost: false }
    },
    write: (record: string): Promise<void> => {
      home.record = record
      return Promise.resolve()
    },
    clear: (): Promise<void> => {
      home.record = null
      return Promise.resolve()
    },
  },
}))
vi.mock("@/lib/tenant/queries", () => ({
  sessionsKey: ["tenant", "sessions"],
  sessionsRepository: {
    list: (): Promise<Array<SessionRecord>> =>
      Promise.resolve([...home.sessions]),
  },
}))
vi.mock("@/lib/home-link/let-go", () => ({
  letGoUnchanged: (sessions: ReadonlyArray<SessionRecord>): Promise<number> => {
    home.gone.push(...sessions.map((s) => s.id))
    return Promise.resolve(sessions.length)
  },
}))
// The readouts have their own tests (`device-kept-on-home.test.tsx`).
vi.mock("@/components/settings/device-kept-on-home", () => ({
  KeptOnHome: (): null => null,
}))
vi.mock("@/components/settings/device-routine-reads", () => ({
  DeviceRoutineReads: (): null => null,
}))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

afterEach(() => {
  cleanup()
  home.sent.length = 0
  home.record = null
  home.sessions = []
  home.gone = []
  home.forgot = false
  home.held = null
  localStorage.clear()
  vi.resetModules()
})

function wrap(children: ReactNode): ReactNode {
  return (
    <QueryClientProvider client={new QueryClient()}>
      {children}
    </QueryClientProvider>
  )
}

async function open(): Promise<void> {
  const { DeviceSection } = await import("@/components/settings/device-section")
  await act(async () => {
    render(wrap(<DeviceSection />))
    await Promise.resolve()
  })
}

async function press(name: RegExp): Promise<void> {
  const button = await waitFor(() => {
    const found = screen.getByRole("button", { name })
    expect(found).toHaveProperty("disabled", false)
    return found
  })
  await act(async () => {
    fireEvent.click(button)
    // Long enough for the runtime's chain of port calls to finish.
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

const paired = (): void => {
  home.record = JSON.stringify({
    base: "https://home.example/api/v1",
    token: "t",
  })
}

describe("DeviceSection's Home server block", () => {
  it("sends nothing when opened, paired or not, and says what goes on its own", async () => {
    await open()
    expect(screen.getByRole("button", { name: /pair/i })).toBeTruthy()
    cleanup()
    vi.resetModules()

    paired()
    await open()
    expect(screen.getByText("Signed in to home at home.example.")).toBeTruthy()
    expect(
      screen.getByText(/goes to home on its own while the app is open/i)
    ).toBeTruthy()
    expect(home.sent).toEqual([])
  })

  it("shows neither the address form nor Pair while the pairing record is read, then the layout it finds (PO1)", async () => {
    for (const found of ["none", "a pairing"] as const) {
      let end: () => void = () => undefined
      home.held = new Promise((resolve) => {
        end = resolve
      })
      if (found === "a pairing") paired()
      await open()
      expect(document.querySelector("#home-server")).toBeNull()
      expect(screen.queryByRole("button", { name: /pair/i })).toBeNull()
      expect(screen.queryByText(/signed in to home/i)).toBeNull()
      await act(async () => {
        end()
        await new Promise((resolve) => setTimeout(resolve, 0))
      })
      if (found === "none") {
        expect(document.querySelector("#home-server")).not.toBeNull()
        expect(screen.getByRole("button", { name: /pair/i })).toBeTruthy()
      } else {
        expect(document.querySelector("#home-server")).toBeNull()
        expect(
          screen.getByText("Signed in to home at home.example.")
        ).toBeTruthy()
      }
      cleanup()
      vi.resetModules()
      home.record = null
    }
    expect(home.sent).toEqual([])
  })

  it("starts pairing from the sync's address, names the server on Pair, and refuses an http address", async () => {
    await open()
    const typed = document.querySelector("#home-server")
    if (typed === null) throw new Error("no Home server field")
    fireEvent.change(typed, { target: { value: "home.example" } })
    await press(/^pair/i)
    // Its own field, started from the sync's: pairing reads a bare host as
    // https, the sync as plain http (C473).
    expect(screen.getByLabelText("Home's address")).toHaveProperty(
      "value",
      "home.example"
    )
    fireEvent.change(screen.getByLabelText(/code from your computer/i), {
      target: { value: "k7qf 2m9" },
    })
    const button = screen.getByRole("button", {
      name: /pair with home.example/i,
    })
    expect(button).toHaveProperty("disabled", true)
    fireEvent.change(screen.getByLabelText("Home's address"), {
      target: { value: "http://192.168.1.10:3000" },
    })
    expect(screen.getByText(/pairing needs a secure address/i)).toBeTruthy()
    expect(home.sent).toEqual([])
  })

  it("signs out only on the second press, with one request, saying what each place keeps", async () => {
    paired()
    await open()
    await press(/^sign out of home$/i)
    expect(home.sent).toEqual([])
    expect(screen.getByText("Sign out of home at home.example?")).toBeTruthy()
    expect(
      screen.getByText("This phone keeps everything it holds.")
    ).toBeTruthy()
    expect(
      screen.getByText("Home keeps everything already sent to it.")
    ).toBeTruthy()

    await press(/^stay signed in$/i)
    expect(home.sent).toEqual([])
    expect(screen.getByText("Signed in to home at home.example.")).toBeTruthy()

    expect(localStorage.getItem("some-ui.home.welcome-not-now.v1")).toBeNull()
    await press(/^sign out of home$/i)
    await press(/^yes, sign out$/i)
    expect(home.sent).toHaveLength(1)
    expect(screen.getByText("Signed out of home.")).toBeTruthy()
    // So a restart, which reads no record, doesn't take it for a restore
    // and open the first run's welcome (SIGNIN2).
    expect(localStorage.getItem("some-ui.home.welcome-not-now.v1")).toBe(
      "unpaired"
    )
  })

  it("pairs again in place once home has forgotten the phone, from the old pairing's address (SIGNIN3)", async () => {
    paired()
    home.forgot = true
    await open()
    expect(screen.queryByRole("button", { name: /^pair again$/i })).toBeNull()
    const { homeLink } = await import("@/lib/home-link")
    await act(() => homeLink().check())
    await press(/^pair again$/i)
    expect(screen.getByLabelText("Home's address")).toHaveProperty(
      "value",
      "https://home.example"
    )
    expect(
      screen.getByText(/in place of the sign-in home forgot/i)
    ).toBeTruthy()
    const code = document.querySelector("#pair-code")
    if (code === null) throw new Error("no code field")
    fireEvent.change(code, { target: { value: "K7QF 2M9X" } })
    const before = home.sent.length
    await press(/^pair with home\.example$/i)
    await waitFor(() =>
      expect(
        screen.getByText(/^signed in to home at home\.example/i)
      ).toBeTruthy()
    )
    // One request, the pairing's, and nothing under the old key beside it.
    expect(home.sent.slice(before).map((call) => call.url)).toEqual([
      "https://home.example/api/v1/auth/pairing/finish",
    ])
    expect(JSON.parse(home.record ?? "{}")).toMatchObject({ token: "new" })
    // The form closed with the pairing made, and holds nothing back.
    expect(screen.queryByLabelText("Home's address")).toBeNull()
    expect(
      screen.getByRole("button", { name: /^sign out of home$/i })
    ).toHaveProperty("disabled", false)
  })

  it("clears finished sessions only after a confirm that names the count and the host, and only reads home", async () => {
    paired()
    home.sessions = [FINISHED, { ...FINISHED, id: "s2", status: "scheduled" }]
    await open()
    await press(/clear finished sessions home holds/i)
    expect(home.sent).toEqual([])
    expect(
      await screen.findByText(
        /clear 1 finished session from this phone\? .*home\.example holds exactly/i
      )
    ).toBeTruthy()

    await press(/^keep them$/i)
    expect(home.sent).toEqual([])

    await press(/clear finished sessions home holds/i)
    await press(/^clear them$/i)
    // Home holds no copy here, so nothing leaves; and home is only read.
    await waitFor(() =>
      expect(
        screen.getByRole("button", {
          name: /clear finished sessions home holds/i,
        })
      ).toBeTruthy()
    )
    expect(home.sent.every((call) => call.method === "GET")).toBe(true)
    expect(home.gone).toEqual([])
  })

  it("says when there is nothing to clear", async () => {
    paired()
    await open()
    await press(/clear finished sessions home holds/i)
    expect(
      await screen.findByText("No finished session to clear.")
    ).toBeTruthy()
    expect(home.sent).toEqual([])
  })
})
