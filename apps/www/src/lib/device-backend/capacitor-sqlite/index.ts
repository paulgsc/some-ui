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
 */
import { CapacitorSQLite, SQLiteConnection } from "@capacitor-community/sqlite"
import { Capacitor } from "@capacitor/core"

import type { SqlDriver, SqlRow, SqlValue } from "@/lib/device-backend/sql"

/** The on-device database's file name (the plugin appends `SQLite.db`). */
const DEVICE_DB_NAME = "some-ui"

export async function openCapacitorSqlite(
  name: string = DEVICE_DB_NAME
): Promise<SqlDriver> {
  if (!Capacitor.isNativePlatform()) {
    throw new Error(
      "device backend: native SQLite is only available inside the Android app"
    )
  }
  const sqlite = new SQLiteConnection(CapacitorSQLite)
  // A WebView reload keeps the native side's connection open; asking for a
  // new one with the same name then throws. Reuse it instead.
  await sqlite.checkConnectionsConsistency()
  const existing = (await sqlite.isConnection(name, false)).result === true
  const db = existing
    ? await sqlite.retrieveConnection(name, false)
    : await sqlite.createConnection(name, false, "no-encryption", 1, false)
  await db.open()

  let queue: Promise<unknown> = Promise.resolve()

  const driver: SqlDriver = {
    exec: async (sql) => {
      await db.execute(sql, false)
    },
    run: async (sql, params: ReadonlyArray<SqlValue> = []) => {
      const result = await db.run(sql, [...params], false)
      return { changes: result.changes?.changes ?? 0 }
    },
    all: async (sql, params: ReadonlyArray<SqlValue> = []) => {
      const result = await db.query(sql, [...params])
      const values: Array<SqlRow> = result.values ?? []
      return values
    },
    // One connection, so transactions are serialised here: interleaved
    // `BEGIN`s would be one transaction with two owners.
    transaction: <T>(fn: () => Promise<T>): Promise<T> => {
      const next = queue.then(async () => {
        await db.beginTransaction()
        try {
          const value = await fn()
          await db.commitTransaction()
          return value
        } catch (error) {
          await db.rollbackTransaction()
          throw error
        }
      })
      queue = next.catch(() => undefined)
      return next
    },
  }
  return driver
}
