/**
 * @vitest-environment jsdom
 *
 * Settings' readout of what this phone keeps on home (LA15): it reads the
 * phone's own pairing and what each record says, sends nothing on its own,
 * says each record's state in its own words, and never says a voice note waits that this phone can't send (LA14). The
 * status page's rows for the same records (#2165) come from here too. Each
 * row's marks move with its record's runs, a pull's included (PULL3).
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
    /** Whether the voice lane's runs find home. */
    voiceAnswers: boolean
    /** The shell's watch of the voice lane, once a test mounts the shell. */
    watchVoice: (() => unknown) | null
  } => ({
    sent: [],
    record: JSON.stringify({ base: "https://home.example/api/v1", token: "t" }),
    noticeOffered: false,
    wanted: [],
    unsent: { gone: 0 },
    voiceWaiting: 0,
    runs: 0,
    voiceAnswers: true,
    watchVoice: null,
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
  reflectionsGoing: (): Array<never> => [],
  letGoHeldReflections: (): void => undefined,
  promptsGoing: (): Array<never> => [],
  letGoHeldPrompts: (): void => undefined,
  notesGoing: (): Promise<unknown> =>
    Promise.resolve({ going: [], onPhone: () => true }),
  lensGoing: (): Promise<unknown> =>
    Promise.resolve({ going: [], onPhone: () => true }),
  koreanGoing: (): Promise<unknown> =>
    Promise.resolve({ going: [], onPhone: () => true }),
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
vi.mock("@/lib/home-link/voice", () => {
  const voiceLane = {
    id: "voice",
    exchange: (): Promise<unknown> => {
      home.runs += 1
      // Home's silence as this test's module registry (renewed by
      // `vi.resetModules`) knows it.
      return home.voiceAnswers
        ? Promise.resolve({ kind: "synced" })
        : import("@/test-support/no-answer").then(({ noAnswer }) =>
            Promise.reject(noAnswer())
          )
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
  } as const
  return {
    useUnsendable: (): Unsendable => home.unsent,
    voiceLane,
    useVoiceHome: (): unknown => home.watchVoice?.() ?? null,
  }
})

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
  home.voiceAnswers = true
  home.watchVoice = null
})

async function mount(): Promise<void> {
  const { KeptOnHome } = await import(
    "@/components/settings/device-kept-on-home"
  )
  render(<KeptOnHome />)
  await act(() => Promise.resolve())
}

/** The Send now buttons that can be pressed now; every row keeps one. */
const sendable = (): Array<HTMLButtonElement> =>
  screen
    .getAllByRole<HTMLButtonElement>("button", { name: "Send now" })
    .filter((button) => !button.disabled)

describe("what this phone keeps on home", () => {
  it("says each record is kept on home once paired, and sends nothing", async () => {
    await mount()
    // Practice's four kinds, aph, the Jobs record, voice notes, Studio's
    // ideas, notes on episodes, Rust Rounds' four (weeks sent, pastes,
    // rounds, the card log) and how each recording ended.
    expect(
      screen.getAllByText(/: Kept on home$|: Nothing on home yet$/)
    ).toHaveLength(14)
    expect(home.sent).toEqual([])
  })

  it("says everything is only on this phone while it isn't paired", async () => {
    home.record = null
    await mount()
    expect(screen.getAllByText(/: Only on this phone$/)).toHaveLength(14)
    expect(sendable()).toEqual([])
    expect(home.sent).toEqual([])
  })

  it("offers Send now for what waits, which asks for a run", async () => {
    home.voiceWaiting = 2
    await mount()
    expect(
      screen.getByText(
        /2 voice notes, ideas, episode notes and videos wait on this phone/
      )
    ).toBeTruthy()
    expect(home.runs).toBe(0)
    expect(sendable()).toHaveLength(1)
    const [send] = sendable()
    fireEvent.click(send)
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
    expect(sendable()).toEqual([])
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

describe("a pull on Settings (PULL3)", () => {
  /** How voice notes' last exchange went, as their row's mark draws it. */
  const voiceHow = (): string | null =>
    screen
      .getByText("Voice notes")
      .closest("li")
      ?.querySelector("[data-how]")
      ?.getAttribute("data-how") ?? null

  it("moves a record's marks once home answers it again", async () => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    })
    home.voiceAnswers = false
    // The shell watches the voice lane as `useVoiceHome` does.
    const { useLaneHome } = await import("@/lib/home-link/lanes")
    const { voiceLane } = await import("@/lib/home-link/voice")
    home.watchVoice = function useShellVoice(): unknown {
      return useLaneHome(voiceLane)
    }
    const { HomeLanes } = await import("@/components/device-home-glyph")
    const { KeptOnHome } = await import(
      "@/components/settings/device-kept-on-home"
    )
    render(
      <>
        <HomeLanes />
        <KeptOnHome />
      </>
    )
    await waitFor(() => expect(voiceHow()).toBe("no-answer"))
    const runs = home.runs

    home.voiceAnswers = true
    const { screenRefreshers } = await import("@/lib/pull-refresh/refreshers")
    await act(() => screenRefreshers.checkAll())
    expect(home.runs).toBe(runs + 1)
    expect(voiceHow()).toBe("current")
  })
})
