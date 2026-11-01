/**
 * @vitest-environment jsdom
 *
 * Practice's lane hears the records HF5 added to its drain (LA15): a new
 * soundbite, LeetType answer note or grammar-lens entry moves its revision,
 * so its watch asks for a run, and each counts as waiting until this phone
 * knows home holds it.
 */
import type { Soundbite } from "@some-ui/soundbites"
import { act, renderHook } from "@testing-library/react"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import { homeLink, paired } from "@/lib/home-link/index"
import { INITIAL_KEPT } from "@/lib/home-link/kept-model"
import type { Kept } from "@/lib/home-link/kept-runtime"
import { watchKept } from "@/lib/home-link/kept-watch"
import type { LensEntry } from "@/lib/home-link/lens-record"
import { lensDigest, lensKey } from "@/lib/home-link/lens-record"
import { practiceLane } from "@/lib/home-link/practice"
import { readSent, rememberSent } from "@/lib/home-link/sent"
import { leetypeNotes, phoneSpokenTakes } from "@/lib/leetype-takes"
import { keepSoundbites } from "@/lib/soundbite-keeping"

const fakes = vi.hoisted(
  (): {
    bites: Array<Soundbite>
    bitesHeard: Set<() => void>
    lens: Array<unknown>
    lensHeard: Set<() => void>
  } => ({ bites: [], bitesHeard: new Set(), lens: [], lensHeard: new Set() })
)

vi.mock("@/lib/device-backend/native-http", () => ({
  homeRequest: (): Promise<never> =>
    Promise.reject(new Error("this test sends nothing")),
}))
vi.mock("@/lib/home-link/credential", () => ({
  nativeCredential: {
    read: (): Promise<{ record: string | null; lost: boolean }> =>
      Promise.resolve({
        record: JSON.stringify({ base: PAIRING, token: "t" }),
        lost: false,
      }),
    write: (): Promise<void> => Promise.resolve(),
    clear: (): Promise<void> => Promise.resolve(),
  },
}))
vi.mock("@/lib/home-link/going", () => ({}))
vi.mock("@/lib/tenant", () => ({
  useSessions: (): { data: Array<never> } => ({ data: [] }),
}))
vi.mock("@some-ui/topik", () => ({
  lensRecordForExport: (): unknown => ({ entries: fakes.lens, sessions: [] }),
  onLensRecordWritten: (listener: () => void): (() => void) => {
    fakes.lensHeard.add(listener)
    return (): void => {
      fakes.lensHeard.delete(listener)
    }
  },
}))

/** The pairing's id, for a credential stored before ids: its base. */
const PAIRING = "https://home.example/api/v1"

const BITE: Soundbite = {
  id: "b1",
  recordedAt: "2026-11-01T08:30:00.000Z",
  durationMs: 5000,
  mimeType: "audio/webm",
  bytes: 4,
  context: {
    source: "direct",
    lastSessionAt: null,
    openSessions: 0,
    timeZone: "UTC",
  },
}

const ENTRY: LensEntry = {
  session: "2026-11-01T09:00:00.000Z",
  line: "cup",
  shownAt: "2026-11-01T09:01:00.000Z",
  closedAt: "2026-11-01T09:01:05.000Z",
  cue: null,
  shape: "judge-authored",
  answer: "looks right",
  right: true,
  expired: false,
  shown: [],
  chosen: null,
  answerMs: 4000,
  rushed: false,
  racing: false,
  stepDown: null,
  situation: null,
  take: null,
}

/** Tells everyone listening to `heard` that their store changed, and lets reads land. */
async function changed(heard: Set<() => void>): Promise<void> {
  await act(async () => {
    for (const listener of heard) listener()
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

/** The lane's watch over a run that only counts how often it was asked for. */
function watched(): { want: ReturnType<typeof vi.fn>; stop: () => void } {
  const want = vi.fn()
  const kept: Kept = {
    getSnapshot: () => INITIAL_KEPT,
    subscribe: () => (): void => undefined,
    want,
  }
  const stop = watchKept(
    { revision: practiceLane.revision, subscribe: practiceLane.subscribe },
    kept
  )
  return { want, stop }
}

/** Remembers, as home's answers would, that home holds `more`. */
function homeHolds(more: {
  notes?: Record<string, string>
  lens?: Record<string, string>
}): void {
  rememberSent(localStorage, readSent(localStorage, PAIRING), more)
}

beforeAll(async () => {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => "visible",
  })
  // `keepSoundbites` has no undo: the store stays handed in for the file.
  keepSoundbites({
    store: {
      list: () => Promise.resolve([...fakes.bites]),
      audio: () => Promise.resolve(null),
      subscribe: (listener) => {
        fakes.bitesHeard.add(listener)
        return (): void => {
          fakes.bitesHeard.delete(listener)
        }
      },
    },
    heldByHome: (): void => undefined,
  })
  homeLink()
  await vi.waitFor(() => {
    expect(paired()).toBe(true)
  })
})

afterAll(() => {
  localStorage.clear()
})

describe("Practice's lane, for HF5's records", () => {
  it("asks for a run on a new soundbite, answer note or lens entry, and counts each waiting until home holds it", async () => {
    const { want, stop } = watched()
    // Paired, so the lens record is watched once topik loads.
    await vi.waitFor(() => {
      expect(fakes.lensHeard.size).toBe(1)
    })
    expect(fakes.bitesHeard.size).toBe(1)
    want.mockClear()
    const counts = renderHook(() => practiceLane.useCounts())
    expect(counts.result.current.waiting).toBe(0)

    fakes.bites = [BITE]
    await changed(fakes.bitesHeard)
    expect(want).toHaveBeenCalledTimes(1)
    expect(counts.result.current.waiting).toBe(1)

    let noted = false
    act(() => {
      noted = phoneSpokenTakes().note({
        take: null,
        file: "two-sum.md",
        screen: "approach",
        prompt: "Which structure?",
        rubric: ["a map"],
        ticks: [],
        typed: "a hash map",
      })
    })
    expect(noted).toBe(true)
    expect(want).toHaveBeenCalledTimes(2)
    expect(counts.result.current.waiting).toBe(2)

    fakes.lens = [ENTRY]
    await changed(fakes.lensHeard)
    expect(want).toHaveBeenCalledTimes(3)
    expect(counts.result.current.waiting).toBe(3)

    // The same entry seen further is a change home lacks: it asks again.
    fakes.lens = [{ ...ENTRY, right: false }]
    await changed(fakes.lensHeard)
    expect(want).toHaveBeenCalledTimes(4)
    expect(counts.result.current.waiting).toBe(3)

    // A store saying it changed with nothing new asks for nothing.
    await changed(fakes.lensHeard)
    await changed(fakes.bitesHeard)
    expect(want).toHaveBeenCalledTimes(4)

    const noteId = leetypeNotes()[0]?.id ?? ""
    expect(noteId).not.toBe("")
    homeHolds({
      notes: { "soundbite:b1": "sha", [`leetype:${noteId}`]: "sha" },
      lens: { [lensKey(ENTRY)]: lensDigest({ ...ENTRY, right: false }) },
    })
    counts.rerender()
    expect(counts.result.current.waiting).toBe(0)

    counts.unmount()
    stop()
    expect(fakes.bitesHeard.size).toBe(0)
    expect(fakes.lensHeard.size).toBe(0)
  })
})
