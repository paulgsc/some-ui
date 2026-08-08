/**
 * Carry sessions already in this browser over to `file_host`, once.
 *
 * The failure this exists to prevent is a quiet one. There is real data in
 * people's browsers under `some-ui.tenant.sessions.v1`, and a naive cutover
 * strands it: the sessions simply do not appear, nothing errors, and there
 * is nothing in the UI to say where they went. Worse for the nudge
 * specifically — a person whose history vanished looks, to the policy, like
 * a person who has never studied.
 *
 * ## Why it uploads through the ordinary routes
 *
 * There is no import endpoint and there should not be one for a one-time
 * move. So each session is `POST`ed and then `PATCH`ed back into shape,
 * which costs one detail worth stating: **the server mints the id**. A
 * migrated session keeps its name, status, scenes, activities, layout and
 * its `startedAt`/`completedAt` — everything the policy reads — and gets a
 * new `session-<uuid>`. Nothing in this app persists a session id outside
 * the store itself, so that is a cost paid entirely inside this function.
 *
 * `totalDurationMs` *is* sent in the patch, which looks like the thing
 * #923 forbade and is not: the ban is on the client **computing** it, and
 * this copies a value the client already stored. A record written before
 * this app computed durations the way it does now should migrate as it was
 * rather than be silently recalculated.
 *
 * ## Why the local store is kept
 *
 * Marked, not deleted. If the upload was wrong in some way nobody noticed
 * for a week, the original is still there; and the static build reads the
 * same key, so a browser that visits both deployments keeps working. The
 * cost is a duplicate copy of the data, which is small and recoverable, as
 * against an irreversible delete, which is neither.
 */

import type { SessionsStore } from "./sessions-repository"
import { STORAGE_KEY } from "./sessions-repository"
import type { StorageAdapter } from "./storage"
import { readJSON, writeJSON } from "./storage"
import type { SessionRecord } from "./types"

/**
 * What has already been carried over. Versioned alongside the store it
 * reads, so a future change to either is a new key rather than a
 * reinterpretation of this one.
 */
const MIGRATION_KEY = "some-ui.tenant.sessions.migrated.v1"

type MigrationRecord = {
  /** Set only once every local session has landed. */
  completedAt: string | null
  /** Local id -> the id `file_host` minted. The duplicate guard. */
  uploaded: Record<string, string>
}

export type MigrationOutcome =
  | { kind: "already-done" }
  | { kind: "nothing-to-migrate" }
  | { kind: "migrated"; count: number }
  /** Some sessions landed, some did not; the rest retry on the next load. */
  | { kind: "partial"; migrated: number; remaining: number; error: unknown }

/**
 * A *fresh* record every time, deliberately. `readJSON` hands its fallback
 * back by reference, and the loop below records progress by writing into
 * `uploaded` — so a shared empty constant would accumulate ids across every
 * caller that ever found the store empty, and then skip sessions it had
 * never actually uploaded. Cheap to get wrong, silent when it is.
 */
function readRecord(storage: StorageAdapter): MigrationRecord {
  const stored = readJSON<MigrationRecord | null>(storage, MIGRATION_KEY, null)
  return {
    completedAt: stored?.completedAt ?? null,
    uploaded: { ...stored?.uploaded },
  }
}

/**
 * Upload every local session `file_host` has not already been given.
 *
 * Progress is written after **each** session rather than at the end, which
 * is the whole duplicate guard: a run interrupted halfway — a closed tab, a
 * backend that went away — resumes at the next session rather than starting
 * over and posting the first half twice.
 */
export async function migrateLocalSessions(
  remote: SessionsStore,
  storage: StorageAdapter
): Promise<MigrationOutcome> {
  const record = readRecord(storage)
  if (record.completedAt !== null) return { kind: "already-done" }

  const local = readJSON<Array<SessionRecord>>(storage, STORAGE_KEY, [])
  const pending = local.filter((session) => !(session.id in record.uploaded))

  if (pending.length === 0) {
    // Either there was nothing here, or a previous run finished the work
    // and did not get to write the stamp. Either way this browser is done.
    writeJSON(storage, MIGRATION_KEY, {
      ...record,
      completedAt: new Date().toISOString(),
    })
    return local.length === 0
      ? { kind: "nothing-to-migrate" }
      : { kind: "migrated", count: 0 }
  }

  let migrated = 0
  for (const session of pending) {
    try {
      const created = await remote.create({
        name: session.name,
        activities: session.activities,
        scenes: session.scenes,
        layoutMode: session.layoutMode,
      })

      // Everything `create` is not allowed to accept, restored in one
      // patch. `status` and the two stamps are the fields the nudge policy
      // reads; dropping them would make a migrated history invisible to it.
      await remote.update(created.id, {
        status: session.status,
        totalDurationMs: session.totalDurationMs,
        ...(session.layout === undefined ? {} : { layout: session.layout }),
        ...(session.startedAt === undefined
          ? {}
          : { startedAt: session.startedAt }),
        ...(session.completedAt === undefined
          ? {}
          : { completedAt: session.completedAt }),
        ...(session.finalElapsedMs === undefined
          ? {}
          : { finalElapsedMs: session.finalElapsedMs }),
      })

      record.uploaded[session.id] = created.id
      migrated += 1
      writeJSON(storage, MIGRATION_KEY, record)
    } catch (error) {
      // Stop at the first failure rather than pressing on: the likely cause
      // is `file_host` going away, and the remaining calls would all fail
      // the same way. The stamp stays unset, so the next load resumes.
      writeJSON(storage, MIGRATION_KEY, record)
      return {
        kind: "partial",
        migrated,
        remaining: pending.length - migrated,
        error,
      }
    }
  }

  writeJSON(storage, MIGRATION_KEY, {
    ...record,
    completedAt: new Date().toISOString(),
  })
  return { kind: "migrated", count: migrated }
}
