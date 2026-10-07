/**
 * `SqlDriver` over `@capacitor-community/sqlite`: a real SQLite file in the
 * app's private data directory, safe from WebView storage eviction.
 *
 * Native only: the plugin's web fallback needs a `jeep-sqlite` element this
 * app does not ship, so a device build in a desktop browser fails loudly.
 *
 * Every `run`/`execute` passes `transaction: false`: otherwise each call gets
 * its own transaction, which cannot nest inside `transaction()` below and
 * turns a seed into hundreds of fsyncs.
 *
 * Every call into the plugin goes through `callForeign` (docs/monorepo-
 * boundaries.md, F1): by a deadline, in `IntentError`'s words, reported
 * with the plugin's own message. A failure reaches handlers as a
 * `DeviceStorageError`, which the interceptor answers as a 503, so a phone
 * whose database will not open says that, not "the study server had a
 * problem". The plugin's encryption is off (apps/mobile capacitor.config.ts
 * says why); `classifyDeviceStorage` still names its failed load, should
 * anything else make it fail.
 */
import { CapacitorSQLite, SQLiteConnection } from "@capacitor-community/sqlite"
import type { SQLiteDBConnection } from "@capacitor-community/sqlite"
import { Capacitor } from "@capacitor/core"
import type { ForeignCall, ForeignVerdict } from "@some-ui/intent-kit"
import {
  callForeign,
  ForeignDeadlineError,
  reportFailure,
} from "@some-ui/intent-kit"

import type { SqlDriver, SqlRow, SqlValue } from "@/lib/device-backend/sql"
import { DeviceStorageError } from "@/lib/device-backend/sql"

/** The on-device database's file name (the plugin appends `SQLite.db`). */
const DEVICE_DB_NAME = "some-ui"

/** Opening: connection bookkeeping and the file itself. */
const OPEN_DEADLINE_MS = 30_000
/** One statement; long enough for the one-time `VACUUM` rebuild. */
const STATEMENT_DEADLINE_MS = 60_000

/**
 * What the plugin's failure means here. It rejects with its `load()`'s
 * message, prefixed "CapacitorSQLitePlugin: ", whenever its native side
 * failed to start (`CapacitorSQLitePlugin.java`): every call fails the same
 * way until the process restarts, so no retry helps. A Capacitor `code` of
 * `UNAVAILABLE` or `UNIMPLEMENTED` (no plugin in this build) is as final.
 * Anything else is one statement failing.
 */
function classifyDeviceStorage(error: unknown): ForeignVerdict {
  if (error instanceof ForeignDeadlineError) {
    return {
      kind: "unreachable",
      retryable: true,
      summary: "This phone's storage didn't answer.",
    }
  }
  const code: unknown =
    typeof error === "object" && error !== null
      ? Reflect.get(error, "code")
      : undefined
  const message = error instanceof Error ? error.message : String(error)
  if (
    code === "UNAVAILABLE" ||
    code === "UNIMPLEMENTED" ||
    message.startsWith("CapacitorSQLitePlugin:")
  ) {
    return {
      kind: "unavailable",
      retryable: false,
      summary: "This phone's storage couldn't be opened.",
    }
  }
  return {
    kind: "unknown",
    retryable: true,
    summary: "This phone's storage couldn't finish that.",
  }
}

const PORT = {
  name: "device storage",
  classify: classifyDeviceStorage,
  report: reportFailure,
}

/** A call's value, or the storage's failure as a `DeviceStorageError`. */
async function resultOf<T>(call: ForeignCall<T>): Promise<T> {
  const outcome = await call.outcome
  if (outcome.status === "succeeded") return outcome.value
  if (outcome.status === "failed") throw new DeviceStorageError(outcome.error)
  // Nothing here abandons a call.
  throw new Error("device storage: a call was abandoned")
}

export async function openCapacitorSqlite(
  name: string = DEVICE_DB_NAME
): Promise<SqlDriver> {
  if (!Capacitor.isNativePlatform()) {
    throw new Error(
      "device backend: native SQLite is only available inside the Android app"
    )
  }
  // Boxed: a connection is a plain object, but the plugin behind it is a
  // thenable Proxy (CLAUDE.md), and this keeps that question out of the way.
  const { db } = await resultOf(
    callForeign({
      port: PORT,
      deadlineMs: OPEN_DEADLINE_MS,
      start: async (): Promise<{ db: SQLiteDBConnection }> => {
        const sqlite = new SQLiteConnection(CapacitorSQLite)
        // A WebView reload keeps the native side's connection open; asking
        // for a new one with the same name then throws. Reuse it instead.
        await sqlite.checkConnectionsConsistency()
        const existing =
          (await sqlite.isConnection(name, false)).result === true
        const connection = existing
          ? await sqlite.retrieveConnection(name, false)
          : await sqlite.createConnection(
              name,
              false,
              "no-encryption",
              1,
              false
            )
        await connection.open()
        return { db: connection }
      },
    })
  )
  const statement = <T>(start: () => PromiseLike<T>): Promise<T> =>
    resultOf(
      callForeign({ port: PORT, deadlineMs: STATEMENT_DEADLINE_MS, start })
    )

  let queue: Promise<unknown> = Promise.resolve()

  const driver: SqlDriver = {
    exec: async (sql) => {
      await statement(() => db.execute(sql, false))
    },
    run: async (sql, params: ReadonlyArray<SqlValue> = []) => {
      const result = await statement(() => db.run(sql, [...params], false))
      return { changes: result.changes?.changes ?? 0 }
    },
    all: async (sql, params: ReadonlyArray<SqlValue> = []) => {
      const result = await statement(() => db.query(sql, [...params]))
      const values: Array<SqlRow> = result.values ?? []
      return values
    },
    // One connection, so transactions are serialised here: interleaved
    // `BEGIN`s would be one transaction with two owners.
    transaction: <T>(fn: () => Promise<T>): Promise<T> => {
      const next = queue.then(async () => {
        await statement(() => db.beginTransaction())
        try {
          const value = await fn()
          await statement(() => db.commitTransaction())
          return value
        } catch (error) {
          await statement(() => db.rollbackTransaction())
          throw error
        }
      })
      queue = next.catch(() => undefined)
      return next
    },
  }
  return driver
}
