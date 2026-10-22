import type { Db } from "@mailbox/store"
import initSqlJs from "sql.js"
import type { Database, SqlValue } from "sql.js"

export async function openSqlite(): Promise<Database> {
  const SQL = await initSqlJs()
  return new SQL.Database()
}

function toSqlValue(value: unknown): SqlValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number"
  ) {
    return value
  }
  if (value instanceof ArrayBuffer) return new Uint8Array(value)
  if (value instanceof Uint8Array) return value
  throw new Error("a value D1 would not bind")
}

type Prepared = ReturnType<Db["prepare"]>
type Bound = ReturnType<Prepared["bind"]>

/**
 * The part of `D1Database` the adapter uses, over a real SQLite (sql.js).
 */
export function d1Shim(db: Database, blobs: "array" | "bytes" = "array"): Db {
  return {
    prepare(sql): Prepared {
      return {
        bind(...values): Bound {
          const rows = (): Array<Record<string, unknown>> => {
            const statement = db.prepare(sql)
            try {
              statement.bind(values.map(toSqlValue))
              const found: Array<Record<string, unknown>> = []
              while (statement.step()) {
                found.push(
                  Object.fromEntries(
                    Object.entries(statement.getAsObject()).map(
                      ([column, value]) => [
                        column,
                        value instanceof Uint8Array && blobs === "array"
                          ? Array.from(value)
                          : value,
                      ]
                    )
                  )
                )
              }
              return found
            } finally {
              statement.free()
            }
          }
          return {
            first: () => Promise.resolve(rows().at(0) ?? null),
            all: () => Promise.resolve({ results: rows() }),
          }
        },
      }
    },
  }
}
