import type { SceneConfig } from "some-types-utils"
import { beforeEach, describe, expect, it } from "vitest"

import type { SessionActivity } from "../activity-catalog"
import {
  createSessionsRepository,
  SessionNotFoundError,
} from "./sessions-repository"
import type { CreateSessionInput } from "./sessions-repository"
import type { StorageAdapter } from "./storage"
import { createInMemoryStorage } from "./storage"

let storage: StorageAdapter

beforeEach(() => {
  storage = createInMemoryStorage()
})

function scene(overrides: Partial<SceneConfig> = {}): SceneConfig {
  return {
    scene_name: "leetype",
    duration: 5 * 60_000,
    start_time: 0,
    ui: [],
    ...overrides,
  }
}

function activity(overrides: Partial<SessionActivity> = {}): SessionActivity {
  return { activityId: "leetype", config: { durationMinutes: 5 }, ...overrides }
}

function input(
  overrides: Partial<CreateSessionInput> = {}
): CreateSessionInput {
  return {
    name: "Morning practice",
    activities: [activity()],
    scenes: [scene()],
    layoutMode: "basic",
    ...overrides,
  }
}

describe("SessionsRepository", () => {
  it("starts empty", async () => {
    const repo = createSessionsRepository(storage, 0)
    expect(await repo.list()).toEqual([])
  })

  it("creates a session as a draft with a computed totalDurationMs and timestamps", async () => {
    const repo = createSessionsRepository(storage, 0)
    const scenes = [
      scene({ start_time: 0, duration: 5 * 60_000 }),
      scene({
        start_time: 5 * 60_000,
        duration: 10 * 60_000,
        scene_name: "honeycomb",
      }),
    ]
    const record = await repo.create(input({ scenes }))

    expect(record.status).toBe("draft")
    expect(record.totalDurationMs).toBe(15 * 60_000)
    expect(record.id).toBeTruthy()
    expect(record.createdAt).toBe(record.updatedAt)

    expect(await repo.list()).toHaveLength(1)
  })

  it("get returns null for an unknown id", async () => {
    const repo = createSessionsRepository(storage, 0)
    expect(await repo.get("does-not-exist")).toBeNull()
  })

  it("get returns the created record by id", async () => {
    const repo = createSessionsRepository(storage, 0)
    const created = await repo.create(input())
    expect(await repo.get(created.id)).toEqual(created)
  })

  it("update patches fields and bumps updatedAt without touching createdAt", async () => {
    const repo = createSessionsRepository(storage, 0)
    const created = await repo.create(input())

    await new Promise((r) => setTimeout(r, 2))
    const updated = await repo.update(created.id, {
      status: "active",
      startedAt: new Date().toISOString(),
    })

    expect(updated.status).toBe("active")
    expect(updated.createdAt).toBe(created.createdAt)
    expect(updated.updatedAt).not.toBe(created.updatedAt)
  })

  it("update throws SessionNotFoundError for an unknown id", async () => {
    const repo = createSessionsRepository(storage, 0)
    await expect(
      repo.update("nope", { status: "active" })
    ).rejects.toBeInstanceOf(SessionNotFoundError)
  })

  it("remove deletes the session", async () => {
    const repo = createSessionsRepository(storage, 0)
    const created = await repo.create(input())
    await repo.remove(created.id)
    expect(await repo.list()).toEqual([])
  })

  it("remove is a no-op for an unknown id", async () => {
    const repo = createSessionsRepository(storage, 0)
    await repo.create(input())
    await expect(repo.remove("does-not-exist")).resolves.toBeUndefined()
    expect(await repo.list()).toHaveLength(1)
  })

  it("duplicate creates a fresh draft copy with a new id and reset status/timestamps", async () => {
    const repo = createSessionsRepository(storage, 0)
    const created = await repo.create(input())
    await repo.update(created.id, {
      status: "completed",
      completedAt: new Date().toISOString(),
    })

    const copy = await repo.duplicate(created.id)

    expect(copy.id).not.toBe(created.id)
    expect(copy.name).toBe(`${created.name} (copy)`)
    expect(copy.status).toBe("draft")
    expect(copy.completedAt).toBeUndefined()
    expect(await repo.list()).toHaveLength(2)
  })

  it("duplicate throws SessionNotFoundError for an unknown id", async () => {
    const repo = createSessionsRepository(storage, 0)
    await expect(repo.duplicate("nope")).rejects.toBeInstanceOf(
      SessionNotFoundError
    )
  })

  it("removeMany deletes exactly the selected sessions, leaving the rest", async () => {
    const repo = createSessionsRepository(storage, 0)
    const a = await repo.create(input({ name: "A" }))
    const b = await repo.create(input({ name: "B" }))
    const c = await repo.create(input({ name: "C" }))

    await repo.removeMany([a.id, c.id])

    const remaining = await repo.list()
    expect(remaining.map((s) => s.id)).toEqual([b.id])
  })

  it("removeMany is a no-op for ids that don't exist, and for an empty list", async () => {
    const repo = createSessionsRepository(storage, 0)
    await repo.create(input())

    await repo.removeMany(["does-not-exist"])
    await repo.removeMany([])

    expect(await repo.list()).toHaveLength(1)
  })

  it("updateStatusMany transitions exactly the selected sessions and bumps their updatedAt", async () => {
    const repo = createSessionsRepository(storage, 0)
    const a = await repo.create(input({ name: "A" }))
    const b = await repo.create(input({ name: "B" }))

    await new Promise((r) => setTimeout(r, 2))
    const updated = await repo.updateStatusMany([a.id], "scheduled")

    expect(updated).toHaveLength(1)
    expect(updated[0]?.status).toBe("scheduled")
    expect(updated[0]?.updatedAt).not.toBe(a.updatedAt)

    const all = await repo.list()
    expect(all.find((s) => s.id === a.id)?.status).toBe("scheduled")
    expect(all.find((s) => s.id === b.id)?.status).toBe("draft")
  })
})
