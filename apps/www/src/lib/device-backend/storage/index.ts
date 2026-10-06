/**
 * The phone's storage budget and the rule that keeps it (apps/mobile/README.md,
 * "What the phone keeps").
 */
import { SOUNDBITES_MAX_BYTES } from "@some-ui/soundbites/contract"

import { errorResponse } from "@/lib/device-backend/router"
import type { SqlDriver } from "@/lib/device-backend/sql"
import { num, one } from "@/lib/device-backend/sql"

export type StorageBudget = {
  quotaBytes: number
  /** Kept free for WebView storage (soundbites' cap); only the database is measured. */
  reservedBytes: number
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

/** Android Auto Backup's per-app quota (developer.android.com/identity/data/autobackup). */
export const ANDROID_BACKUP_BUDGET: StorageBudget = {
  quotaBytes: 25 * 1024 * 1024,
  reservedBytes: SOUNDBITES_MAX_BYTES,
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

export type StorageUse = StorageBudget & {
  databaseBytes: number
  webViewBytes: number
}

export async function storageUse(
  db: SqlDriver,
  budget: StorageBudget
): Promise<StorageUse> {
  return {
    ...budget,
    databaseBytes: await databaseBytes(db),
    webViewBytes: await webViewBytes(),
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
 * the database past the budget less its reserve. A write that grew nothing
 * (a rename, a status change) always goes through: refusing it frees nothing.
 */
async function budgeted<T>(
  db: SqlDriver,
  budget: StorageBudget,
  write: () => Promise<T>
): Promise<T> {
  return db.transaction(async () => {
    const before = await databaseBytes(db)
    const value = await write()
    const after = await databaseBytes(db)
    if (after > before && after + budget.reservedBytes > budget.quotaBytes) {
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

/**
 * A route's `budgeted` answer, or `400 max_record_limit_exceeded` after
 * telling the app, which then asks the person to make room.
 */
export async function budgetedAnswer(
  db: SqlDriver,
  budget: StorageBudget,
  spare: string | null,
  write: () => Promise<Response>
): Promise<Response> {
  try {
    return await budgeted(db, budget, write)
  } catch (error) {
    if (!(error instanceof OverBudgetError)) throw error
    for (const listener of refusals) listener(spare)
    return errorResponse(400, "max_record_limit_exceeded", {
      message: error.message,
    })
  }
}

/** `spare`: the session the refused save was about, never offered for removal. */
type RefusalListener = (spare: string | null) => void
const refusals = new Set<RefusalListener>()

export function onSaveRefused(listener: RefusalListener): () => void {
  refusals.add(listener)
  return () => refusals.delete(listener)
}

/** Removals the person did not ask for and has not been shown. */
export type PruneNotice = { rounds: number }

export async function notePruned(db: SqlDriver, rounds: number): Promise<void> {
  if (rounds === 0) return
  await db.run(
    `INSERT INTO device_storage_notice (id, rounds) VALUES (1, ?)
     ON CONFLICT(id) DO UPDATE SET rounds = device_storage_notice.rounds + excluded.rounds`,
    [rounds]
  )
}

export async function readPruneNotice(
  db: SqlDriver
): Promise<PruneNotice | null> {
  const row = await one(
    db,
    "SELECT rounds FROM device_storage_notice WHERE id = 1"
  )
  return row === null ? null : { rounds: num(row, "rounds") }
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
