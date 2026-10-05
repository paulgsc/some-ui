/**
 * The same `SessionsStore`, backed by `file_host` instead of `localStorage`;
 * the server's nudge policy can only reason about sessions it has.
 *
 * One endpoint per `SessionsRepository` method, so this is a transport only:
 *
 * ```
 * list()                    -> GET    /sessions
 * get(id)                   -> GET    /sessions/:id
 * create(input)             -> POST   /sessions
 * update(id, patch)         -> PATCH  /sessions/:id
 * remove(id)                -> DELETE /sessions/:id
 * removeMany(ids)           -> DELETE /sessions          { ids }
 * updateStatusMany(ids, s)  -> PATCH  /sessions/status   { ids, status }
 * duplicate(id)             -> POST   /sessions/:id/duplicate
 * ```
 *
 * Ids and `totalDurationOf(scenes)` are the server's: `create` sends the four
 * composed fields and takes the rest from the response (a stale zero duration
 * would offer a "~1 min" session). `duplicate` resets to `draft` and clears
 * the stamps server-side, so a copy does not read as "studied today".
 *
 * Last write wins: one browser at a time is the assumption.
 */

import type { FileHostTransport } from "@/lib/file-host-config/client"
import {
  FileHostResponseError,
  requestJSON,
} from "@/lib/file-host-config/client"
import type {
  CreateSessionInput,
  SessionsStore,
  UpdateSessionInput,
} from "@/lib/tenant/sessions-repository"
import { SessionNotFoundError } from "@/lib/tenant/sessions-repository"
import type { SessionRecord, SessionStatus } from "@/lib/tenant/types"

function isNotFound(error: unknown): boolean {
  return error instanceof FileHostResponseError && error.status === 404
}

/**
 * `404` is the one status with a meaning rather than a failure: a session
 * deleted in another tab, not an outage.
 */
async function orNotFound<T>(id: string, request: Promise<T>): Promise<T> {
  try {
    return await request
  } catch (error) {
    if (isNotFound(error)) throw new SessionNotFoundError(id)
    throw error
  }
}

export class HttpSessionsRepository implements SessionsStore {
  constructor(private readonly transport: FileHostTransport) {}

  private request<T>(route: string, init?: RequestInit): Promise<T> {
    return requestJSON<T>(this.transport, route, init)
  }

  async list(): Promise<Array<SessionRecord>> {
    return this.request<Array<SessionRecord>>("/sessions")
  }

  /**
   * `null` for an unknown id, like the `localStorage` repository, so
   * `useSession` renders "not found" rather than an error.
   */
  async get(id: string): Promise<SessionRecord | null> {
    try {
      return await this.request<SessionRecord>(
        `/sessions/${encodeURIComponent(id)}`
      )
    } catch (error) {
      if (isNotFound(error)) return null
      throw error
    }
  }

  async create(input: CreateSessionInput): Promise<SessionRecord> {
    // No `id`, `totalDurationMs` or timestamps: the server's. The full record
    // comes back for the react-query cache.
    return this.request<SessionRecord>("/sessions", {
      method: "POST",
      body: JSON.stringify({
        name: input.name,
        activities: input.activities,
        scenes: input.scenes,
        layoutMode: input.layoutMode,
      }),
    })
  }

  async update(id: string, patch: UpdateSessionInput): Promise<SessionRecord> {
    return orNotFound(
      id,
      this.request<SessionRecord>(`/sessions/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      })
    )
  }

  async remove(id: string): Promise<void> {
    // Deleting something already gone is not an error, as in localStorage.
    await this.request(`/sessions/${encodeURIComponent(id)}`, {
      method: "DELETE",
    })
  }

  async removeMany(ids: ReadonlyArray<string>): Promise<void> {
    // The empty case is a no-op, as in localStorage.
    if (ids.length === 0) return
    await this.request("/sessions", {
      method: "DELETE",
      body: JSON.stringify({ ids }),
    })
  }

  async updateStatusMany(
    ids: ReadonlyArray<string>,
    status: SessionStatus
  ): Promise<Array<SessionRecord>> {
    if (ids.length === 0) return []
    return this.request<Array<SessionRecord>>("/sessions/status", {
      method: "PATCH",
      body: JSON.stringify({ ids, status }),
    })
  }

  async duplicate(id: string): Promise<SessionRecord> {
    return orNotFound(
      id,
      this.request<SessionRecord>(
        `/sessions/${encodeURIComponent(id)}/duplicate`,
        { method: "POST" }
      )
    )
  }
}

export function createHttpSessionsRepository(
  transport: FileHostTransport
): HttpSessionsRepository {
  return new HttpSessionsRepository(transport)
}
