import type { KeyedStorage } from "@some-ui/core-utils"
import { openKept, salvageList, writeKept } from "@some-ui/core-utils"
import type { SceneConfig } from "@some-ui/types"

import type { SessionId } from "@/lib/tenant/session-id"
import { newSessionId } from "@/lib/tenant/session-id"
import {
  browserLocalStorage,
  delay,
  MOCK_LATENCY_MS,
  NotKeptError,
} from "@/lib/tenant/storage"
import type {
  SessionRecord,
  SessionStatus,
  StoredSessionActivity,
} from "@/lib/tenant/types"

/** Also read by `sessions-copy`, which copies what is under it when the person asks. */
export const STORAGE_KEY = "some-ui.tenant.sessions.v1"

const SESSION_STATUSES: ReadonlyArray<SessionStatus> = [
  "draft",
  "scheduled",
  "active",
  "paused",
  "completed",
]

/**
 * A stored session, by the fields every one has carried since the store
 * began (#519). One without them is an older or foreign shape: the list it
 * sits in is copied aside before the next write (`openKept`).
 */
function isSessionRecord(value: unknown): value is SessionRecord {
  if (typeof value !== "object" || value === null) return false
  const field = (key: keyof SessionRecord): unknown => Reflect.get(value, key)
  return (
    typeof field("id") === "string" &&
    typeof field("name") === "string" &&
    SESSION_STATUSES.some((status) => status === field("status")) &&
    Array.isArray(field("activities")) &&
    Array.isArray(field("scenes")) &&
    typeof field("createdAt") === "string" &&
    typeof field("updatedAt") === "string"
  )
}

const readSessions = salvageList(isSessionRecord)

/** The sessions kept on this device, as `sessions-copy` reads them too. */
export function keptSessions(storage: KeyedStorage): Array<SessionRecord> {
  return openKept(storage, STORAGE_KEY, readSessions, []).value
}

/**
 * Keeps `sessions` as the device's; false when the device would not, or
 * when what is stored could not be read and copied aside first.
 */
export function keepSessions(
  storage: KeyedStorage,
  sessions: ReadonlyArray<SessionRecord>
): boolean {
  return writeKept(storage, STORAGE_KEY, sessions, readSessions)
}

export type CreateSessionInput = {
  /**
   * The id to create it under, where the store takes one: `file_host` does
   * (paulgsc/server#432) and makes one session however often the same create
   * is sent. This store names its own.
   */
  id?: SessionId
  name: string
  // The stored shape, not the catalogue's: copying this device's sessions to
  // an account passes their activities through verbatim, retired ids and all.
  activities: Array<StoredSessionActivity>
  scenes: Array<SceneConfig>
  layoutMode: "basic" | "advanced"
  /**
   * When it was made where it was made, for a copy: `file_host` dates the
   * session by it (paulgsc/server#630), and so, for parity, does this store.
   */
  createdAt?: string
}

/**
 * `createdAt` is a copy's to send, catching up one made before home took it
 * on create; nothing else sends it.
 */
export type UpdateSessionInput = Partial<
  Omit<SessionRecord, "id" | "updatedAt">
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
    private readonly storage: KeyedStorage,
    private readonly latencyMs: number
  ) {}

  private readAll(): Array<SessionRecord> {
    return keptSessions(this.storage)
  }

  /** Throws `NotKeptError` rather than write over what it could not read. */
  private writeAll(sessions: Array<SessionRecord>): void {
    if (!keepSessions(this.storage, sessions)) throw new NotKeptError()
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
      id: newSessionId(),
      name: input.name,
      status: "draft",
      activities: input.activities,
      scenes: input.scenes,
      layoutMode: input.layoutMode,
      totalDurationMs: totalDurationOf(input.scenes),
      createdAt: input.createdAt ?? now,
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
      id: newSessionId(),
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
  storage: KeyedStorage = browserLocalStorage,
  latencyMs: number = MOCK_LATENCY_MS
): SessionsRepository {
  return new SessionsRepository(storage, latencyMs)
}
