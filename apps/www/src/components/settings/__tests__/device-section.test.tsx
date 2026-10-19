/**
 * @vitest-environment jsdom
 *
 * LA8 on the phone's Settings: opening it reads only the phone's own pairing
 * and sends nothing; the destination is named before any tap that sends;
 * unpairing and sending each take a second, deliberate press. LA11: the send's
 * confirm offers, unticked every time, to keep sending Practice, and only a
 * tick adds that choice to the consent log.
 */

import type { ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { HomeCall } from "@/lib/device-backend/native-http"
import { CONSENT_KEY } from "@/lib/home-link/consent-runtime"

const home = vi.hoisted(
  (): { sent: Array<unknown>; record: string | null } => ({
    sent: [],
    record: null,
  })
)

vi.mock("@/lib/device-backend/native-http", () => ({
  homeRequest: (call: HomeCall): Promise<{ status: number; body: string }> => {
    home.sent.push(call)
    return Promise.resolve({ status: 200, body: "{}" })
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
  sessionsKey: ["tenant", "sessions"],
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

  it("sends only after a confirm that names what and the host", async () => {
    home.record = JSON.stringify({
      base: "https://home.example/api/v1",
      token: "t",
    })
    await open()
    await press(/send to home.example/i)
    expect(home.sent).toEqual([])
    expect(
      screen.getByText(
        /send 1 session and 2 kept items to home.example\? finished sessions are cleared from this phone/i
      )
    ).toBeTruthy()

    await press(/^cancel$/i)
    expect(home.sent).toEqual([])

    await press(/send to home.example/i)
    await press(/^send 3$/i)
    expect(home.sent[0]).toMatchObject({
      method: "POST",
      url: "https://home.example/api/v1/sessions",
      token: "t",
    })
  })

  it("keeps sending Practice only when its box is ticked, and asks every time until then", async () => {
    home.record = JSON.stringify({
      base: "https://home.example/api/v1",
      token: "t",
    })
    await open()
    const box = (): HTMLInputElement =>
      screen.getByRole("checkbox", { name: /keep sending these to home/i })

    await press(/send to home.example/i)
    expect(box().checked).toBe(false)
    await press(/^send 3$/i)
    expect(localStorage.getItem(CONSENT_KEY)).toBeNull()

    await press(/send to home.example/i)
    expect(box().checked).toBe(false)
    act(() => {
      fireEvent.click(box())
    })
    await press(/^send 3$/i)
    const log: unknown = JSON.parse(localStorage.getItem(CONSENT_KEY) ?? "[]")
    expect(log).toEqual([
      expect.objectContaining({
        kind: "kept",
        scopes: ["sessions", "shelf"],
        said: expect.stringMatching(
          /^Keep sending these to home from now on\./
        ),
      }),
    ])

    await press(/send to home.example/i)
    expect(screen.queryByRole("checkbox")).toBeNull()
    expect(
      screen.getByText(/go to home on their own while Practice is open/)
    ).toBeTruthy()
  })
})
