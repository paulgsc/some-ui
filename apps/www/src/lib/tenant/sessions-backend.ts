/**
 * Which `SessionsStore` this build talks to, decided by `DATA_MODE`.
 *
 * The same bit that already chooses whether companion data is fetched or
 * bundled chooses this, because it is the same question: is there a backend
 * here at all.
 *
 * - **`"static"`** — the GitHub Pages build. No `file_host`, no push, and
 *   `localStorage` is not a fallback there but the actual store. The client
 *   nudge policy stays with it; see `use-study-nudge.ts`.
 * - **`"server"`** — `vite dev`, `vite preview`, and the Docker image. The
 *   sessions live in `file_host` so that the server's policy can see them.
 *
 * ## Server mode does not fall back
 *
 * A `file_host` that is down makes sessions fail, visibly, rather than
 * quietly reverting to `localStorage`. That is deliberate and it is the
 * less obvious of the two options: a silent fallback means writes land in
 * whichever store happened to be reachable at the time, and two divergent
 * histories with no way to tell which is which. An error naming `file_host`
 * (see `lib/file-host-config`) is recoverable; a split-brain store is not.
 *
 * ## The migration runs before the first read
 *
 * Every call goes through `ready`, a promise that resolves once the
 * one-time upload in `sessions-migration.ts` has had its turn. It is
 * awaited rather than fired-and-forgotten so that the first `list()` cannot
 * return an empty array a moment before the migration fills it — which
 * would render "no sessions yet" at exactly the person whose sessions were
 * being carried over.
 */

import { DATA_MODE } from "../data-mode"
import { createFileHostTransport } from "../file-host-config/client"
import { createHttpSessionsRepository } from "./http-sessions-repository"
import { reportPartialMigration } from "./migration-signal"
import { migrateLocalSessions } from "./sessions-migration"
import type {
  CreateSessionInput,
  SessionsStore,
  UpdateSessionInput,
} from "./sessions-repository"
import { createSessionsRepository } from "./sessions-repository"
import type { StorageAdapter } from "./storage"
import { browserLocalStorage } from "./storage"
import type { SessionRecord, SessionStatus } from "./types"

/**
 * A store that defers every call until `ready` settles.
 *
 * `ready` never rejects: a migration that could not finish is reported and
 * the store is used anyway. The sessions that did not upload are still in
 * `localStorage` under their own key and will be retried on the next load,
 * so the right response to a half-done migration is to carry on, not to
 * take the app down.
 */
function afterReady(store: SessionsStore, ready: Promise<void>): SessionsStore {
  return {
    list: async (): Promise<Array<SessionRecord>> => {
      await ready
      return store.list()
    },
    get: async (id: string): Promise<SessionRecord | null> => {
      await ready
      return store.get(id)
    },
    create: async (input: CreateSessionInput): Promise<SessionRecord> => {
      await ready
      return store.create(input)
    },
    update: async (
      id: string,
      patch: UpdateSessionInput
    ): Promise<SessionRecord> => {
      await ready
      return store.update(id, patch)
    },
    remove: async (id: string): Promise<void> => {
      await ready
      return store.remove(id)
    },
    removeMany: async (ids: ReadonlyArray<string>): Promise<void> => {
      await ready
      return store.removeMany(ids)
    },
    updateStatusMany: async (
      ids: ReadonlyArray<string>,
      status: SessionStatus
    ): Promise<Array<SessionRecord>> => {
      await ready
      return store.updateStatusMany(ids, status)
    },
    duplicate: async (id: string): Promise<SessionRecord> => {
      await ready
      return store.duplicate(id)
    },
  }
}

export function createSessionsBackend(
  mode = DATA_MODE,
  storage: StorageAdapter = browserLocalStorage
): SessionsStore {
  if (mode === "static") return createSessionsRepository(storage)

  const transport = createFileHostTransport()
  // No `window`, so no base URL: SSR and the unit tests land here. The
  // localStorage repository is the honest answer for both — there is
  // nothing to talk to.
  if (!transport) return createSessionsRepository(storage)

  const remote = createHttpSessionsRepository(transport)

  const ready = migrateLocalSessions(remote, storage)
    .then((outcome) => {
      if (outcome.kind !== "partial") return
      reportPartialMigration(outcome.migrated, outcome.remaining, outcome.error)
    })
    .catch(() => {
      // Reading localStorage threw (private mode, a corrupted blob). There
      // is nothing to migrate that can be read, and refusing to serve
      // sessions over it would be a strange trade.
    })

  return afterReady(remote, ready)
}
