/**
 * The phone's one storage budget, and the rule that keeps it.
 *
 * The bound is Android's: Auto Backup (README departure PD3) is the only
 * copy of this phone's history anywhere else, and Android stops backing an
 * app up, telling nobody, once its database and WebView storage together
 * pass 25 MB (https://developer.android.com/identity/data/autobackup).
 *
 * The rule: a write that grows the database past the budget is refused and
 * rolled back. Nothing the person made is deleted to make room unless they
 * say so: the app names what it would remove and waits for their yes
 * (`components/settings/device-storage.tsx`). Published content is the
 * exception, since home or the app can hand it over again: a sync replaces
 * what home stopped listing and reports it, and the seed drops rounds the
 * app no longer ships, counted in `device_storage_notice` until shown.
 */
import { rfc3339 } from "@/lib/device-backend/common"
import type { SqlDriver } from "@/lib/device-backend/sql"
import { num, one } from "@/lib/device-backend/sql"

export type StorageBudget = {
  /** What everything the app stores must stay within. */
  quotaBytes: number
  /** What the app stores outside this database (the WebView's storage). */
  elsewhereBytes: () => Promise<number>
}

/** An estimate (browsers round it); `0` where there is no `navigator.storage`. */
async function webViewBytes(): Promise<number> {
  if (typeof navigator === "undefined" || !("storage" in navigator)) return 0
  try {
    return (await navigator.storage.estimate()).usage ?? 0
  } catch {
    return 0
  }
}

export const ANDROID_BACKUP_BUDGET: StorageBudget = {
  quotaBytes: 25 * 1024 * 1024,
  elsewhereBytes: webViewBytes,
}

/** The database's pages in use: its file size, with `auto_vacuum = FULL`. */
export async function databaseBytes(db: SqlDriver): Promise<number> {
  const row = await one(
    db,
    `SELECT (page_count - freelist_count) * page_size AS bytes
     FROM pragma_page_count(), pragma_freelist_count(), pragma_page_size()`
  )
  return row === null ? 0 : num(row, "bytes")
}

export type StorageUse = {
  databaseBytes: number
  elsewhereBytes: number
  quotaBytes: number
}

export async function storageUse(
  db: SqlDriver,
  budget: StorageBudget
): Promise<StorageUse> {
  return {
    databaseBytes: await databaseBytes(db),
    elsewhereBytes: await budget.elsewhereBytes(),
    quotaBytes: budget.quotaBytes,
  }
}

export class OverBudgetError extends Error {
  constructor() {
    super(
      "This phone is full: saving this would take it past what Android backs up."
    )
    this.name = "OverBudgetError"
  }
}

/**
 * `write` in one transaction, rolled back with `OverBudgetError` if it grew
 * the database and left the app over `budget`. A write that grew nothing (a
 * rename, a status change) always goes through: refusing it frees nothing.
 */
export async function budgeted<T>(
  db: SqlDriver,
  budget: StorageBudget,
  write: () => Promise<T>
): Promise<T> {
  return db.transaction(async () => {
    const before = await databaseBytes(db)
    const value = await write()
    const after = await databaseBytes(db)
    if (
      after > before &&
      after + (await budget.elsewhereBytes()) > budget.quotaBytes
    ) {
      throw new OverBudgetError()
    }
    return value
  })
}

/** `db` with every transaction `budgeted`: for callers that own theirs. */
export function budgetedDriver(
  db: SqlDriver,
  budget: StorageBudget
): SqlDriver {
  return { ...db, transaction: (write) => budgeted(db, budget, write) }
}

const refusals = new Set<() => void>()

/** Called when a session save is refused, so the app can ask to make room. */
export function onSessionRefused(listener: () => void): () => void {
  refusals.add(listener)
  return () => refusals.delete(listener)
}

export function sessionRefused(): void {
  for (const listener of refusals) listener()
}

/** Removals the person did not ask for and has not been shown. */
export type PruneNotice = { rounds: number; since: string }

export async function notePruned(
  db: SqlDriver,
  rounds: number,
  nowMs: number
): Promise<void> {
  if (rounds === 0) return
  await db.run(
    `INSERT INTO device_storage_notice (id, rounds, since) VALUES (1, ?, ?)
     ON CONFLICT(id) DO UPDATE SET rounds = device_storage_notice.rounds + excluded.rounds`,
    [rounds, rfc3339(nowMs)]
  )
}

export async function readPruneNotice(
  db: SqlDriver
): Promise<PruneNotice | null> {
  const row = await one(
    db,
    "SELECT rounds, since FROM device_storage_notice WHERE id = 1"
  )
  return row === null
    ? null
    : { rounds: num(row, "rounds"), since: String(row.since) }
}

/** Takes back what was shown; anything noted since stays for next time. */
export async function dismissPruneNotice(
  db: SqlDriver,
  shown: PruneNotice
): Promise<void> {
  await db.transaction(async () => {
    await db.run(
      "UPDATE device_storage_notice SET rounds = rounds - ? WHERE id = 1",
      [shown.rounds]
    )
    await db.run("DELETE FROM device_storage_notice WHERE rounds <= 0")
  })
}
