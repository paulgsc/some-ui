/**
 * The phone's copy of its sessions to its paired home (LA8): only session
 * records, once each, through the link's `send`; a second copy sends
 * nothing new; a `401` is the pairing's, never the app's sign-out; a stop
 * keeps what was copied and says so. Home is a second device backend, which
 * answers `/sessions` as `file_host` does.
 */
import { openNodeSqlite } from "@/test-support/node-sqlite-driver"
import { beforeEach, describe, expect, it } from "vitest"

import { openDeviceBackend } from "@/lib/device-backend/backend"
import { SyncStoppedError } from "@/lib/device-backend/home-sync"
import type { DeviceBackend } from "@/lib/device-backend/interceptor"
import { createDeviceFetch } from "@/lib/device-backend/interceptor"
import type { HomeAnswer } from "@/lib/device-backend/native-http"
import type { HomeSend } from "@/lib/home-link/runtime"
import { describeCopy, homeTransport } from "@/lib/home-link/sessions"
import { createHttpSessionsRepository } from "@/lib/tenant/http-sessions-repository"
import { copySessionsTo } from "@/lib/tenant/sessions-transfer"
import type { StorageAdapter } from "@/lib/tenant/storage"
import { createInMemoryStorage } from "@/lib/tenant/storage"
import type { SessionRecord } from "@/lib/tenant/types"

const BASE = "https://home.example/api/v1"

let home: DeviceBackend
let receipt: StorageAdapter
let sent: Array<string>

beforeEach(async () => {
  home = await openDeviceBackend(openNodeSqlite(), () =>
    Date.parse("2026-10-15T08:00:00Z")
  )
  receipt = createInMemoryStorage()
  sent = []
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
