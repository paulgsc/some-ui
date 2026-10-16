/**
 * @vitest-environment jsdom
 *
 * LA8 on the phone's Settings: opening it reads only the phone's own pairing
 * and sends nothing; the destination is named before any tap that sends;
 * unpairing and sending the shelf each take a second, deliberate press;
 * browsing home's sessions reads once per tap, and searching them sends
 * nothing.
 */

import type { ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { HomeCall } from "@/lib/device-backend/native-http"

const home = vi.hoisted(
  (): { sent: Array<unknown>; record: string | null } => ({
    sent: [],
    record: null,
  })
)

/** What home's `GET /sessions` answers. */
const ON_HOME = [
  { name: "Hangul warm-up", status: "completed", completedAt: "2026-10-01" },
  { name: "Korean listening", status: "completed", completedAt: "2026-10-09" },
  { name: "Leetype sprint", status: "paused", completedAt: undefined },
].map(({ name, status, completedAt }, i) => ({
  id: `h${i}`,
  name,
  status,
  activities: [],
  scenes: [],
  layoutMode: "basic",
  totalDurationMs: 600_000,
  createdAt: "2026-09-30T09:00:00.000Z",
  updatedAt: "2026-10-10T09:00:00.000Z",
  ...(completedAt === undefined
    ? {}
    : { completedAt: `${completedAt}T09:10:00.000Z` }),
}))

vi.mock("@/lib/device-backend/native-http", () => ({
  homeRequest: (call: HomeCall): Promise<{ status: number; body: string }> => {
    home.sent.push(call)
    const listing = call.method === "GET" && call.url.endsWith("/sessions")
    return Promise.resolve({
      status: 200,
      body: listing ? JSON.stringify(ON_HOME) : "{}",
    })
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
vi.mock("@/lib/device-backend/boot", () => ({
  deviceBackend: (): Promise<{ context: { db: object } }> =>
    Promise.resolve({ context: { db: {} } }),
}))
vi.mock("@/lib/device-backend/handlers/shelf", () => ({
  everyKept: (): Promise<
    Array<{ activity: string; key: string; body: string }>
  > =>
    Promise.resolve([
      { activity: "topik", key: "a", body: '{"a":1}' },
      { activity: "leetype", key: "b", body: "{}" },
    ]),
}))
vi.mock("@/lib/tenant/queries", () => ({
  sessionsRepository: {
    list: (): Promise<Array<object>> =>
      Promise.resolve([
        {
          id: "s1",
          name: "Korean review",
          status: "scheduled",
          activities: [],
          scenes: [],
          layoutMode: "basic",
          totalDurationMs: 600_000,
          createdAt: "2026-10-14T09:00:00.000Z",
          updatedAt: "2026-10-14T09:00:00.000Z",
        },
      ]),
  },
}))
vi.mock("@/components/settings/device-storage", () => ({
  DeviceStorageSummary: (): null => null,
  DeviceArchive: (): null => null,
}))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

afterEach(() => {
  cleanup()
  home.sent.length = 0
  home.record = null
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
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }))
    // Long enough for the runtime's chain of port calls to finish.
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

describe("DeviceSection's Home server block", () => {
  it("sends nothing when opened, paired or not", async () => {
    await open()
    expect(screen.getByRole("button", { name: /pair/i })).toBeTruthy()
    cleanup()
    vi.resetModules()

    home.record = JSON.stringify({
      base: "https://home.example/api/v1",
      token: "t",
    })
    await open()
    expect(screen.getByText("Paired · home.example")).toBeTruthy()
    expect(
      screen.getByText(/nothing is sent unless you tap below/i)
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
    home.record = JSON.stringify({
      base: "https://home.example/api/v1",
      token: "t",
    })
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

  it("sends the shelf only after a confirm that names the count and the host", async () => {
    home.record = JSON.stringify({
      base: "https://home.example/api/v1",
      token: "t",
    })
    await open()
    await press(/send shelf to home.example/i)
    expect(home.sent).toEqual([])
    expect(
      screen.getByText(
        /send 2 kept items \(1 TOPIK, 1 Leetype\) to home.example\?/i
      )
    ).toBeTruthy()

    await press(/^cancel$/i)
    expect(home.sent).toEqual([])

    await press(/send shelf to home.example/i)
    await press(/^send 2$/i)
    expect(home.sent).toHaveLength(2)
  })

  it("copies sessions only after a confirm that names the count and the host", async () => {
    home.record = JSON.stringify({
      base: "https://home.example/api/v1",
      token: "t",
    })
    await open()
    await press(/copy sessions to home.example/i)
    expect(home.sent).toEqual([])
    expect(screen.getByText(/copy 1 session to home.example\?/i)).toBeTruthy()
    expect(
      screen.getByText(
        /each finished session home.example confirms it holds leaves this phone/i
      )
    ).toBeTruthy()

    await press(/^cancel$/i)
    expect(home.sent).toEqual([])

    await press(/copy sessions to home.example/i)
    await press(/^copy 1$/i)
    expect(home.sent[0]).toMatchObject({
      method: "POST",
      url: "https://home.example/api/v1/sessions",
      token: "t",
    })
  })

  it("reads home's sessions once per tap, and searches them without sending", async () => {
    home.record = JSON.stringify({
      base: "https://home.example/api/v1",
      token: "t",
    })
    await open()
    expect(home.sent).toEqual([])
    await press(/browse sessions on home.example/i)
    expect(home.sent).toEqual([
      expect.objectContaining({
        method: "GET",
        url: "https://home.example/api/v1/sessions",
        token: "t",
      }),
    ])
    const list = (): Array<string> =>
      screen
        .getAllByRole("listitem")
        .map((item) => item.querySelector("p")?.textContent ?? "")
    expect(screen.getByText("3 sessions on home.example")).toBeTruthy()
    expect(list()).toEqual([
      "Leetype sprint",
      "Korean listening",
      "Hangul warm-up",
    ])

    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "korean" },
    })
    expect(list()).toEqual(["Korean listening"])
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "" },
    })
    fireEvent.click(screen.getByRole("button", { name: /^not finished$/i }))
    expect(list()).toEqual(["Leetype sprint"])
    expect(home.sent).toHaveLength(1)

    await press(/read home.example's sessions again/i)
    expect(home.sent).toHaveLength(2)
  })
})
