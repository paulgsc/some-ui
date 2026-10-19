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
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { sha256Hex } from "@/lib/device-backend/common"
import type { HomeRequest } from "@/lib/device-backend/native-http"
import { CONSENT_KEY } from "@/lib/home-link/consent-runtime"
import { SENT_KEY } from "@/lib/home-link/sent"

const home = vi.hoisted(
  (): { sent: Array<unknown>; record: string | null } => ({
    sent: [],
    record: null,
  })
)

vi.mock("@/lib/device-backend/native-http", () => ({
  homeRequest: (
    call: HomeRequest
  ): Promise<{ status: number; body: string }> => {
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

/** How long a step that digests kept items may take. */
const SLOW = 5_000

// A test waits on up to three such steps.
vi.setConfig({ testTimeout: 4 * SLOW })

async function press(name: RegExp): Promise<void> {
  // The confirm appears once the count, which digests each kept item, is
  // in, and a button is pressed once the run before it has ended.
  // Digesting runs on the real `crypto.subtle`, slower on a loaded runner
  // than the default second allows.
  const button = await waitFor(
    () => {
      const found = screen.getByRole("button", { name })
      expect(found).toHaveProperty("disabled", false)
      return found
    },
    { timeout: SLOW }
  )
  await act(async () => {
    fireEvent.click(button)
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
      await screen.findByText(
        /send 1 session and 2 kept items to home.example\? finished sessions are cleared from this phone/i
      )
    ).toBeTruthy()

    await press(/^cancel$/i)
    expect(home.sent).toEqual([])

    await press(/send to home.example/i)
    await press(/^send 3$/i)
    await waitFor(() => {
      expect(home.sent[0]).toMatchObject({
        method: "POST",
        url: "https://home.example/api/v1/sessions",
        token: "t",
      })
    })
  })

  it("counts and sends only the kept items home didn't take as they are", async () => {
    home.record = JSON.stringify({
      base: "https://home.example/api/v1",
      token: "t",
    })
    localStorage.setItem(
      SENT_KEY,
      JSON.stringify({
        pairing: "https://home.example/api/v1",
        sessions: {},
        shelf: {
          "topik/a": await sha256Hex('{"a":1}'),
          "leetype/b": await sha256Hex("{}"),
        },
        refused: {},
      })
    )
    await open()
    await press(/send to home.example/i)
    expect(
      await screen.findByText(
        /^send 1 session to home.example\?/i,
        {},
        { timeout: SLOW }
      )
    ).toBeTruthy()
    await press(/^send 1$/i)
    // Once the send has run to its end, as its last line says.
    expect(
      await screen.findByText(/^Last send:/, {}, { timeout: SLOW })
    ).toBeTruthy()
    expect(
      home.sent.filter((call) => JSON.stringify(call).includes("/shelf/"))
    ).toEqual([])
  })

  it("offers again a kept item home refused, since a tap is the way to retry", async () => {
    home.record = JSON.stringify({
      base: "https://home.example/api/v1",
      token: "t",
    })
    localStorage.setItem(
      SENT_KEY,
      JSON.stringify({
        pairing: "https://home.example/api/v1",
        sessions: {},
        shelf: { "topik/a": await sha256Hex('{"a":1}') },
        refused: { "leetype/b": await sha256Hex("{}") },
      })
    )
    await open()
    await press(/send to home.example/i)
    expect(
      await screen.findByText(
        /^send 1 session and 1 kept item to home.example\?/i
      )
    ).toBeTruthy()
    await press(/^send 2$/i)
    expect(
      await screen.findByText(/^Last send:/, {}, { timeout: SLOW })
    ).toBeTruthy()
    expect(
      home.sent.filter((call) => JSON.stringify(call).includes("/shelf/"))
    ).toEqual([
      expect.objectContaining({
        method: "PUT",
        url: "https://home.example/api/v1/shelf/leetype/b",
      }),
    ])
  })

  it("keeps sending Practice only when its box is ticked, and asks every time until then", async () => {
    home.record = JSON.stringify({
      base: "https://home.example/api/v1",
      token: "t",
    })
    await open()
    const box = (): Promise<HTMLElement> =>
      screen.findByRole("checkbox", { name: /keep sending these to home/i })

    await press(/send to home.example/i)
    expect(await box()).toHaveProperty("checked", false)
    await press(/^send 3$/i)
    expect(localStorage.getItem(CONSENT_KEY)).toBeNull()

    await press(/send to home.example/i)
    const ticked = await box()
    expect(ticked).toHaveProperty("checked", false)
    act(() => {
      fireEvent.click(ticked)
    })
    await press(/^send 3$/i)
    const log: unknown = JSON.parse(localStorage.getItem(CONSENT_KEY) ?? "[]")
    expect(log).toEqual([
      expect.objectContaining({
        kind: "kept",
        pairing: "https://home.example/api/v1",
        scopes: ["sessions", "shelf"],
        said: expect.stringMatching(
          /^Keep sending these to home from now on\./
        ),
      }),
    ])

    await press(/send to home.example/i)
    expect(
      await screen.findByText(
        /go to home on their own while Practice is open/,
        {},
        { timeout: SLOW }
      )
    ).toBeTruthy()
    expect(screen.queryByRole("checkbox")).toBeNull()
  })
})
