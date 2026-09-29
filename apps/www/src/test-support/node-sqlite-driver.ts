/**
 * The device backend's `SqlDriver` over Node's built-in `node:sqlite`, for
 * tests: an in-memory database that runs the handlers' real SQL, so a test
 * of a route fails when its SQL is wrong rather than when a mock disagrees.
 *
 * The APK uses `@capacitor-community/sqlite` instead, which is the same
 * SQLite engine behind a native bridge; what could differ between the two is
 * the bridge's value marshalling (numbers vs strings), which is why the
 * handlers normalise what they read.
 */
import { DatabaseSync } from "node:sqlite"

import type { SqlDriver, SqlRow, SqlValue } from "@/lib/device-backend/sql"

/** `node:sqlite` hands back `bigint` and blobs too; the schema has neither. */
function toRow(row: Record<string, unknown>): SqlRow {
  const out: Record<string, SqlValue> = {}
  for (const [column, value] of Object.entries(row)) {
    if (typeof value === "bigint") out[column] = Number(value)
    else if (
      typeof value === "string" ||
      typeof value === "number" ||
      value === null
    )
      out[column] = value
    else throw new Error(`node-sqlite: column ${column} is not a scalar`)
  }
  return out
}

export function openNodeSqlite(): SqlDriver {
  const db = new DatabaseSync(":memory:")
  const exec: SqlDriver["exec"] = (sql) => {
    db.exec(sql)
    return Promise.resolve()
  }
  const run: SqlDriver["run"] = (sql, params = []) => {
    const result = db.prepare(sql).run(...params)
    return Promise.resolve({ changes: Number(result.changes) })
  }
  const all: SqlDriver["all"] = (sql, params = []) => {
    const rows = db.prepare(sql).all(...params)
    return Promise.resolve(rows.map(toRow))
  }
  const transaction: SqlDriver["transaction"] = async (fn) => {
    db.exec("BEGIN")
    try {
      const value = await fn()
      db.exec("COMMIT")
      return value
    } catch (error) {
      db.exec("ROLLBACK")
      throw error
    }
  }
  return { exec, run, all, transaction }
}
