/**
 * The whole SQL surface the device backend needs, and nothing more.
 *
 * Two implementations sit behind it: `capacitor-sqlite` (the APK, over
 * `@capacitor-community/sqlite`'s native SQLite) and a `node:sqlite` one the
 * tests use, so every handler runs its real SQL under test rather than
 * against a mock that would agree with whatever the handler assumed.
 *
 * Values are SQLite's own storage classes. Booleans and dates are the
 * handlers' business: they store what `file_host` stores (`INTEGER` 0/1,
 * RFC 3339 `TEXT`), so the two schemas read the same.
 */

export type SqlValue = string | number | null

export type SqlRow = Readonly<Record<string, SqlValue | undefined>>

export type SqlDriver = {
  /** Runs one or more `;`-separated statements that take no parameters. */
  exec: (sql: string) => Promise<void>
  /** One parameterised statement; `changes` is the rows it touched. */
  run: (
    sql: string,
    params?: ReadonlyArray<SqlValue>
  ) => Promise<{ changes: number }>
  /**
   * One parameterised query, every row. Rows are untyped on purpose: read
   * them with `text`/`num` below, which check what the bridge handed
   * back instead of trusting it.
   */
  all: (sql: string, params?: ReadonlyArray<SqlValue>) => Promise<Array<SqlRow>>
  /**
   * `fn` inside one transaction, committed if it resolves and rolled back if
   * it rejects. Not re-entrant: a handler opens at most one.
   */
  transaction: <T>(fn: () => Promise<T>) => Promise<T>
}

/** The first row of `all`, or `null`. */
export async function one(
  driver: SqlDriver,
  sql: string,
  params?: ReadonlyArray<SqlValue>
): Promise<SqlRow | null> {
  const rows = await driver.all(sql, params)
  return rows[0] ?? null
}

/** A `TEXT NOT NULL` column. Throws on anything else: the schema says so. */
export function text(row: SqlRow, column: string): string {
  const value = row[column]
  if (typeof value === "string") return value
  if (typeof value === "number") return String(value)
  throw new Error(`device backend: column ${column} is not text`)
}

/** A nullable `TEXT` column. */
export function textOrNull(row: SqlRow, column: string): string | null {
  const value = row[column]
  return value === null || value === undefined ? null : text(row, column)
}

/** An `INTEGER`/`REAL` column. A numeric string (a bridge quirk) is read. */
export function num(row: SqlRow, column: string): number {
  const value = row[column]
  const parsed = typeof value === "string" ? Number(value) : value
  if (typeof parsed === "number" && Number.isFinite(parsed)) return parsed
  throw new Error(`device backend: column ${column} is not a number`)
}

/** A nullable `INTEGER`/`REAL` column. */
export function numOrNull(row: SqlRow, column: string): number | null {
  const value = row[column]
  return value === null || value === undefined ? null : num(row, column)
}
