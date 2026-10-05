/**
 * `SqlDriver` over `@capacitor-community/sqlite`: a real SQLite file in the
 * app's private data directory, so it survives restarts and is not subject
 * to the WebView's storage eviction.
 *
 * Only ever loaded by the device build (see `device-backend/install`), and
 * only on the native platform - the plugin's web fallback needs a
 * `jeep-sqlite` element this app does not ship, so a device build opened in
 * a desktop browser fails loudly here rather than half-working.
 *
 * Every `run`/`execute` passes `transaction: false`. The plugin otherwise
 * wraps *each* call in its own transaction, which would both nest inside
 * `transaction()` below (SQLite has no nested `BEGIN`) and turn a seed of a
 * few hundred rows into a few hundred fsyncs.
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
    // One connection, so transactions are serialised here: two handlers
    // interleaving `BEGIN`s on the same connection would be one transaction
    // with two owners.
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
