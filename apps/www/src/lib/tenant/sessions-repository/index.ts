import type { SceneConfig } from "@some-ui/types"

import type { StorageAdapter } from "@/lib/tenant/storage"
import {
  browserLocalStorage,
  delay,
  generateId,
  MOCK_LATENCY_MS,
  readJSON,
  writeJSON,
} from "@/lib/tenant/storage"
import type {
  SessionRecord,
  SessionStatus,
  StoredSessionActivity,
} from "@/lib/tenant/types"

/** Also read by `sessions-transfer`, which copies what is under it when the person asks. */
export const STORAGE_KEY = "some-ui.tenant.sessions.v1"

export type CreateSessionInput = {
  name: string
  // The stored shape, not the catalogue's: copying this device's sessions to
  // an account passes their activities through verbatim, retired ids and all.
  activities: Array<StoredSessionActivity>
  scenes: Array<SceneConfig>
  layoutMode: "basic" | "advanced"
}

export type UpdateSessionInput = Partial<
  Omit<SessionRecord, "id" | "createdAt" | "updatedAt">
>

/**
 * What the rest of the app may know about session storage, with two
 * implementations: this `localStorage` one and `http-sessions-repository.ts`.
 */
export type SessionsStore = {
  list: () => Promise<Array<SessionRecord>>
  get: (id: string) => Promise<SessionRecord | null>
  create: (input: CreateSessionInput) => Promise<SessionRecord>
  update: (id: string, patch: UpdateSessionInput) => Promise<SessionRecord>
  remove: (id: string) => Promise<void>
  removeMany: (ids: ReadonlyArray<string>) => Promise<void>
  updateStatusMany: (
    ids: ReadonlyArray<string>,
    status: SessionStatus
  ) => Promise<Array<SessionRecord>>
  duplicate: (id: string) => Promise<SessionRecord>
}

function totalDurationOf(scenes: Array<SceneConfig>): number {
  return scenes.reduce((max, s) => Math.max(max, s.start_time + s.duration), 0)
}

export class SessionNotFoundError extends Error {
  constructor(id: string) {
    super(`Session not found: ${id}`)
    this.name = "SessionNotFoundError"
  }
}

/**
 * The `localStorage` backend: the Pages build's only store, and what the
 * repository tests run against via an in-memory adapter.
 */
export class SessionsRepository implements SessionsStore {
  constructor(
    private readonly storage: StorageAdapter,
    private readonly latencyMs: number
  ) {}

  private readAll(): Array<SessionRecord> {
    return readJSON(this.storage, STORAGE_KEY, [])
  }

  private writeAll(sessions: Array<SessionRecord>): void {
    writeJSON(this.storage, STORAGE_KEY, sessions)
  }

  async list(): Promise<Array<SessionRecord>> {
    await delay(this.latencyMs)
    return this.readAll()
  }

  async get(id: string): Promise<SessionRecord | null> {
    await delay(this.latencyMs)
    return this.readAll().find((s) => s.id === id) ?? null
  }

  async create(input: CreateSessionInput): Promise<SessionRecord> {
    await delay(this.latencyMs)
    const now = new Date().toISOString()
    const record: SessionRecord = {
      id: generateId("session"),
      name: input.name,
      status: "draft",
      activities: input.activities,
      scenes: input.scenes,
      layoutMode: input.layoutMode,
      totalDurationMs: totalDurationOf(input.scenes),
      createdAt: now,
      updatedAt: now,
    }

    const all = this.readAll()
    all.push(record)
    this.writeAll(all)
    return record
  }

  async update(id: string, patch: UpdateSessionInput): Promise<SessionRecord> {
    await delay(this.latencyMs)
    const all = this.readAll()
    const index = all.findIndex((s) => s.id === id)
    if (index === -1) throw new SessionNotFoundError(id)

    const updated: SessionRecord = {
      ...all[index],
      ...patch,
      updatedAt: new Date().toISOString(),
    }
    all[index] = updated
    this.writeAll(all)
    return updated
  }

  async remove(id: string): Promise<void> {
    await delay(this.latencyMs)
    this.writeAll(this.readAll().filter((s) => s.id !== id))
  }

  async removeMany(ids: ReadonlyArray<string>): Promise<void> {
    await delay(this.latencyMs)
    const idSet = new Set(ids)
    this.writeAll(this.readAll().filter((s) => !idSet.has(s.id)))
  }

  /** Bulk status transition: the one field coherent to set identically
   * across a heterogeneous group. */
  async updateStatusMany(
    ids: ReadonlyArray<string>,
    status: SessionStatus
  ): Promise<Array<SessionRecord>> {
    await delay(this.latencyMs)
    const idSet = new Set(ids)
    const now = new Date().toISOString()
    const all = this.readAll().map((s) =>
      idSet.has(s.id) ? { ...s, status, updatedAt: now } : s
    )
    this.writeAll(all)
    return all.filter((s) => idSet.has(s.id))
  }

  async duplicate(id: string): Promise<SessionRecord> {
    await delay(this.latencyMs)
    const source = this.readAll().find((s) => s.id === id)
    if (!source) throw new SessionNotFoundError(id)

    const now = new Date().toISOString()
    const copy: SessionRecord = {
      ...source,
      id: generateId("session"),
      name: `${source.name} (copy)`,
      status: "draft",
      startedAt: undefined,
      completedAt: undefined,
      createdAt: now,
      updatedAt: now,
    }

    const all = this.readAll()
    all.push(copy)
    this.writeAll(all)
    return copy
  }
}

export function createSessionsRepository(
  storage: StorageAdapter = browserLocalStorage,
  latencyMs: number = MOCK_LATENCY_MS
): SessionsRepository {
  return new SessionsRepository(storage, latencyMs)
}
