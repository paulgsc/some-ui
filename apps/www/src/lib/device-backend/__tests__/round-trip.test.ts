/**
 * The app's own clients, unchanged, against the device backend: the same
 * `HttpSessionsRepository` and shelf client the LAN build uses, over a
 * transport whose `fetch` is the device's. What passes here is what the
 * phone does when a person creates a session or keeps a lesson.
 */
import { openNodeSqlite } from "@/test-support/node-sqlite-driver"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { openDeviceBackend } from "@/lib/device-backend/backend"
import { deviceFileHostBase } from "@/lib/device-backend/boot"
import { BUNDLED_ROUND_COUNT } from "@/lib/device-backend/bundled-corpus"
import {
  removeLessonsExcept,
  upsertLesson,
} from "@/lib/device-backend/content-store"
import type { DeviceBackend } from "@/lib/device-backend/interceptor"
import { createDeviceFetch } from "@/lib/device-backend/interceptor"
import type { SqlDriver } from "@/lib/device-backend/sql"
import type { FileHostTransport } from "@/lib/file-host-config/client"
import { createFileHostTransport } from "@/lib/file-host-config/client"
import { createShelfClient, ShelfRefusedError } from "@/lib/shelf-client"
import { createHttpSessionsRepository } from "@/lib/tenant/http-sessions-repository"
import type { CreateSessionInput } from "@/lib/tenant/sessions-repository"
import { SessionNotFoundError } from "@/lib/tenant/sessions-repository"

const BASE = "https://device.test/api/file-host/api/v1"

let db: SqlDriver
let backend: DeviceBackend
let clock = Date.parse("2026-09-29T08:00:00Z")

function deviceFetch(): typeof fetch {
  return createDeviceFetch(
    new URL(BASE),
    () => Promise.resolve(backend),
    () => Promise.reject(new Error("no network in this test"))
  )
}

/**
 * The app's real `createFileHostTransport`, with the device's fetch
 * installed as the global it calls - exactly the arrangement on the phone.
 */
function transport(): FileHostTransport {
  vi.stubGlobal("fetch", deviceFetch())
  const real = createFileHostTransport("ceremony", {
    baseUrl: BASE,
    source: "override",
  })
  if (real === null) throw new Error("expected a transport")
  return real
}

beforeEach(async () => {
  db = openNodeSqlite()
  backend = await openDeviceBackend(db, () => clock)
})
afterEach(() => {
  vi.unstubAllGlobals()
})

/** A scene as the orchestrator stores it: its timing is snake_case. */
const scene = (
  start: number,
  duration: number
): CreateSessionInput["scenes"][number] => ({
  scene_name: `scene-${start}`,
  start_time: start,
  duration,
  ui: [],
})

describe("sessions on the device", () => {
  it("round-trips create, update, status, duplicate and delete", async () => {
    const sessions = createHttpSessionsRepository(transport())
    const created = await sessions.create({
      name: "Commute",
      activities: [],
      scenes: [scene(0, 600_000), scene(600_000, 300_000)],
      layoutMode: "basic",
    })
    expect(created).toMatchObject({
      name: "Commute",
      status: "draft",
      totalDurationMs: 900_000,
      layoutMode: "basic",
    })
    expect(created.id).toMatch(/^session-[0-9a-f-]{36}$/)

    clock += 1000
    const started = await sessions.update(created.id, {
      status: "active",
      startedAt: "2026-09-29T08:00:01Z",
    })
    expect(started.status).toBe("active")
    expect(started.startedAt).toBe("2026-09-29T08:00:01Z")
    expect(started.updatedAt).not.toBe(created.updatedAt)

    const copy = await sessions.duplicate(created.id)
    expect(copy).toMatchObject({ name: "Commute (copy)", status: "draft" })
    expect(copy.startedAt).toBeUndefined()

    const paused = await sessions.updateStatusMany(
      [created.id, copy.id],
      "paused"
    )
    expect(paused.map((session) => session.status)).toEqual([
      "paused",
      "paused",
    ])

    const listed = await sessions.list()
    expect(listed.map((session) => session.id).sort()).toEqual(
      [created.id, copy.id].sort()
    )

    await sessions.remove(copy.id)
    await expect(sessions.get(copy.id)).resolves.toBeNull()
    await sessions.removeMany([created.id])
    await expect(sessions.list()).resolves.toEqual([])
  })

  it("reports a missing session the way the LAN build does", async () => {
    const sessions = createHttpSessionsRepository(transport())
    await expect(
      sessions.update("session-nope", { name: "x" })
    ).rejects.toBeInstanceOf(SessionNotFoundError)
  })

  it("keeps the sessions across a reopen of the same database", async () => {
    const sessions = createHttpSessionsRepository(transport())
    const created = await sessions.create({
      name: "Lunch break",
      activities: [],
      scenes: [],
      layoutMode: "advanced",
    })
    backend = await openDeviceBackend(db, () => clock)
    const again = createHttpSessionsRepository(transport())
    await expect(again.get(created.id)).resolves.toMatchObject({
      name: "Lunch break",
      layoutMode: "advanced",
    })
  })
})

describe("the shelf on the device", () => {
  it("keeps, reports unchanged, replaces, lists, reads and removes", async () => {
    const shelf = createShelfClient("topik", transport())
    if (shelf === undefined) throw new Error("expected a shelf client")

    const kept = await shelf.keep("my-lesson", '{"v":1}')
    expect(kept.change).toBe("kept")
    const again = await shelf.keep("my-lesson", '{"v":1}')
    expect(again).toEqual({ change: "unchanged", item: kept.item })
    clock += 1000
    const replaced = await shelf.keep("my-lesson", '{"v":2}')
    expect(replaced.change).toBe("replaced")

    const listing = await shelf.list()
    expect(listing.cap).toBe(20)
    expect(listing.items.map((item) => item.key)).toEqual(["my-lesson"])
    await expect(shelf.read("my-lesson")).resolves.toEqual({ v: 2 })

    await shelf.remove("my-lesson")
    await expect(shelf.list()).resolves.toMatchObject({ items: [] })
  })

  it("refuses a 21st item as full, and a non-JSON body as invalid", async () => {
    const shelf = createShelfClient("leetype", transport())
    if (shelf === undefined) throw new Error("expected a shelf client")
    for (let index = 0; index < 20; index++) {
      await shelf.keep(`round-${index}`, "{}")
    }
    await expect(shelf.keep("round-20", "{}")).rejects.toMatchObject({
      reason: "full",
    })
    // A replace is never refused by the cap.
    await expect(shelf.keep("round-0", '{"x":1}')).resolves.toMatchObject({
      change: "replaced",
    })
    const invalid = shelf.keep("round-0", "not json")
    await expect(invalid).rejects.toBeInstanceOf(ShelfRefusedError)
    await expect(invalid).rejects.toMatchObject({ reason: "invalid" })
  })
})

describe("content on the device", () => {
  it("seeds the bundled Leetype corpus, runs included", async () => {
    const fetchIn = deviceFetch()
    const manifest: unknown = await (
      await fetchIn(`${BASE}/leetype/rounds`)
    ).json()
    expect(manifest).toMatchObject({
      rounds: expect.arrayContaining([
        expect.objectContaining({ id: "has-duplicate-sort-adjacent" }),
      ]),
    })
    expect(BUNDLED_ROUND_COUNT).toBeGreaterThan(0)

    const runs: unknown = await (
      await fetchIn(`${BASE}/leetype/rounds/has-duplicate-sort-adjacent/runs`)
    ).json()
    expect(runs).toMatchObject({
      roundId: "has-duplicate-sort-adjacent",
      runs: expect.arrayContaining([expect.objectContaining({ variant: "A" })]),
    })
  })

  it("serves a synced TOPIK lesson verbatim, and nothing once it is removed", async () => {
    const body = '{ "batches": [] }'
    await upsertLesson(
      db,
      {
        key: "k1-greetings",
        displayName: "Greetings",
        description: "Hello",
        batchCount: 1,
        totalQuestions: 3,
        totalMessages: 4,
        difficulty: "beginner",
      },
      body,
      clock
    )
    const fetchIn = deviceFetch()
    const manifest: unknown = await (
      await fetchIn(`${BASE}/curriculum/manifest.json`)
    ).json()
    expect(manifest).toMatchObject({
      topiks: [{ key: "k1-greetings", difficulty: "beginner" }],
    })
    await expect(
      (await fetchIn(`${BASE}/curriculum/k1-greetings.json`)).text()
    ).resolves.toBe(body)

    await removeLessonsExcept(db, [])
    await expect(
      (await fetchIn(`${BASE}/curriculum/manifest.json`)).json()
    ).resolves.toMatchObject({ topiks: [] })
    // Gone, where the server would still answer for a retired key: nothing
    // on the phone saves a lesson's key (README, "differs on purpose").
    expect((await fetchIn(`${BASE}/curriculum/k1-greetings`)).status).toBe(404)
  })

  it("passes anything outside the file_host base to the network", async () => {
    const seen: Array<string> = []
    const fetchIn = createDeviceFetch(
      new URL(BASE),
      () => Promise.resolve(backend),
      (input) => {
        seen.push(String(input))
        return Promise.resolve(new Response("ok"))
      }
    )
    await fetchIn("https://device.test/hangul/words/vocab.json")
    await fetchIn("https://elsewhere.test/api/file-host/api/v1/sessions")
    expect(seen).toEqual([
      "https://device.test/hangul/words/vocab.json",
      "https://elsewhere.test/api/file-host/api/v1/sessions",
    ])
  })

  it.each([
    ["an http page, the Android dev loop's origin", "http://localhost:5173/"],
    ["an https page, the release app's origin", "https://localhost/"],
  ])("answers the base %s resolves", async (_page, location) => {
    // Through the real seam: the base boot installs the wrapper for, from
    // `resolveFileHostBase` on that page. Nothing here is the https proxy
    // path by assumption, so a change to either that moves the base away from
    // what callers ask for fails here, instead of going to the network.
    vi.stubGlobal("window", { location: new URL(location) })
    const base = deviceFileHostBase()
    if (base === undefined) throw new Error("expected a base")
    const fetchIn = createDeviceFetch(
      base,
      () => Promise.resolve(backend),
      () => Promise.reject(new Error("went to the network"))
    )
    expect((await fetchIn(`${base.href}/auth/session`)).status).toBe(200)
  })
})
