/**
 * @vitest-environment jsdom
 *
 * LA8 on the phone's Settings: opening it reads only the phone's own pairing
 * and sends nothing; the destination is named before any tap; unpairing and
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
  } => ({
    sent: [],
    record: null,
    sessions: [],
    gone: [],
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
    // Pairing's own requests are answered; a read of a session finds none.
    return Promise.resolve(
      call.method === "GET"
        ? { status: 404, body: "{}" }
        : { status: 200, body: "{}" }
    )
  },
}))
vi.mock("@/lib/home-link/credential", () => ({
  nativeCredential: {
    read: (): Promise<{ record: string | null; lost: boolean }> =>
      Promise.resolve({ record: home.record, lost: false }),
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
vi.mock("@/lib/session-archive", () => ({
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
    expect(screen.getByText("Paired · home.example")).toBeTruthy()
    expect(
      screen.getByText(/goes to home on its own while the app is open/i)
    ).toBeTruthy()
    expect(home.sent).toEqual([])
  })

  it("names the server on the pair button, and refuses an http address", async () => {
    await open()
    await press(/^pair/i)
    fireEvent.change(screen.getByLabelText(/home server address/i), {
      target: { value: "http://192.168.1.10:3000" },
    })
    expect(screen.getByText(/pairing needs an https/i)).toBeTruthy()

    fireEvent.change(screen.getByLabelText(/home server address/i), {
      target: { value: "home.example" },
    })
    fireEvent.change(screen.getByLabelText(/code from your computer/i), {
      target: { value: "k7qf 2m9" },
    })
    const button = screen.getByRole("button", {
      name: /pair with home.example/i,
    })
    expect(button).toHaveProperty("disabled", true)
    expect(home.sent).toEqual([])
  })

  it("unpairs only on the second press, with one request", async () => {
    paired()
    await open()
    await press(/^unpair$/i)
    expect(home.sent).toEqual([])
    expect(screen.getByText(/unpair from home.example\?/i)).toBeTruthy()

    await press(/^keep$/i)
    expect(home.sent).toEqual([])
    expect(screen.getByText("Paired · home.example")).toBeTruthy()

    await press(/^unpair$/i)
    await press(/^yes, unpair$/i)
    expect(home.sent).toHaveLength(1)
    expect(screen.getByText("Unpaired.")).toBeTruthy()
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
