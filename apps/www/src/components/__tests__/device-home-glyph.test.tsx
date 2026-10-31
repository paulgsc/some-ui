/**
 * @vitest-environment jsdom
 *
 * LA15 in the header and the app shell: each wing's mark says where its
 * record is kept and what waits, and sends nothing of its own; the shell's
 * drain (`HomeLanes`) sends nothing unpaired, and once paired sends on the
 * moments the watch names and says how it went; Send now asks for a run.
 */

import { markForm } from "@/test-support/mark-form"
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
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"

import type { HomeRequest as NativeCall } from "@/lib/device-backend/native-http"
import type { AphKeeping } from "@/lib/home-link/aph"
import type { JobsState } from "@/lib/jobs/model"
import { EMPTY } from "@/lib/jobs/model"
import { NO_NOTICE } from "@/lib/jobs/notice"
import type { SessionRecord } from "@/lib/tenant/types"

const home = vi.hoisted(
  (): {
    credential: Record<string, unknown> | null
    sent: Array<NativeCall>
    answer: (call: NativeCall) => Promise<{ status: number; body: string }>
    jobs: { snapshot: { state: JobsState } | null }
  } => ({
    credential: { base: "https://home.example/api/v1", token: "t" },
    sent: [],
    answer: () => unreachable(),
    jobs: { snapshot: null },
  })
)
/**
 * Home giving no answer, as `native-http` says it: the error from this
 * test's module registry, which `vi.resetModules` renews for each test.
 */
async function unreachable(): Promise<never> {
  const { noAnswer } = await import("@/test-support/no-answer")
  throw noAnswer()
}

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
        record:
          home.credential === null ? null : JSON.stringify(home.credential),
        lost: false,
      }),
    write: (): Promise<void> => Promise.resolve(),
    clear: (): Promise<void> => Promise.resolve(),
  },
}))
vi.mock("@/lib/home-link/going", () => ({
  readPhone: (): Promise<unknown> =>
    Promise.resolve({ local: [SESSION], kept: [] }),
  logGoing: (): Promise<Array<never>> => Promise.resolve([]),
  studioGoing: (): Promise<unknown> =>
    Promise.resolve({ sittings: [], reports: [] }),
  reflectionsGoing: (): Array<never> => [],
  letGoHeldReflections: (): void => undefined,
  promptsGoing: (): Array<never> => [],
  letGoHeldPrompts: (): void => undefined,
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
vi.mock("@/lib/home-link/voice", () => ({
  useVoiceHome: (): unknown => null,
}))
vi.mock(
  "@tanstack/react-router",
  async (importOriginal): Promise<typeof ReactRouterModule> => {
    const { withPlainLink } = await import("@/test-support/router-stubs")
    return withPlainLink(await importOriginal<typeof ReactRouterModule>())
  }
)

// Evaluates the mark's module graph cold once, under its own limit; the
// import each test makes after `vi.resetModules()` is then warm.
beforeAll(async () => {
  await import("@/components/device-home-glyph")
}, 30_000)

beforeEach(() => {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => "visible",
  })
})

/** The pairing's id, for a credential stored before ids: its base. */
const PAIRING = "https://home.example/api/v1"

beforeEach(() => {
  // The shell drains every lane, so the Jobs record is always there to read.
  jobsRecord(0)
})

afterEach(() => {
  cleanup()
  vi.resetModules()
  localStorage.clear()
  home.sent = []
  home.answer = (): Promise<never> => unreachable()
  home.jobs.snapshot = null
  home.credential = { base: PAIRING, token: "t" }
})

/** The Practice wing's mark, with or without the shell's drain. */
async function mount(
  wing: "practice" | "jobs" = "practice",
  drain = true
): Promise<void> {
  const { DeviceHomeGlyph, HomeLanes } = await import(
    "@/components/device-home-glyph"
  )
  render(
    <>
      {drain ? <HomeLanes /> : null}
      <DeviceHomeGlyph wing={wing} />
    </>
  )
  await act(() => Promise.resolve())
}

/** The mark, behind its sheet or not. */
const mark = (name = /Where Practice is kept/): HTMLElement =>
  screen.getByRole("button", { name, hidden: true })

/** A Jobs record of `events` events. */
function jobsRecord(events: number): void {
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
      home: {
        held: [],
        refused: [],
        refusedFiles: [],
        lookedAt: null,
        runs: null,
        notice: NO_NOTICE,
      },
    },
  }
}

describe("Practice's sharing mark", () => {
  it("says phone only, and sends nothing, while the phone isn't paired", async () => {
    home.credential = null
    await mount()
    expect(mark().textContent).toContain("Phone only")
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"))
      window.dispatchEvent(new Event("online"))
    })
    await act(() => Promise.resolve())
    expect(home.sent).toEqual([])
    fireEvent.click(mark())
    expect(screen.getAllByText("Only on this phone")).toHaveLength(4)
    expect(
      screen.getAllByText(/Pair this phone with home in Settings/).length
    ).toBeGreaterThan(0)
    expect(screen.queryByRole("button", { name: "Send now" })).toBeNull()
  })

  it("draws each mark in its legend in a form no other shares", async () => {
    const { MARK_WORDS } = await import("@/lib/sharing-marks")
    await mount()
    fireEvent.click(mark())
    const legend = screen.getByRole("region", { name: MARK_WORDS.title })
    const forms = [...legend.querySelectorAll("li svg")].map(markForm)
    expect(forms).toHaveLength(
      Object.keys(MARK_WORDS.where).length + Object.keys(MARK_WORDS.how).length
    )
    expect(new Set(forms).size).toBe(forms.length)
  })

  it("sends nothing of its own: the shell's drain sends, and the mark says how it went", async () => {
    await mount("practice", false)
    await act(() => Promise.resolve())
    expect(home.sent).toEqual([])
    // One finished session, which home does not hold yet.
    expect(mark().textContent).toContain("1 waiting")
    cleanup()
    vi.resetModules()

    await mount()
    await waitFor(() => expect(home.sent.length).toBeGreaterThan(0))
    await waitFor(() => expect(mark().textContent).toContain("No answer"))
    // Sessions go first, as the drain orders them.
    expect(new URL(home.sent[0]?.url ?? "").pathname).toBe("/api/v1/sessions")
  })

  it("asks for a run again from Send now", async () => {
    await mount()
    await waitFor(() => expect(mark().textContent).toContain("No answer"))
    const before = home.sent.length
    fireEvent.click(mark())
    fireEvent.click(screen.getByRole("button", { name: "Send now" }))
    await waitFor(() => expect(home.sent.length).toBeGreaterThan(before))
  })
})

describe("the Jobs record's mark", () => {
  it("drains once paired, from the shell, and says what waits", async () => {
    jobsRecord(2)
    await mount("jobs")
    await waitFor(() =>
      expect(
        home.sent.some((call) => new URL(call.url).pathname.includes("/jobs/"))
      ).toBe(true)
    )
    await waitFor(() =>
      expect(mark(/Where the Jobs record is kept/).textContent).toContain(
        "No answer"
      )
    )
    fireEvent.click(mark(/Where the Jobs record is kept/))
    expect(screen.getByText(/2 events wait on this phone/)).toBeTruthy()
  })
})

/** aph's store, kept on home with two changes waiting, or on this phone with `entries` entries. */
function aphStore(onPhone = false, entries = 0): AphStore & { moved: number } {
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
  const store: AphStore & { moved: number } = {
    moved: 0,
    get: () => state,
    subscribe: (listener) => {
      listeners.add(listener)
      return (): void => {
        listeners.delete(listener)
      }
    },
    where: () => where,
    keepOnHome: (): boolean => {
      store.moved += 1
      where = {
        kind: "home",
        pulled: false,
        unsent: entries,
        refused: [],
        hidden: 0,
        edits: 0,
      }
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
  // aph's own exchange is its package's to test: here, one request.
  const aph: AphKeeping = {
    store,
    exchange: async (_, send) => {
      await send("PUT", "/aph/entries/1", "{}")
      return { kind: "synced" }
    },
  }
  const { DeviceAphLane } = await import("@/components/aph/device-aph-lane")
  const { DeviceHomeGlyph, HomeLanes } = await import(
    "@/components/device-home-glyph"
  )
  render(
    <>
      <HomeLanes />
      <DeviceHomeGlyph wing="self" />
      <DeviceAphLane aph={aph} />
    </>
  )
  await act(() => Promise.resolve())
}

describe("aph's mark", () => {
  it("moves aph to home on a paired phone's first run, and sends", async () => {
    const store = aphStore(true, 2)
    await mountAph(store)
    await waitFor(() =>
      expect(home.sent.map((call) => new URL(call.url).pathname)).toContain(
        "/api/v1/aph/entries/1"
      )
    )
    expect(store.moved).toBe(1)
  })

  it("says what this phone holds when home can't be reached", async () => {
    const store = aphStore()
    await mountAph(store)
    await waitFor(() =>
      expect(mark(/Where aph is kept/).textContent).toContain("No answer")
    )
    expect(mark(/Where aph is kept/).getAttribute("aria-label")).toContain(
      "2 changes wait on this phone and go next time"
    )
    fireEvent.click(mark(/Where aph is kept/))
    expect(
      screen.getByText(
        "Until home answers, this shows only what this phone hasn't sent yet."
      )
    ).toBeTruthy()
  })

  it("says home was busy, not a failure, when home is busy", async () => {
    home.answer = (): Promise<{ status: number; body: string }> =>
      Promise.resolve({ status: 429, body: "" })
    await mountAph(aphStore())
    await waitFor(() =>
      expect(mark(/Where aph is kept/).getAttribute("aria-label")).toContain(
        "Home is busy right now."
      )
    )
  })
})
