/**
 * @vitest-environment jsdom
 *
 * LA9 to LA11 in the header: each wing's mark says where its record is kept,
 * and nothing reaches home until its person chose to keep sending; once they
 * did, the mark's watch sends, and says how it went; "Stop sending" adds a
 * stop to the log and nothing more goes.
 */

import { sessionRecord } from "@/test-support/session-record"
import type { AphStore, AphWhere } from "@some-ui/aph"
import type * as ReactRouterModule from "@tanstack/react-router"
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { HomeCall as NativeCall } from "@/lib/device-backend/native-http"
import type { AphKeeping } from "@/lib/home-link/aph"
import { CONSENT_KEY } from "@/lib/home-link/consent-runtime"
import type { JobsState } from "@/lib/jobs/model"
import { EMPTY } from "@/lib/jobs/model"
import type { SessionRecord } from "@/lib/tenant/types"

const home = vi.hoisted(
  (): {
    credential: Record<string, unknown>
    sent: Array<NativeCall>
    answer: (call: NativeCall) => Promise<{ status: number; body: string }>
    jobs: { snapshot: { state: JobsState } | null }
  } => ({
    credential: { base: "https://home.example/api/v1", token: "t" },
    sent: [],
    answer: () => Promise.reject(new Error("no route to host")),
    jobs: { snapshot: null },
  })
)
const SESSION = sessionRecord({
  status: "completed",
  id: "s1",
  updatedAt: "2026-10-18T10:00:00.000Z",
})

vi.mock("@/lib/device-backend/native-http", () => ({
  homeRequest: (
    call: NativeCall
  ): Promise<{ status: number; body: string }> => {
    home.sent.push(call)
    return home.answer(call)
  },
}))
vi.mock("@/lib/home-link/credential", () => ({
  nativeCredential: {
    read: (): Promise<{ record: string | null; lost: boolean }> =>
      Promise.resolve({
        record: JSON.stringify(home.credential),
        lost: false,
      }),
    write: (): Promise<void> => Promise.resolve(),
    clear: (): Promise<void> => Promise.resolve(),
  },
}))
vi.mock("@/lib/home-link/send", () => ({
  readPhone: (): Promise<unknown> =>
    Promise.resolve({ local: [SESSION], kept: [] }),
}))
vi.mock("@/lib/jobs", () => ({
  phoneJobs: (): unknown => ({
    getSnapshot: () => home.jobs.snapshot,
    subscribe: () => () => undefined,
    keeping: {
      state: () => home.jobs.snapshot?.state,
      answered: (): void => undefined,
      restored: (): boolean => false,
    },
  }),
}))
vi.mock("@/lib/tenant", () => ({
  useSessions: (): { data: Array<SessionRecord> } => ({ data: [SESSION] }),
}))
vi.mock(
  "@tanstack/react-router",
  async (importOriginal): Promise<typeof ReactRouterModule> => {
    const { withPlainLink } = await import("@/test-support/router-stubs")
    return withPlainLink(await importOriginal<typeof ReactRouterModule>())
  }
)

beforeEach(() => {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => "visible",
  })
})

afterEach(() => {
  cleanup()
  vi.resetModules()
  localStorage.clear()
  home.sent = []
  home.answer = (): Promise<never> =>
    Promise.reject(new Error("no route to host"))
  home.jobs.snapshot = null
  home.credential = { base: PAIRING, token: "t" }
})

/** The pairing's id, for a credential stored before ids: its base. */
const PAIRING = "https://home.example/api/v1"

async function mount(): Promise<void> {
  const { DeviceHomeGlyph } = await import("@/components/device-home-glyph")
  render(<DeviceHomeGlyph wing="practice" />)
  await act(() => Promise.resolve())
}

/** The mark, behind its sheet or not. */
const mark = (name = /Where Practice is kept/): HTMLElement =>
  screen.getByRole("button", { name, hidden: true })

function keptBefore(scopes = ["sessions", "shelf"]): void {
  localStorage.setItem(
    CONSENT_KEY,
    JSON.stringify([
      { seq: 1, at: 1, pairing: PAIRING, kind: "kept", scopes, said: "yes" },
    ])
  )
}

const logged = (): unknown =>
  JSON.parse(localStorage.getItem(CONSENT_KEY) ?? "[]")

/** A Jobs record of `events` events, kept on home by its old switch or not. */
function jobsRecord(events: number, kept: boolean): void {
  home.jobs.snapshot = {
    state: {
      ...EMPTY,
      log: Array.from({ length: events }, (_, i) => ({
        id: `e${i}`,
        at: "2026-10-18T10:00:00.000Z",
        type: "taken" as const,
        day: "2026-10-18",
        pickId: `p${i}`,
        fingerprint: `f${i}`,
      })),
      home: { kept, held: [], refused: [] },
    },
  }
}

async function mountJobs(): Promise<void> {
  const { DeviceHomeGlyph } = await import("@/components/device-home-glyph")
  render(<DeviceHomeGlyph wing="jobs" />)
  await act(() => Promise.resolve())
}

describe("Practice's sharing mark", () => {
  it("says phone only, and sends nothing, until its person keeps sending", async () => {
    await mount()
    expect(mark().textContent).toContain("Phone only")
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"))
      window.dispatchEvent(new Event("online"))
    })
    await act(() => Promise.resolve())
    expect(home.sent).toEqual([])
    fireEvent.click(mark())
    expect(screen.getAllByText("Only on this phone")).toHaveLength(2)
    expect(screen.queryByText("Stop sending...")).toBeNull()
  })

  it("sends once kept, and says when home didn't answer", async () => {
    keptBefore()
    await mount()
    await waitFor(() => expect(home.sent.length).toBeGreaterThan(0))
    await waitFor(() => expect(mark().textContent).toContain("No answer"))
  })

  it("stops sending on the second press, and adds the stop to the log", async () => {
    keptBefore()
    await mount()
    fireEvent.click(mark())
    fireEvent.click(screen.getByRole("button", { name: "Stop sending..." }))
    expect(
      screen.getByText("Stop sending new sessions and kept items to home?")
    ).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Stop sending" }))
    const log: unknown = JSON.parse(localStorage.getItem(CONSENT_KEY) ?? "[]")
    expect(log).toMatchObject([{ kind: "kept" }, { kind: "stopped" }])
    expect(screen.queryByRole("button", { name: "Stop sending..." })).toBeNull()
  })
})

describe("the Jobs record's mark", () => {
  it("enters a choice its old switch made once, as found, and sends", async () => {
    jobsRecord(2, true)
    await mountJobs()
    await waitFor(() => expect(home.sent.length).toBeGreaterThan(0))
    expect(logged()).toMatchObject([
      { kind: "kept", scopes: ["jobs"], said: null, pairing: PAIRING },
    ])
  })

  it("enters no such choice under a pairing this build made", async () => {
    home.credential = { ...home.credential, id: "new", choicesLogged: true }
    jobsRecord(2, true)
    await mountJobs()
    await act(() => Promise.resolve())
    expect(logged()).toEqual([])
    expect(home.sent).toEqual([])
  })

  it("keeps sending only on the second press, with the words it showed", async () => {
    jobsRecord(2, false)
    await mountJobs()
    fireEvent.click(mark(/Where the Jobs record is kept/))
    fireEvent.click(
      screen.getByRole("button", { name: "Keep sending to home..." })
    )
    const offer = screen.getByText(/^Send 2 events to home/).textContent
    await act(() => Promise.resolve())
    expect(home.sent).toEqual([])
    expect(logged()).toEqual([])
    fireEvent.click(screen.getByRole("button", { name: "Keep sending" }))
    expect(logged()).toMatchObject([
      { kind: "kept", scopes: ["jobs"], said: offer },
    ])
    await waitFor(() => expect(home.sent.length).toBeGreaterThan(0))
  })

  it("stops on the second press, and keeps its whole record", async () => {
    keptBefore(["jobs"])
    jobsRecord(2, false)
    await mountJobs()
    fireEvent.click(mark(/Where the Jobs record is kept/))
    fireEvent.click(screen.getByRole("button", { name: "Stop sending..." }))
    expect(
      screen.getByText("Stop sending the Jobs record to home?")
    ).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Stop sending" }))
    expect(logged()).toMatchObject([{ kind: "kept" }, { kind: "stopped" }])
    expect(
      screen.getByRole("button", { name: "Keep sending to home..." })
    ).toBeTruthy()
  })
})

/**
 * aph's store, kept on home with two changes waiting, until it leaves; or,
 * `onPhone`, on this phone with `entries` entries.
 */
function aphStore(onPhone = false, entries = 0): AphStore & { left: number } {
  let where: AphWhere = onPhone
    ? { kind: "device" }
    : {
        kind: "home",
        pulled: false,
        unsent: 2,
        refused: [],
        hidden: 0,
        edits: 0,
      }
  const listeners = new Set<() => void>()
  const state = {
    settings: {
      checkpoints: [],
      labels: [],
      step: 100,
      usualLow: 0,
      usualHigh: 0,
      tolerance: 0,
      since: "2026-10-01",
    },
    entries: Array.from({ length: entries }, (_, i) => ({
      id: String(i),
      day: "2026-10-16",
      checkpoint: null,
      time: null,
      mine: { value: 4300, approx: true },
      theirs: null,
      goal: null,
      labels: [],
      note: null,
      review: null,
    })),
  }
  const store: AphStore & { left: number } = {
    left: 0,
    get: () => state,
    subscribe: (listener) => {
      listeners.add(listener)
      return (): void => {
        listeners.delete(listener)
      }
    },
    where: () => where,
    keepOnHome: () => true,
    leaveHome: (): boolean => {
      store.left += 1
      where = { kind: "device" }
      for (const listener of listeners) listener()
      return true
    },
    outbox: () => null,
    sent: () => undefined,
    pulled: () => false,
    save: () => null,
    review: () => false,
    editEntry: () => false,
    editSettings: () => false,
  }
  return store
}

async function mountAph(store: AphStore): Promise<void> {
  // aph's own exchanges are its package's to test: here, one request each.
  const aph: AphKeeping = {
    store,
    exchange: async (_, send) => {
      await send("PUT", "/aph/entries/1", "{}")
      return { kind: "synced" }
    },
    bringBack: async (kept, send, stopped) => {
      const answer = await send("GET", "/aph")
      if (answer.status !== 200) return { kind: "failed", why: "unanswered" }
      if (stopped()) kept.leaveHome({ settings: null, entries: [] })
      return { kind: "synced" }
    },
  }
  const { DeviceAphLane } = await import("@/components/aph/device-aph-lane")
  const { DeviceHomeGlyph } = await import("@/components/device-home-glyph")
  render(
    <>
      <DeviceHomeGlyph wing="self" />
      <DeviceAphLane aph={aph} />
    </>
  )
  await act(() => Promise.resolve())
}

async function stopAph(): Promise<void> {
  fireEvent.click(mark(/Where aph is kept/))
  fireEvent.click(screen.getByRole("button", { name: "Stop sending..." }))
  fireEvent.click(screen.getByRole("button", { name: "Stop sending" }))
  await act(() => Promise.resolve())
}

describe("aph's mark", () => {
  it("offers every entry and the settings, from the phone, before the second press", async () => {
    await mountAph(aphStore(true, 2))
    fireEvent.click(mark(/Where aph is kept/))
    fireEvent.click(
      screen.getByRole("button", { name: "Keep sending to home..." })
    )
    expect(
      screen.getByText(/^Send 3 changes from this phone to home/)
    ).toBeTruthy()
    expect(logged()).toEqual([])
  })

  it("brings aph back from home once its person stops", async () => {
    keptBefore(["aph"])
    const store = aphStore()
    await mountAph(store)
    await waitFor(() => expect(home.sent.length).toBeGreaterThan(0))
    home.sent = []
    home.answer = (): Promise<{ status: number; body: string }> =>
      Promise.resolve({
        status: 200,
        body: JSON.stringify({ settings: null, entries: [] }),
      })
    await waitFor(() =>
      expect(mark(/Where aph is kept/).textContent).not.toContain("Sending")
    )
    await stopAph()
    await waitFor(() => expect(store.left).toBe(1))
    expect(logged()).toMatchObject([{ kind: "kept" }, { kind: "stopped" }])
    expect(home.sent.map((call) => call.method)).toEqual(["GET"])
    expect(mark(/Where aph is kept/).textContent).toContain("Partly on home")
  })

  it("stops at once when home can't be reached, and says what this phone holds", async () => {
    keptBefore(["aph"])
    const store = aphStore()
    await mountAph(store)
    await waitFor(() =>
      expect(mark(/Where aph is kept/).textContent).toContain("No answer")
    )
    await stopAph()
    await waitFor(() =>
      expect(mark(/Where aph is kept/).getAttribute("aria-label")).toContain(
        "this phone holds only the 2 changes home hadn't confirmed"
      )
    )
    expect(store.left).toBe(0)
    expect(logged()).toMatchObject([{ kind: "kept" }, { kind: "stopped" }])
    fireEvent.click(mark(/Where aph is kept/))
    expect(
      screen.getByRole("button", { name: "Bring it back to this phone" })
    ).toBeTruthy()
  })

  it("says home was busy, not a failure, when bringing aph back finds it busy", async () => {
    keptBefore(["aph"])
    const store = aphStore()
    await mountAph(store)
    await waitFor(() =>
      expect(mark(/Where aph is kept/).textContent).toContain("No answer")
    )
    home.answer = (): Promise<{ status: number; body: string }> =>
      Promise.resolve({ status: 429, body: "" })
    await stopAph()
    await waitFor(() =>
      expect(mark(/Where aph is kept/).getAttribute("aria-label")).toContain(
        "Home is busy right now."
      )
    )
    expect(store.left).toBe(0)
  })

  it("says so when the phone couldn't keep the stop, which sends on", async () => {
    keptBefore(["aph"])
    await mountAph(aphStore())
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("full")
      })
    await stopAph()
    setItem.mockRestore()
    expect(logged()).toMatchObject([{ kind: "kept" }])
    expect(
      screen.getByText(
        "This phone couldn't keep that choice, so sending goes on."
      )
    ).toBeTruthy()
  })
})
