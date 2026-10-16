/**
 * The phone's copy of its sessions to its paired home (LA8): only session
 * records, once each, through the link's `send`; a second copy sends
 * nothing new; a `401` is the pairing's, never the app's sign-out; a stop
 * keeps what was copied and says so. After a copy, the finished sessions
 * home holds exactly as the phone does leave the phone, and nothing else
 * does. Home is a second device backend, which answers `/sessions` as
 * `file_host` does.
 */
import { openNodeSqlite } from "@/test-support/node-sqlite-driver"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { openDeviceBackend } from "@/lib/device-backend/backend"
import { SyncStoppedError } from "@/lib/device-backend/home-sync"
import type { DeviceBackend } from "@/lib/device-backend/interceptor"
import { createDeviceFetch } from "@/lib/device-backend/interceptor"
import type { HomeAnswer } from "@/lib/device-backend/native-http"
import type { HomeSend } from "@/lib/home-link/runtime"
import {
  copySessionsHome,
  describeCopy,
  homeTransport,
} from "@/lib/home-link/sessions"
import { createHttpSessionsRepository } from "@/lib/tenant/http-sessions-repository"
import { copySessionsTo } from "@/lib/tenant/sessions-copy"
import type * as TenantStorage from "@/lib/tenant/storage"
import type { StorageAdapter } from "@/lib/tenant/storage"
import { createInMemoryStorage } from "@/lib/tenant/storage"
import type { SessionRecord } from "@/lib/tenant/types"

const BASE = "https://home.example/api/v1"

/**
 * What the copy from Settings reaches through module state: the link (its
 * `send` is the test's), the phone's own sessions, and the receipt.
 */
type Phone = {
  sessions: Array<SessionRecord>
  send: HomeSend | null
  receipt: StorageAdapter | null
}

const phone = vi.hoisted(
  (): Phone => ({ sessions: [], send: null, receipt: null })
)

vi.mock("@/lib/home-link/index", () => ({
  homeLink: (): {
    send: <T>(
      run: (send: HomeSend) => Promise<T>
    ) => Promise<{ kind: "done"; value: T }>
  } => ({
    send: async <T>(
      run: (send: HomeSend) => Promise<T>
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
    removeMany: (ids: ReadonlyArray<string>): Promise<void> => {
      phone.sessions = phone.sessions.filter((s) => !ids.includes(s.id))
      return Promise.resolve()
    },
  },
}))
vi.mock("@/lib/device-backend/storage-view", () => ({
  deviceStorage: { refresh: (): Promise<void> => Promise.resolve() },
}))
vi.mock("@/lib/tenant/storage", async (actual) => {
  const real = await actual<typeof TenantStorage>()
  const current = (): StorageAdapter => {
    if (phone.receipt === null) throw new Error("no receipt")
    return phone.receipt
  }
  const browserLocalStorage: StorageAdapter = {
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
let receipt: StorageAdapter
let sent: Array<string>

beforeEach(async () => {
  home = await openDeviceBackend(openNodeSqlite(), () =>
    Date.parse("2026-10-15T08:00:00Z")
  )
  receipt = createInMemoryStorage()
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
const send: HomeSend = async (method, path, body) => {
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
  through: HomeSend = send
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
    expect(describeCopy(first, "home.example")).toBe(
      "Copied 2 sessions to home.example."
    )

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
    const forgotten: HomeSend = (method, path, body) =>
      method === "POST"
        ? Promise.resolve({ status: 401, body: "{}" })
        : send(method, path, body)
    const result = await copy([onPhone("a", "scheduled")], forgotten)
    expect(result.outcome.kind).toBe("partial")
    expect(describeCopy(result, "home.example")).toContain(
      "home.example no longer knows this phone"
    )
  })

  it("says what was copied before a stop", async () => {
    let posts = 0
    const stopping: HomeSend = (method, path, body): Promise<HomeAnswer> => {
      if (method === "POST" && ++posts === 2) {
        return Promise.reject(new SyncStoppedError())
      }
      return send(method, path, body)
    }
    const local = [onPhone("a", "scheduled"), onPhone("b", "scheduled")]
    const stopped = await copy(local, stopping)
    expect(describeCopy(stopped, "home.example")).toBe(
      "Stopped. Copied 1 session to home.example; 1 not yet. Copy again to carry on."
    )
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

  it("lets go of finished sessions home holds, and keeps unfinished and today's", async () => {
    phone.sessions = [
      onPhone("a", "completed"),
      onPhone("b", "scheduled"),
      today("c"),
    ]
    let refreshed = 0
    const result = await copySessionsHome(
      BASE,
      (): void => {
        refreshed += 1
      },
      NOW
    )

    expect(result).toEqual({
      ok: true,
      line: "Copied 3 sessions to home.example. Cleared 1 from this phone.",
    })
    expect(phone.sessions.map((s) => s.id)).toEqual(["b", "c"])
    expect(refreshed).toBe(1)
    // What left the phone is still on home, as it was.
    const there = await createHttpSessionsRepository(homeTransport(send)).list()
    expect(there.find((s) => s.name === "Session a")).toMatchObject({
      status: "completed",
      completedAt: "2026-10-14T09:10:00.000Z",
    })
  })

  it("keeps a session that changed since it was copied", async () => {
    phone.sessions = [onPhone("a", "completed")]
    await copy(phone.sessions)
    phone.sessions = [
      {
        ...onPhone("a", "completed"),
        name: "Renamed",
        updatedAt: "2026-10-14T12:00:00.000Z",
      },
    ]
    const result = await copySessionsHome(BASE, () => undefined, NOW)
    expect(result.line).toBe(
      "home.example is up to date. 1 kept: edited since copied."
    )
    expect(phone.sessions.map((s) => s.id)).toEqual(["a"])
  })

  it("keeps everything when home can't be read back", async () => {
    phone.sessions = [onPhone("a", "completed")]
    phone.send = (method, path, body): Promise<HomeAnswer> =>
      method === "GET" && path !== "/sessions"
        ? Promise.reject(new SyncStoppedError())
        : send(method, path, body)
    const result = await copySessionsHome(BASE, () => undefined, NOW)
    expect(result.line).toBe("Copied 1 session to home.example.")
    expect(phone.sessions.map((s) => s.id)).toEqual(["a"])
  })
})
