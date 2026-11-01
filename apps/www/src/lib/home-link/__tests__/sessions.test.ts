/**
 * The phone's copy of its sessions to its paired home (LA8, LA15): only
 * session records, once each, through the link; a second copy sends
 * nothing new; a `401` is the pairing's, never the app's sign-out; a stop
 * keeps what was copied and says so. The drain copies finished sessions,
 * and the clear in Settings lets go of those home holds exactly as the
 * phone does, and nothing else; the study list's "Let it go" copies its one
 * session of any status first, and lets it go only once home holds it as it
 * is. Home is a second device backend, which answers `/sessions` as
 * `file_host` does.
 */
import { noAnswer } from "@/test-support/no-answer"
import { openNodeSqlite } from "@/test-support/node-sqlite-driver"
import { inMemoryStorage } from "@some-ui/core-utils"
import type { HomeAnswer, HomeCall, KeyedStorage } from "@some-ui/core-utils"
import { memoryStorage } from "@some-ui/vite-config/vitest/memory-storage"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { openDeviceBackend } from "@/lib/device-backend/backend"
import type * as SessionHandlers from "@/lib/device-backend/handlers/sessions"
import type * as ShelfHandlers from "@/lib/device-backend/handlers/shelf"
import { SyncStoppedError } from "@/lib/device-backend/home-sync"
import type { DeviceBackend } from "@/lib/device-backend/interceptor"
import { createDeviceFetch } from "@/lib/device-backend/interceptor"
import { clearHeld } from "@/lib/home-link/clear"
import { drainHome } from "@/lib/home-link/drain"
import { letGoUnchanged } from "@/lib/home-link/let-go"
import {
  causedBy,
  HomeForgotPhoneError,
  homeTransport,
} from "@/lib/home-link/sessions"
import type { LetGoPorts, Pairing } from "@/lib/home-link/study-let-go"
import { letSessionGo } from "@/lib/home-link/study-let-go"
import { createHttpSessionsRepository } from "@/lib/tenant/http-sessions-repository"
import { copySessionsTo } from "@/lib/tenant/sessions-copy"
import type * as TenantStorage from "@/lib/tenant/storage"
import type { SessionRecord } from "@/lib/tenant/types"

const BASE = "https://home.example/api/v1"
const PAIRING = "pairing-1"

/**
 * What the copy from Settings reaches through module state: the link (its
 * `send` is the test's), the phone's own sessions, and the receipt.
 */
type Phone = {
  sessions: Array<SessionRecord>
  send: HomeCall | null
  receipt: KeyedStorage | null
}

const phone = vi.hoisted(
  (): Phone => ({ sessions: [], send: null, receipt: null })
)

vi.mock("@/lib/home-link/index", () => ({
  homeLink: (): {
    send: <T>(
      run: (send: HomeCall) => Promise<T>
    ) => Promise<{ kind: "done"; value: T }>
  } => ({
    send: async <T>(
      run: (send: HomeCall) => Promise<T>
    ): Promise<{ kind: "done"; value: T }> => {
      if (phone.send === null) throw new Error("no send")
      return { kind: "done", value: await run(phone.send) }
    },
  }),
}))
vi.mock("@/lib/tenant/queries", () => ({
  sessionsRepository: {
    list: (): Promise<Array<SessionRecord>> =>
      Promise.resolve([...phone.sessions]),
  },
}))
vi.mock("@/lib/device-backend/boot", () => ({
  deviceBackend: (): Promise<{ context: { db: object } }> =>
    Promise.resolve({ context: { db: {} } }),
}))
vi.mock("@/lib/device-backend/handlers/shelf", async (actual) => ({
  ...(await actual<typeof ShelfHandlers>()),
  // The phone keeps nothing on its shelf here: this file is about sessions.
  everyKept: (): Promise<Array<never>> => Promise.resolve([]),
}))
vi.mock("@/lib/device-backend/handlers/sessions", async (actual) => ({
  ...(await actual<typeof SessionHandlers>()),
  // The phone's own sessions are this file's list, not a database.
  removeUnchanged: (
    _db: unknown,
    asOf: ReadonlyArray<{ id: string; updatedAt: string }>
  ): Promise<number> => {
    const gone = phone.sessions.filter((s) =>
      asOf.some((a) => a.id === s.id && a.updatedAt === s.updatedAt)
    )
    phone.sessions = phone.sessions.filter((s) => !gone.includes(s))
    return Promise.resolve(gone.length)
  },
}))
vi.mock("@/lib/device-backend/storage-view", () => ({
  deviceStorage: { refresh: (): Promise<void> => Promise.resolve() },
}))
vi.mock("@/lib/tenant/storage", async (actual) => {
  const real = await actual<typeof TenantStorage>()
  const current = (): KeyedStorage => {
    if (phone.receipt === null) throw new Error("no receipt")
    return phone.receipt
  }
  const browserLocalStorage: KeyedStorage = {
    getItem: (key) => current().getItem(key),
    setItem: (key, value) => {
      current().setItem(key, value)
    },
    removeItem: (key) => {
      current().removeItem(key)
    },
  }
  return { ...real, browserLocalStorage }
})

let home: DeviceBackend
let receipt: KeyedStorage
let sent: Array<string>

beforeEach(async () => {
  home = await openDeviceBackend(openNodeSqlite(), () =>
    Date.parse("2026-10-15T08:00:00Z")
  )
  receipt = inMemoryStorage()
  sent = []
  phone.sessions = []
  phone.send = send
  phone.receipt = receipt
})

const homeFetch = (): typeof fetch =>
  createDeviceFetch(
    new URL(BASE),
    () => Promise.resolve(home),
    () => Promise.reject(new TypeError("Failed to fetch"))
  )

/** The link's `send`, as the runtime hands it over, against home. */
const send: HomeCall = async (method, path, given) => {
  const body = typeof given === "string" ? given : undefined
  sent.push(`${method} ${path}`)
  const response = await homeFetch()(`${BASE}${path}`, {
    method,
    ...(body === undefined
      ? {}
      : { body, headers: { "content-type": "application/json" } }),
  })
  return { status: response.status, body: await response.text() }
}

function onPhone(id: string, status: SessionRecord["status"]): SessionRecord {
  return {
    id,
    name: `Session ${id}`,
    status,
    activities: [],
    scenes: [],
    layoutMode: "basic",
    totalDurationMs: 10 * 60_000,
    createdAt: "2026-10-14T09:00:00.000Z",
    updatedAt: "2026-10-14T09:00:00.000Z",
    ...(status === "completed"
      ? {
          startedAt: "2026-10-14T09:00:00.000Z",
          completedAt: "2026-10-14T09:10:00.000Z",
        }
      : {}),
  }
}

const copy = (
  local: ReadonlyArray<SessionRecord>,
  through: HomeCall = send
): ReturnType<typeof copySessionsTo> =>
  copySessionsTo(
    local,
    createHttpSessionsRepository(homeTransport(through)),
    receipt
  )

describe("copying the phone's sessions home", () => {
  it("copies each session once, with its status and times, and a second copy sends nothing new", async () => {
    const local = [onPhone("a", "completed"), onPhone("b", "scheduled")]
    const first = await copy(local)
    expect(first).toEqual({
      outcome: { kind: "copied", copied: 2 },
      alreadyThere: 0,
    })
    const there = await createHttpSessionsRepository(homeTransport(send)).list()
    expect(there).toHaveLength(2)
    expect(there.find((s) => s.name === "Session a")).toMatchObject({
      status: "completed",
      completedAt: "2026-10-14T09:10:00.000Z",
    })

    sent = []
    await copy(local)
    expect(sent.every((call) => call.startsWith("GET "))).toBe(true)
  })

  it("says a 401 is the pairing's, without the app's sign-out", async () => {
    const forgotten: HomeCall = (method, path, body) =>
      method === "POST"
        ? Promise.resolve({ status: 401, body: "{}" })
        : send(method, path, body)
    const result = await copy([onPhone("a", "scheduled")], forgotten)
    expect(result.outcome.kind).toBe("partial")
    const error =
      result.outcome.kind === "partial" ? result.outcome.error : null
    expect(causedBy(error, HomeForgotPhoneError)).toBe(true)
  })

  it("says what was copied before a stop", async () => {
    let posts = 0
    const stopping: HomeCall = (method, path, body): Promise<HomeAnswer> => {
      if (method === "POST" && ++posts === 2) {
        return Promise.reject(new SyncStoppedError())
      }
      return send(method, path, body)
    }
    const local = [onPhone("a", "scheduled"), onPhone("b", "scheduled")]
    const stopped = await copy(local, stopping)
    expect(stopped.outcome).toMatchObject({
      kind: "partial",
      copied: 1,
      remaining: 1,
    })
  })

  it("refuses a method a copy never needs", async () => {
    await expect(
      homeTransport(send)("/sessions/a", { method: "DELETE" })
    ).rejects.toThrow("a sessions copy does not DELETE")
    expect(sent).toEqual([])
  })
})

describe("letting the phone's copies go once home holds them", () => {
  const NOW = new Date("2026-10-15T10:00:00Z")
  const today = (id: string): SessionRecord => ({
    ...onPhone(id, "completed"),
    completedAt: new Date(NOW.getTime() - 60_000).toISOString(),
  })
  let storage: KeyedStorage

  beforeEach(() => {
    storage = memoryStorage()
  })

  /** One run of the drain over the phone's sessions, under the pairing. */
  const drain = (): ReturnType<typeof drainHome> =>
    drainHome(send, {
      read: () => Promise.resolve({ local: [...phone.sessions], kept: [] }),
      logGoing: () => Promise.resolve([]),
      studioGoing: () => Promise.resolve({ sittings: [], reports: [] }),
      reflectionsGoing: () => [],
      letGoHeld: () => undefined,
      promptsGoing: () => [],
      letGoHeldPrompts: () => undefined,
      notesGoing: () => Promise.resolve({ going: [], onPhone: () => true }),
      lensGoing: () => Promise.resolve({ going: [], onPhone: () => true }),
      pairing: PAIRING,
      storage,
    })

  /** Settings' clear, over the phone's sessions and the link's `send`. */
  const clear = (
    refresh: () => void = () => undefined
  ): ReturnType<typeof clearHeld> =>
    clearHeld(refresh, NOW, {
      sessions: () => Promise.resolve([...phone.sessions]),
      run: async (r) => {
        if (phone.send === null) throw new Error("no send")
        return { kind: "done", value: await r(phone.send) }
      },
      letGo: letGoUnchanged,
    })

  it("drains finished sessions, and the clear lets go of those home holds, keeping unfinished and today's", async () => {
    phone.sessions = [
      onPhone("a", "completed"),
      onPhone("b", "scheduled"),
      today("c"),
    ]
    await expect(drain()).resolves.toEqual({ kind: "synced" })
    await expect(clear()).resolves.toEqual({
      kind: "cleared",
      freed: 1,
      kept: 0,
    })
    expect(phone.sessions.map((s) => s.id)).toEqual(["b", "c"])
    // What left the phone is still on home, as it was.
    const there = await createHttpSessionsRepository(homeTransport(send)).list()
    expect(there.find((s) => s.name === "Session a")).toMatchObject({
      status: "completed",
      completedAt: "2026-10-14T09:10:00.000Z",
    })
  })

  it("brings home's copy up to date when a session moved on, then lets it go", async () => {
    phone.sessions = [onPhone("a", "completed")]
    await drain()
    phone.sessions = [
      {
        ...onPhone("a", "completed"),
        name: "Renamed",
        updatedAt: "2026-10-14T12:00:00.000Z",
      },
    ]
    sent = []
    await expect(drain()).resolves.toEqual({ kind: "synced" })
    expect(sent.filter((call) => call.startsWith("POST "))).toEqual([])
    await expect(clear()).resolves.toEqual({
      kind: "cleared",
      freed: 1,
      kept: 0,
    })
    expect(phone.sessions).toEqual([])
    const there = await createHttpSessionsRepository(homeTransport(send)).list()
    expect(there.map((s) => s.name)).toEqual(["Renamed"])
  })

  it("keeps a session home does not hold as it is, or can't be read back", async () => {
    phone.sessions = [onPhone("a", "completed")]
    await drain()
    // Changed on the phone since the copy: home's copy differs.
    phone.sessions = [{ ...onPhone("a", "completed"), name: "Changed" }]
    await expect(clear()).resolves.toEqual({
      kind: "cleared",
      freed: 0,
      kept: 1,
    })
    expect(phone.sessions.map((s) => s.id)).toEqual(["a"])

    phone.send = (method, path, body): Promise<HomeAnswer> =>
      method === "GET" && path !== "/sessions"
        ? Promise.reject(new SyncStoppedError())
        : send(method, path, body)
    await expect(clear()).resolves.toEqual({ kind: "stopped" })
    expect(phone.sessions.map((s) => s.id)).toEqual(["a"])
  })
})

describe("the study list's Let it go", () => {
  let removed: Array<string>
  let refreshed: number
  let reported: Array<string>

  beforeEach(() => {
    removed = []
    refreshed = 0
    reported = []
  })

  /** The flow over the phone's sessions, the link's `send` and `pairing`. */
  const letGo = (
    id: string,
    pairing: Pairing = "paired",
    promised: "home" | "phone-only" = "home",
    over: Partial<LetGoPorts> = {}
  ): ReturnType<typeof letSessionGo> =>
    letSessionGo(
      id,
      promised,
      () => {
        refreshed += 1
      },
      {
        session: (asked) =>
          Promise.resolve(phone.sessions.find((s) => s.id === asked) ?? null),
        pairing: () => Promise.resolve(pairing),
        run: async (r) => {
          if (phone.send === null) throw new Error("no send")
          return { kind: "done", value: await r(phone.send) }
        },
        letGo: letGoUnchanged,
        remove: (asked) => {
          removed.push(asked)
          phone.sessions = phone.sessions.filter((s) => s.id !== asked)
          return Promise.resolve()
        },
        report: (failure) => {
          reported.push(`${failure.port}: ${failure.error.summary}`)
        },
        ...over,
      }
    )

  const onHome = (): Promise<Array<SessionRecord>> =>
    createHttpSessionsRepository(homeTransport(send)).list()

  it("copies an unfinished session home, reads it back, and only then lets it go", async () => {
    phone.sessions = [onPhone("a", "paused"), onPhone("b", "completed")]
    await expect(letGo("a")).resolves.toEqual({ kind: "kept-home" })
    expect(phone.sessions.map((s) => s.id)).toEqual(["b"])
    expect(removed).toEqual([])
    expect(refreshed).toBe(1)
    // Home holds it as the phone did, and only it: nothing else went.
    expect(await onHome()).toEqual([
      expect.objectContaining({ name: "Session a", status: "paused" }),
    ])
    expect(sent.some((call) => call.startsWith("DELETE "))).toBe(false)
  })

  it("keeps it on the phone when home can't be reached, and says so", async () => {
    phone.sessions = [onPhone("a", "draft")]
    phone.send = (): Promise<HomeAnswer> => Promise.reject(noAnswer())
    await expect(letGo("a")).resolves.toEqual({ kind: "unreachable" })
    expect(phone.sessions.map((s) => s.id)).toEqual(["a"])
    expect(refreshed).toBe(0)
    // Home's silence is said on screen, and is not a fault to log.
    expect(reported).toEqual([])
  })

  it("keeps it when home turns it away, forgets the phone, or the link is busy", async () => {
    phone.sessions = [onPhone("a", "draft")]
    phone.send = (method, path, body): Promise<HomeAnswer> =>
      method === "POST"
        ? Promise.resolve({ status: 500, body: "{}" })
        : send(method, path, body)
    await expect(letGo("a")).resolves.toMatchObject({ kind: "refused" })
    expect(reported).toEqual([
      "home-link: Home didn't take a session it was asked to keep.",
    ])
    phone.send = (method, path, body): Promise<HomeAnswer> =>
      method === "POST"
        ? Promise.resolve({ status: 401, body: "{}" })
        : send(method, path, body)
    await expect(letGo("a")).resolves.toEqual({ kind: "forgotten" })
    // The link runs nothing while it is busy: this phone's own, not home's.
    await expect(
      letGo("a", "paired", "home", { run: () => Promise.resolve(null) })
    ).resolves.toEqual({ kind: "phone-busy" })
    // Or once the phone was unpaired while it was asking.
    let reads = 0
    await expect(
      letGo("a", "paired", "home", {
        run: () => Promise.resolve(null),
        pairing: () => Promise.resolve(++reads === 1 ? "paired" : "unpaired"),
      })
    ).resolves.toEqual({ kind: "unpaired" })
    expect(phone.sessions.map((s) => s.id)).toEqual(["a"])
  })

  it("reports a fault on this phone, before home holds it or after", async () => {
    phone.sessions = [onPhone("a", "draft")]
    await expect(
      letGo("a", "paired", "home", {
        session: () => Promise.reject(new Error("locked")),
      })
    ).resolves.toMatchObject({ kind: "not-let-go", held: false })
    await expect(
      letGo("a", "paired", "home", {
        letGo: () => Promise.reject(new Error("locked")),
      })
    ).resolves.toMatchObject({ kind: "not-let-go", held: true })
    expect(reported).toEqual([
      "home-link: This phone couldn't let a session go.",
      "home-link: Home holds a session this phone couldn't let go.",
    ])
    expect(phone.sessions.map((s) => s.id)).toEqual(["a"])
  })

  it("keeps it when home holds a different version, or the phone changed it since", async () => {
    phone.sessions = [onPhone("a", "active")]
    // Home's read-back no longer matches what the phone holds.
    phone.send = async (method, path, body): Promise<HomeAnswer> => {
      const answer = await send(method, path, body)
      if (method !== "GET" || path === "/sessions") return answer
      const there: unknown = JSON.parse(answer.body)
      return answer.status === 200
        ? {
            ...answer,
            body: JSON.stringify({ ...Object(there), name: "Elsewhere" }),
          }
        : answer
    }
    await expect(letGo("a")).resolves.toEqual({ kind: "not-held" })
    expect(phone.sessions.map((s) => s.id)).toEqual(["a"])

    // Saved on the phone after the phone read it for the copy: what home
    // holds is no longer it as it is.
    phone.send = async (method, path, body): Promise<HomeAnswer> => {
      const answer = await send(method, path, body)
      if (method === "GET" && path !== "/sessions") {
        phone.sessions = phone.sessions.map((s) => ({
          ...s,
          updatedAt: "2026-10-15T09:30:00.000Z",
        }))
      }
      return answer
    }
    await expect(letGo("a")).resolves.toEqual({ kind: "changed" })
    expect(phone.sessions.map((s) => s.id)).toEqual(["a"])
    expect(refreshed).toBe(0)
  })

  it("deletes as before on a phone that is not paired, sending nothing", async () => {
    phone.sessions = [onPhone("a", "draft")]
    await expect(letGo("a", "unpaired", "phone-only")).resolves.toEqual({
      kind: "deleted",
    })
    expect(removed).toEqual(["a"])
    expect(phone.sessions).toEqual([])
    expect(refreshed).toBe(1)
    expect(sent).toEqual([])
  })

  it("throws the plain delete's own failure, for the row to show and retry", async () => {
    phone.sessions = [onPhone("a", "draft")]
    await expect(
      letGo("a", "unpaired", "phone-only", {
        remove: () => Promise.reject(new Error("locked")),
      })
    ).rejects.toThrow("locked")
    expect(phone.sessions.map((s) => s.id)).toEqual(["a"])
    expect(refreshed).toBe(0)
  })

  it("never deletes without home once the confirm promised home", async () => {
    phone.sessions = [onPhone("a", "draft")]
    await expect(letGo("a", "unpaired", "home")).resolves.toEqual({
      kind: "unpaired",
    })
    await expect(letGo("a", "unsure", "home")).resolves.toEqual({
      kind: "unpaired",
    })
    // A pairing that could not be read is said as that, and keeps it too.
    await expect(letGo("a", "unreadable", "home")).resolves.toEqual({
      kind: "unreadable",
    })
    expect(removed).toEqual([])
    expect(phone.sessions.map((s) => s.id)).toEqual(["a"])
    expect(sent).toEqual([])
  })
})
