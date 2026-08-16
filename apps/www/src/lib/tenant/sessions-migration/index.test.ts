import { beforeEach, describe, expect, it } from "vitest"

import {
  createSessionsRepository,
  STORAGE_KEY,
} from "@/lib/tenant/sessions-repository"
import type {
  CreateSessionInput,
  SessionsStore,
  UpdateSessionInput,
} from "@/lib/tenant/sessions-repository"
import type { StorageAdapter } from "@/lib/tenant/storage"
import { createInMemoryStorage, writeJSON } from "@/lib/tenant/storage"
import type { SessionRecord, SessionStatus } from "@/lib/tenant/types"

import { migrateLocalSessions } from "."

let storage: StorageAdapter

beforeEach(() => {
  storage = createInMemoryStorage()
})

function local(
  overrides: Partial<SessionRecord> & { id: string }
): SessionRecord {
  return {
    name: "Korean review",
    status: "scheduled",
    activities: [],
    scenes: [],
    layoutMode: "basic",
    totalDurationMs: 10 * 60_000,
    createdAt: "2026-03-14T09:00:00.000Z",
    updatedAt: "2026-03-14T09:00:00.000Z",
    ...overrides,
  }
}

function seed(sessions: Array<SessionRecord>): void {
  writeJSON(storage, STORAGE_KEY, sessions)
}

/**
 * A stand-in for `file_host`, using the localStorage repository against its
 * own storage — same interface, server-side id minting, and a `create` that
 * ignores anything the real one would.
 */
function remoteStore(): { store: SessionsStore; storage: StorageAdapter } {
  const remoteStorage = createInMemoryStorage()
  return {
    store: createSessionsRepository(remoteStorage, 0),
    storage: remoteStorage,
  }
}

/**
 * Fails the nth `create`, to model the backend going away mid-run.
 *
 * Written out rather than spread over the real store: `SessionsRepository`
 * is a class, so its methods live on the prototype and `{ ...store }` copies
 * none of them.
 */
function flakyRemote(failAfter: number): SessionsStore {
  const { store } = remoteStore()
  let created = 0
  return {
    list: () => store.list(),
    get: (id: string) => store.get(id),
    create: async (input: CreateSessionInput): Promise<SessionRecord> => {
      created += 1
      if (created > failAfter) throw new Error("file_host went away")
      return store.create(input)
    },
    update: (id: string, patch: UpdateSessionInput) => store.update(id, patch),
    remove: (id: string) => store.remove(id),
    removeMany: (ids: ReadonlyArray<string>) => store.removeMany(ids),
    updateStatusMany: (ids: ReadonlyArray<string>, status: SessionStatus) =>
      store.updateStatusMany(ids, status),
    duplicate: (id: string) => store.duplicate(id),
  }
}

describe("migrateLocalSessions", () => {
  it("uploads what is already in the browser, preserving what the policy reads", async () => {
    seed([
      local({
        id: "local-1",
        name: "Hangul drill",
        status: "paused",
        startedAt: "2026-03-15T09:00:00.000Z",
        finalElapsedMs: 8 * 60_000,
      }),
    ])
    const remote = remoteStore()

    expect(await migrateLocalSessions(remote.store, storage)).toEqual({
      kind: "migrated",
      count: 1,
    })

    const [uploaded] = await remote.store.list()
    expect(uploaded.name).toBe("Hangul drill")
    // status and the two stamps are exactly what `decideNudge` reads; a
    // migrated history that lost them looks like someone who never studied.
    expect(uploaded.status).toBe("paused")
    expect(uploaded.startedAt).toBe("2026-03-15T09:00:00.000Z")
    expect(uploaded.finalElapsedMs).toBe(8 * 60_000)
    expect(uploaded.totalDurationMs).toBe(10 * 60_000)
  })

  it("leaves the local store intact rather than deleting it", async () => {
    seed([local({ id: "local-1" })])
    const remote = remoteStore()

    await migrateLocalSessions(remote.store, storage)

    expect(storage.getItem(STORAGE_KEY)).not.toBeNull()
  })

  it("does not duplicate on a repeat run", async () => {
    seed([local({ id: "local-1" }), local({ id: "local-2" })])
    const remote = remoteStore()

    await migrateLocalSessions(remote.store, storage)
    expect(await migrateLocalSessions(remote.store, storage)).toEqual({
      kind: "already-done",
    })

    expect(await remote.store.list()).toHaveLength(2)
  })

  it("resumes rather than restarting after a failure halfway", async () => {
    seed([local({ id: "local-1" }), local({ id: "local-2" })])
    const flaky = flakyRemote(1)

    const first = await migrateLocalSessions(flaky, storage)
    expect(first.kind).toBe("partial")
    expect(await flaky.list()).toHaveLength(1)

    // The second run must pick up the one that did not land — not post the
    // first one a second time, which is the failure the per-session stamp
    // exists to prevent.
    const remote = remoteStore()
    const second = await migrateLocalSessions(remote.store, storage)
    expect(second).toEqual({ kind: "migrated", count: 1 })
  })

  it("marks an empty browser done without asking the server anything", async () => {
    const remote = remoteStore()

    expect(await migrateLocalSessions(remote.store, storage)).toEqual({
      kind: "nothing-to-migrate",
    })
    expect(await migrateLocalSessions(remote.store, storage)).toEqual({
      kind: "already-done",
    })
    expect(await remote.store.list()).toEqual([])
  })
})
