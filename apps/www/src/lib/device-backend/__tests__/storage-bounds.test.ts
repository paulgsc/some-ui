/**
 * Everything the phone stores stays within one budget
 * (`device-backend/storage`): a save that would cross it is refused and
 * nothing the person made is deleted to make room. Run against a budget set
 * at what the database holds, so the bound is reached with a few rows.
 */
import { openNodeSqlite } from "@/test-support/node-sqlite-driver"
import { beforeEach, describe, expect, it } from "vitest"

import { openDeviceBackend } from "@/lib/device-backend/backend"
import {
  removeRoundsExcept,
  upsertRound,
} from "@/lib/device-backend/content-store"
import { oldestRemovable } from "@/lib/device-backend/handlers/sessions"
import type { DeviceBackend } from "@/lib/device-backend/interceptor"
import type { SqlDriver } from "@/lib/device-backend/sql"
import { num, one } from "@/lib/device-backend/sql"
import type { StorageBudget } from "@/lib/device-backend/storage"
import {
  databaseBytes,
  dismissPruneNotice,
  onSaveRefused,
  readPruneNotice,
} from "@/lib/device-backend/storage"

const DAY = 24 * 60 * 60 * 1000
const NOW = Date.parse("2026-10-05T12:00:00Z")
/** Big enough that each session spans pages of its own. */
const BULK = "x".repeat(20_000)

let db: SqlDriver
let backend: DeviceBackend
let quota = Number.POSITIVE_INFINITY
const budget: StorageBudget = {
  get quotaBytes() {
    return quota
  },
  reservedBytes: 0,
}

beforeEach(async () => {
  quota = Number.POSITIVE_INFINITY
  db = openNodeSqlite()
  backend = await openDeviceBackend(db, () => NOW, budget)
})

function call(method: string, path: string, body?: unknown): Promise<Response> {
  return backend.router.handle(
    method,
    path,
    new URLSearchParams(),
    body === undefined ? "" : JSON.stringify(body),
    backend.context
  )
}

const bulky = {
  layoutMode: "basic",
  activities: [{ activityId: "topik", config: { note: BULK } }],
}

async function create(name: string): Promise<string> {
  const response = await call("POST", "/sessions", { name, ...bulky })
  expect(response.status).toBe(200)
  const created: unknown = await response.json()
  if (typeof created !== "object" || created === null || !("id" in created)) {
    throw new Error("no id")
  }
  return String(created.id)
}

async function finish(id: string, at: number): Promise<void> {
  const stamp = new Date(at).toISOString()
  await call("PATCH", `/sessions/${id}`, {
    status: "completed",
    startedAt: stamp,
    completedAt: stamp,
  })
}

async function names(): Promise<Array<string>> {
  const rows = await db.all("SELECT name FROM sessions ORDER BY name")
  return rows.map((row) => String(row.name))
}

describe("sessions at the budget", () => {
  it("refuses a save that grows the phone past it, deletes nothing, and says so", async () => {
    const old = await create("old")
    await finish(old, NOW - 30 * DAY)
    quota = await databaseBytes(db)
    const spared: Array<string | null> = []
    const stop = onSaveRefused((spare) => spared.push(spare))

    const created = await call("POST", "/sessions", { name: "new", ...bulky })
    const duplicated = await call("POST", `/sessions/${old}/duplicate`)
    const grown = await call("PATCH", `/sessions/${old}`, {
      activities: [{ activityId: "topik", config: { note: BULK + BULK } }],
    })
    stop()

    for (const response of [created, duplicated, grown]) {
      expect(response.status).toBe(400)
      await expect(response.json()).resolves.toMatchObject({
        error: { code: "max_record_limit_exceeded" },
      })
    }
    // The refused save's own session is never the one offered for removal.
    expect(spared).toEqual([null, old, old])
    await expect(oldestRemovable(db, NOW, old)).resolves.toBeNull()
    expect(await names()).toEqual(["old"])
  })

  it("still saves what grows nothing, on a phone already over", async () => {
    const draft = await create("draft")
    quota = (await databaseBytes(db)) - 1
    const response = await call("PATCH", `/sessions/${draft}`, {
      name: "renamed",
    })
    expect(response.status).toBe(200)
    expect(await names()).toEqual(["renamed"])
  })

  it("offers the oldest finished session, never today's or an unfinished one", async () => {
    await finish(await create("today"), NOW)
    await create("draft")
    await expect(oldestRemovable(db, NOW)).resolves.toBeNull()

    await finish(await create("older"), NOW - 10 * DAY)
    await finish(await create("oldest"), NOW - 20 * DAY)

    await expect(oldestRemovable(db, NOW)).resolves.toMatchObject({
      name: "oldest",
    })
  })

  it("runs FULL auto-vacuum, a database made before it included", async () => {
    const mode = async (): Promise<number> => {
      const row = await one(db, "PRAGMA auto_vacuum")
      return row === null ? -1 : num(row, "auto_vacuum")
    }
    expect(await mode()).toBe(1)
    await db.exec("PRAGMA auto_vacuum = NONE")
    await db.exec("VACUUM")
    expect(await mode()).toBe(0)
    backend = await openDeviceBackend(db, () => NOW, budget)
    expect(await mode()).toBe(1)
  })
})

describe("the shelf at the budget", () => {
  it("refuses a keep as a full phone, and asks to make room", async () => {
    expect((await call("PUT", "/shelf/topik/first", { BULK })).status).toBe(200)
    quota = await databaseBytes(db)
    let refused = 0
    const stop = onSaveRefused(() => (refused += 1))
    const second = await call("PUT", "/shelf/topik/second", { BULK })
    stop()
    expect(second.status).toBe(400)
    expect(refused).toBe(1)
    const kept = await db.all("SELECT key FROM learner_shelf")
    expect(kept.map((row) => row.key)).toEqual(["first"])
  })
})

describe("presence leases", () => {
  it("skips a lease that would grow a full phone, and still answers", async () => {
    quota = await databaseBytes(db)
    for (let index = 0; index < 16; index++) {
      const response = await call("POST", "/presence/lease", {
        context_key: `${"k".repeat(500)}-${index}`,
      })
      expect(response.status).toBe(200)
    }
    expect(await databaseBytes(db)).toBeLessThanOrEqual(quota)
  })

  it("keeps the latest 16 contexts, as the server does", async () => {
    let clock = NOW
    backend = await openDeviceBackend(db, () => clock, budget)
    for (let index = 0; index < 20; index++) {
      clock = NOW + index * 1000
      await call("POST", "/presence/lease", {
        context_key: `session-${String(index).padStart(2, "0")}`,
      })
    }
    const rows = await db.all(
      "SELECT context_key FROM presence_leases ORDER BY context_key"
    )
    expect(rows).toHaveLength(16)
    expect(rows[0]?.context_key).toBe("session-04")
  })
})

describe("the bundled seed", () => {
  it("removes a bundled round this build no longer ships, says so, and keeps home's", async () => {
    await upsertRound(db, JSON.stringify({ id: "dropped" }), NOW, "bundled")
    await upsertRound(db, JSON.stringify({ id: "home-round" }), NOW, "home")

    backend = await openDeviceBackend(db, () => NOW, budget)

    const ids = await db.all(
      "SELECT id FROM leetype_round WHERE id IN ('dropped', 'home-round')"
    )
    expect(ids.map((row) => row.id)).toEqual(["home-round"])
    const notice = await readPruneNotice(db)
    expect(notice).toMatchObject({ rounds: 1 })
    if (notice === null) throw new Error("no notice")
    await dismissPruneNotice(db, notice)
    await expect(readPruneNotice(db)).resolves.toBeNull()
  })

  it("does not bring back a bundled round home retired", async () => {
    const rows = await db.all("SELECT id FROM leetype_round ORDER BY id")
    const ids = rows.map((row) => String(row.id))
    const id = ids[0] ?? ""
    await removeRoundsExcept(db, ids.slice(1), "home")

    backend = await openDeviceBackend(db, () => NOW, budget)

    await expect(
      db.all("SELECT id FROM leetype_round WHERE id = ?", [id])
    ).resolves.toEqual([])
  })
})
