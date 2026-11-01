/**
 * @vitest-environment jsdom
 *
 * The phone-full offer (`DeviceStoragePrompt`'s "Remove it"), the study
 * list's let-go asked in its own words (`lib/home-link/study-let-go`, whose
 * own test holds each end).
 *
 * **PF1: the phone-full offer lets a session go only once home holds it.**
 *
 * - _Claim:_ on a phone not known to be unpaired, "Remove it"
 *   (`components/settings/device-storage.tsx`) lets the offered session leave
 *   the phone only once home holds it as the phone does and it is unchanged
 *   since it was read (`letSessionGo` with the promise "home"); otherwise it
 *   stays, and the offer says why in `LET_GO`'s words.
 * - _Family:_ every pairing at the offer (paired, unpaired, unreadable,
 *   unsure) and at the tap (the promise the offer was shown with is the one
 *   that runs) × every home answer (holds it, unreachable, busy, refuses,
 *   forgets this phone, holds another copy) × the session changing between
 *   the read and the let-go.
 * - _Proof:_ the "PF1" tests here (paired and held: it goes on home's word
 *   alone; paired and unreachable: it stays, said in the offer, which stays
 *   open; shown paired and unpaired by the tap: it stays; shown while the
 *   pairing can't be read: home is promised and it stays; unpaired: today's
 *   delete), and for each end over the same flow,
 *   `lib/home-link/__tests__/sessions.test.ts`'s "the study list's Let it go"
 *   (a promise of home is never kept by a plain delete; an unreachable,
 *   refusing or forgetting home, a busy link, a read-back that differs and a
 *   session changed since keep it).
 * - _Tolerance:_ a phone known to be unpaired has no home to keep a copy:
 *   there "Remove it" deletes, after an offer that says it can't be brought
 *   back.
 */

import { keepingHome } from "@/test-support/keeping-home"
import { noAnswer } from "@/test-support/no-answer"
import { withQueryClient } from "@/test-support/query-client"
import { sessionRecord } from "@/test-support/session-record"
import { signInForTests } from "@/test-support/sign-in"
import type { HomeCall } from "@some-ui/core-utils"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { toast } from "sonner"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { DeviceStorageView } from "@/lib/device-backend/storage-view"
import type { HomeLink, HomeLinkState } from "@/lib/home-link"
import { LET_GO } from "@/lib/home-link/words"

const UNPAIRED: HomeLinkState = {
  link: { kind: "unpaired", note: null },
  activity: { kind: "idle" },
  pairFailure: null,
}

const UNREADABLE: HomeLinkState = {
  link: { kind: "unpaired", note: "unreadable" },
  activity: { kind: "idle" },
  pairFailure: null,
}

const PAIRED: HomeLinkState = {
  link: {
    kind: "paired",
    base: "https://home.example/api/v1",
    id: "pairing-1",
    notForgotten: false,
  },
  activity: { kind: "idle" },
  pairFailure: null,
}

const home = vi.hoisted(
  (): { state: HomeLinkState | null; send: HomeCall | null } => ({
    state: null,
    send: null,
  })
)

vi.mock("@/lib/home-link", async () => {
  const { hostOf } = await import("@/lib/home-link/address")
  const current = (): HomeLinkState => {
    if (home.state === null) throw new Error("no pairing set")
    return home.state
  }
  return {
    hostOf,
    useHomeLink: current,
    homeLink: (): Pick<HomeLink, "load" | "getSnapshot" | "send"> => ({
      load: (): Promise<void> => Promise.resolve(),
      getSnapshot: current,
      send: async <T,>(
        run: (send: HomeCall) => Promise<T>
      ): Promise<{ kind: "done"; value: T }> => {
        if (home.send === null) throw new Error("no send")
        return { kind: "done", value: await run(home.send) }
      },
    }),
  }
})

/** The phone's storage as the prompt reads it, and each settle. */
const storage = vi.hoisted(
  (): {
    view: DeviceStorageView | null
    listeners: Set<() => void>
    settled: number
  } => ({ view: null, listeners: new Set(), settled: 0 })
)

vi.mock("@/lib/device-backend/storage-view", () => ({
  deviceStorage: {
    subscribe: (listener: () => void): (() => void) => {
      storage.listeners.add(listener)
      return () => storage.listeners.delete(listener)
    },
    getSnapshot: (): DeviceStorageView | null => storage.view,
    refresh: (): Promise<void> => Promise.resolve(),
    settle: (): Promise<void> => {
      storage.settled += 1
      if (storage.view !== null) storage.view = { ...storage.view, full: null }
      for (const listener of storage.listeners) listener()
      return Promise.resolve()
    },
    dismiss: (): Promise<void> => Promise.resolve(),
  },
}))

/** What the phone let go on home's word. */
const letGo = vi.hoisted((): { ids: Array<string> } => ({ ids: [] }))
vi.mock("@/lib/home-link/let-go", () => ({
  letGoUnchanged: (held: ReadonlyArray<{ id: string }>): Promise<number> => {
    letGo.ids.push(...held.map(({ id }) => id))
    return Promise.resolve(held.length)
  },
}))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const { DeviceStoragePrompt } = await import(
  "@/components/settings/device-storage"
)

const FINISHED = sessionRecord({
  id: "session-1",
  name: "Evening reading",
  status: "completed",
  startedAt: "2026-09-01T18:00:00.000Z",
  completedAt: "2026-09-01T19:00:00.000Z",
})

let deletes: Array<string>

beforeEach(() => {
  signInForTests()
  deletes = []
  letGo.ids = []
  home.state = UNPAIRED
  home.send = null
  storage.settled = 0
  storage.view = {
    use: { databaseBytes: 0, webViewBytes: 0, quotaBytes: 25 * 1024 * 1024 },
    notice: null,
    full: {
      removable: {
        id: FINISHED.id,
        name: FINISHED.name,
        finishedAt: FINISHED.completedAt ?? "",
      },
    },
  }
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === "DELETE") deletes.push(String(input))
    // A read of the session finds it on the phone.
    const body =
      init?.method === undefined || init.method === "GET"
        ? JSON.stringify(FINISHED)
        : "{}"
    return Promise.resolve(new Response(body, { status: 200 }))
  })
})

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const finished = new Date(FINISHED.completedAt ?? "").toLocaleDateString()

async function pressRemove(): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Remove it" }))
    await new Promise((resolve) => setTimeout(resolve, 20))
  })
}

describe("the phone-full offer", () => {
  it("PF1: on a paired phone, says home keeps it, and removes it once home holds it", async () => {
    home.state = PAIRED
    home.send = keepingHome()
    render(withQueryClient(<DeviceStoragePrompt />))

    expect(
      screen.getByText(
        `Remove “Evening reading” (finished ${finished}) to make room? It leaves this phone, and home.example keeps it. If home.example can't, it stays here.`
      )
    ).toBeTruthy()
    await pressRemove()

    // It left on home's word alone, and the offer closed.
    expect(letGo.ids).toEqual(["session-1"])
    expect(deletes).toEqual([])
    expect(vi.mocked(toast.success)).toHaveBeenCalledWith(
      "Gone from this phone. home.example keeps it."
    )
    expect(storage.settled).toBe(1)
    expect(screen.queryByText("Phone full. Not saved.")).toBeNull()
  })

  it("PF1: on a paired phone, keeps it here when home can't be reached, and says so in the offer", async () => {
    home.state = PAIRED
    const sent: Array<string> = []
    home.send = (method, path): Promise<never> => {
      sent.push(`${method} ${path}`)
      return Promise.reject(noAnswer())
    }
    render(withQueryClient(<DeviceStoragePrompt />))

    await pressRemove()

    // It asked home to keep it, and the phone let nothing go.
    expect(sent).toContain("POST /sessions")
    expect(letGo.ids).toEqual([])
    expect(deletes).toEqual([])
    expect(
      await screen.findByText(
        "Couldn't reach home.example. Are you on the home network? It stays on this phone."
      )
    ).toBeTruthy()
    // The offer stays, to ask again or to decline.
    expect(storage.settled).toBe(0)
    expect(screen.getByRole("button", { name: "Remove it" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Not now" })).toBeTruthy()
  })

  it("PF1: on a phone that is not paired, says it can't be brought back, and deletes it as before", async () => {
    render(withQueryClient(<DeviceStoragePrompt />))

    expect(
      screen.getByText(
        `Remove “Evening reading” (finished ${finished}) to make room? It leaves this phone, and can't be brought back.`
      )
    ).toBeTruthy()
    await pressRemove()

    expect(deletes).toHaveLength(1)
    expect(deletes[0]).toContain("session-1")
    expect(letGo.ids).toEqual([])
    expect(storage.settled).toBe(1)
  })

  it("PF1: shown paired, keeps it here when the phone is unpaired by the tap: what the offer said is what runs", async () => {
    home.state = PAIRED
    home.send = keepingHome()
    render(withQueryClient(<DeviceStoragePrompt />))

    // Unpaired between the offer and the tap, with no render in between.
    home.state = UNPAIRED
    await pressRemove()

    expect(deletes).toEqual([])
    expect(letGo.ids).toEqual([])
    expect(
      await screen.findByText(LET_GO.ended({ kind: "unpaired" }, "home"))
    ).toBeTruthy()
    expect(storage.settled).toBe(0)
  })

  it("PF1: while the pairing can't be read, promises home and keeps it here", async () => {
    home.state = UNREADABLE
    render(withQueryClient(<DeviceStoragePrompt />))

    expect(
      screen.getByText(
        `Remove “Evening reading” (finished ${finished}) to make room? It leaves this phone, and home keeps it. If home can't, it stays here.`
      )
    ).toBeTruthy()
    await pressRemove()

    expect(deletes).toEqual([])
    expect(letGo.ids).toEqual([])
    expect(
      await screen.findByText(LET_GO.ended({ kind: "unreadable" }, "home"))
    ).toBeTruthy()
    expect(storage.settled).toBe(0)
  })

  it("closes the offer when the session is no longer on the phone", async () => {
    home.state = PAIRED
    home.send = keepingHome()
    vi.stubGlobal("fetch", () =>
      Promise.resolve(
        new Response(JSON.stringify({ error: "not_found" }), { status: 404 })
      )
    )
    render(withQueryClient(<DeviceStoragePrompt />))

    await pressRemove()

    expect(letGo.ids).toEqual([])
    expect(storage.settled).toBe(1)
    expect(screen.queryByText("Phone full. Not saved.")).toBeNull()
  })

  it("lets nothing go when the offer is declined", () => {
    home.state = PAIRED
    render(withQueryClient(<DeviceStoragePrompt />))

    fireEvent.click(screen.getByRole("button", { name: "Not now" }))

    expect(storage.settled).toBe(1)
    expect(deletes).toEqual([])
    expect(letGo.ids).toEqual([])
  })
})
