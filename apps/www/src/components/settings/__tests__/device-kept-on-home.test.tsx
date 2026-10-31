/**
 * @vitest-environment jsdom
 *
 * Settings' readout of what this phone keeps on home (LA15): it reads the
 * phone's own pairing and what each record says, sends nothing on its own,
 * says each record's state in its own words, and never says a voice note waits that this phone can't send (LA14). The
 * status page's rows for the same records (#2165) come from here too.
 */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { SessionRecord } from "@/lib/tenant/types"
import type { Unsendable } from "@/lib/voice-home/model"

const home = vi.hoisted(
  (): {
    sent: Array<{ method: string; url: string; body?: unknown }>
    record: string | null
    /** Whether this build can tell the phone of a morning run (RUN5). */
    noticeOffered: boolean
    wanted: Array<boolean>
    unsent: Unsendable
    voiceWaiting: number
    /** Runs the voice lane's exchange made. */
    runs: number
  } => ({
    sent: [],
    record: JSON.stringify({ base: "https://home.example/api/v1", token: "t" }),
    noticeOffered: false,
    wanted: [],
    unsent: { gone: 0 },
    voiceWaiting: 0,
    runs: 0,
  })
)

vi.mock("@/lib/device-backend/native-http", () => ({
  homeRequest: (call: {
    method: string
    url: string
    body?: unknown
  }): Promise<{ status: number; body: string }> => {
    home.sent.push(call)
    return Promise.resolve({ status: 200, body: "{}" })
  },
}))
vi.mock("@/lib/home-link/credential", () => ({
  nativeCredential: {
    read: (): Promise<{ record: string | null; lost: boolean }> =>
      Promise.resolve({ record: home.record, lost: false }),
  },
}))
vi.mock("@/lib/home-link/going", () => ({
  readPhone: (): Promise<unknown> => Promise.resolve({ local: [], kept: [] }),
  logGoing: (): Promise<Array<never>> => Promise.resolve([]),
  studioGoing: (): Promise<unknown> =>
    Promise.resolve({ sittings: [], reports: [] }),
  notesGoing: (): Promise<Array<never>> => Promise.resolve([]),
}))
vi.mock("@/lib/home-link/lens-record", async (actual) => ({
  ...(await actual<object>()),
  lensGoing: (): Promise<Array<never>> => Promise.resolve([]),
}))
vi.mock("@/lib/jobs", async () => {
  const { EMPTY } = await import("@/lib/jobs/model")
  const made = (offered: boolean): unknown => ({
    state: EMPTY,
    notice: { offered, asking: false, why: null },
  })
  // One snapshot per `noticeOffered`, as `useSyncExternalStore` needs.
  const snapshots = new Map([true, false].map((o) => [o, made(o)]))
  return {
    phoneJobs: (): unknown => ({
      getSnapshot: () => snapshots.get(home.noticeOffered),
      subscribe: () => () => undefined,
      wantNotice: (on: boolean) => home.wanted.push(on),
    }),
  }
})
vi.mock("@/lib/tenant", () => ({
  useSessions: (): { data: Array<SessionRecord> } => ({ data: [] }),
}))
vi.mock("@/lib/home-link/voice", () => ({
  useUnsendable: (): Unsendable => home.unsent,
  voiceLane: {
    id: "voice",
    exchange: (): Promise<unknown> => {
      home.runs += 1
      return Promise.resolve({ kind: "synced" })
    },
    revision: (): number => 0,
    subscribe: (): (() => void) => () => undefined,
    useCounts: (): unknown => ({
      held: { voice: 0 },
      refused: { voice: 0 },
      waiting: home.voiceWaiting,
      hidden: 0,
      pulled: true,
    }),
  },
}))

afterEach(() => {
  cleanup()
  vi.resetModules()
  localStorage.clear()
  home.sent = []
  home.record = JSON.stringify({
    base: "https://home.example/api/v1",
    token: "t",
  })
  home.noticeOffered = false
  home.wanted = []
  home.unsent = { gone: 0 }
  home.voiceWaiting = 0
  home.runs = 0
})

async function mount(): Promise<void> {
  const { KeptOnHome } = await import(
    "@/components/settings/device-kept-on-home"
  )
  render(<KeptOnHome />)
  await act(() => Promise.resolve())
}

describe("what this phone keeps on home", () => {
  it("says each record is kept on home once paired, and sends nothing", async () => {
    await mount()
    // Practice's two kinds, aph, the Jobs record and voice notes.
    expect(
      screen.getAllByText(/: Kept on home$|: Nothing on home yet$/)
    ).toHaveLength(5)
    expect(home.sent).toEqual([])
  })

  it("says everything is only on this phone while it isn't paired", async () => {
    home.record = null
    await mount()
    expect(screen.getAllByText(/: Only on this phone$/)).toHaveLength(5)
    expect(screen.queryByRole("button", { name: "Send now" })).toBeNull()
    expect(home.sent).toEqual([])
  })

  it("offers Send now for what waits, which asks for a run", async () => {
    home.voiceWaiting = 2
    await mount()
    expect(screen.getByText(/2 voice notes wait on this phone/)).toBeTruthy()
    expect(home.runs).toBe(0)
    fireEvent.click(screen.getByRole("button", { name: "Send now" }))
    await waitFor(() => expect(home.runs).toBe(1))
  })

  it("names voice notes it can't send, and says nothing waits for them (LA14)", async () => {
    home.unsent = { gone: 1 }
    await mount()
    expect(
      screen.getByText(
        "1 voice note isn't on this phone any more, so it can't go to home."
      )
    ).toBeTruthy()
    expect(screen.queryByText(/wait/)).toBeNull()
    expect(screen.queryByRole("button", { name: "Send now" })).toBeNull()
  })

  it("offers the arrival notice under the Jobs record, where this build can be told", async () => {
    await mount()
    expect(screen.queryByRole("switch")).toBeNull()
    cleanup()
    home.noticeOffered = true
    await mount()
    const toggle = screen.getByRole("switch", {
      name: "Tell me when the morning run is in",
    })
    expect(screen.getByText(/Google carries it/)).toBeTruthy()
    fireEvent.click(toggle)
    expect(home.wanted).toEqual([true])
    expect(home.sent).toEqual([])
  })
})

/** The status page's rows, as `useLaneRows` gives them now. */
async function rows(): Promise<{
  rows: ReadonlyArray<{ id: string; line: string; mark: unknown }>
  paired: boolean
}> {
  const { useLaneRows } = await import(
    "@/components/settings/device-kept-on-home"
  )
  const seen: Array<ReturnType<typeof useLaneRows>> = []
  const Probe = (): null => {
    seen.push(useLaneRows())
    return null
  }
  render(<Probe />)
  await act(() => Promise.resolve())
  const last = seen.at(-1)
  if (last === undefined) throw new Error("no rows")
  return last
}

describe("the status page's rows", () => {
  it("says aph shows how it went once its screen opens, never up to date", async () => {
    const board = await rows()
    expect(board.rows.find((r) => r.id === "aph")).toMatchObject({
      line: "How its last send went shows once aph opens.",
      mark: { kind: "lane", where: "kept", how: null },
    })
    expect(board.paired).toBe(true)
  })
})
