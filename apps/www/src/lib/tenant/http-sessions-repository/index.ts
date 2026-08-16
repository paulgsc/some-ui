/**
 * The same `SessionsStore`, backed by `file_host` instead of `localStorage`.
 *
 * This is the story that actually moves the source of truth, and without it
 * the rest of the study-nudge migration is decoration: the server's policy
 * can only reason about sessions the server has, so until these writes go
 * through it concludes `nothing-prepared` every day and stays correctly,
 * uselessly silent.
 *
 * The route table was not invented here. `file_host` built one endpoint per
 * method of `SessionsRepository`, on purpose, so this file is a transport
 * and nothing else:
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
 * ## Two behaviours are gone from the client, not moved
 *
 * `generateId("session")` and `totalDurationOf(scenes)` are the server's
 * now, and a client that kept sending either would be a second
 * implementation waiting to disagree. The duration is the nastier of the
 * two: a stale zero produces a notification offering a "~1 min" session.
 * So `create` sends the four fields the composer collected and takes
 * everything else from the response. `duplicate` likewise — the copy resets
 * to `draft` and clears `startedAt`/`completedAt` server-side, because
 * carrying those into a copy would make a fresh duplicate read as "studied
 * today" and silence the day.
 *
 * ## Last write wins
 *
 * There is no conflict resolution, and there is not meant to be. One
 * browser at a time is the assumption; two browsers editing one session
 * will end with whichever wrote last. Written down here rather than
 * silently relied on.
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
 * `404` is the one status with a meaning rather than a failure. The server
 * returns it — not a `500` — precisely so this mapping is possible; a `500`
 * would have the app reporting an outage for a session someone deleted in
 * another tab.
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
   * `null` rather than a throw for an unknown id, matching the
   * `localStorage` repository — `useSession` renders "not found" from it,
   * and a rejected query would render an error instead.
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
    // No `id`, no `totalDurationMs`, no timestamps: all four are the
    // server's, and the full record comes back because the react-query
    // cache depends on it.
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
    // Deleting something already gone is not an error here, the same way it
    // is not for the localStorage repository.
    await this.request(`/sessions/${encodeURIComponent(id)}`, {
      method: "DELETE",
    })
  }

  async removeMany(ids: ReadonlyArray<string>): Promise<void> {
    // The empty case short-circuits rather than asking the server to delete
    // nothing — the localStorage repository treats it as a no-op and a
    // round trip would be the only observable difference.
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
