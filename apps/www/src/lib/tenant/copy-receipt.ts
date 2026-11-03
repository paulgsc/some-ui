/**
 * The copy receipt (`lib/tenant/sessions-copy`): for each device session,
 * every copy ever made of it in any account, which is that copy's whole
 * duplicate guard. Its own module so that what deletes a session can
 * forget its entries without reaching the copy itself (LA2).
 */
import type { KeyedStorage } from "@some-ui/core-utils"
import { openKept, salvageEntries, writeKept } from "@some-ui/core-utils"

import { isSessionId } from "@/lib/tenant/session-id"
import type { SessionId } from "@/lib/tenant/session-id"
import { browserLocalStorage } from "@/lib/tenant/storage"

/** Versioned alongside the store it describes, so a change is a new key. */
export const RECEIPT_KEY = "some-ui.tenant.sessions.transfers.v1"

export type Copy = {
  /**
   * The id the server answered with, or `null` for an attempt to create one
   * whose answer never arrived.
   */
  readonly remoteId: string | null
  /** For an attempt, the id its create named, if it named one. */
  readonly named?: SessionId
  /** The second step (restoring status and times) landed too. */
  readonly complete: boolean
}

/** Device session id -> every copy ever made of it, in any account. */
export type Receipt = Record<string, Array<Copy>>

/**
 * A copy as kept. `remoteId` may be absent: a create answered without an id
 * was kept that way, and is read as it always was.
 */
function isCopy(value: unknown): value is Copy {
  if (typeof value !== "object" || value === null) return false
  const remoteId: unknown = Reflect.get(value, "remoteId")
  const named: unknown = Reflect.get(value, "named")
  return (
    (remoteId === undefined ||
      remoteId === null ||
      typeof remoteId === "string") &&
    // Every id ever minted here was `generateId("session")`'s, which fits.
    (named === undefined ||
      (typeof named === "string" && isSessionId(named))) &&
    typeof Reflect.get(value, "complete") === "boolean"
  )
}

export const readCopies = salvageEntries((value): Array<Copy> | null =>
  Array.isArray(value) && value.every(isCopy) ? value : null
)

/**
 * The receipt, read afresh each time (callers write into it); a receipt it
 * cannot read whole is copied aside first.
 */
export function readReceipt(storage: KeyedStorage): Receipt {
  return { ...openKept(storage, RECEIPT_KEY, readCopies, {}).value }
}

/**
 * Drops the receipt's entries for `localIds`, sessions that have left this
 * device: let go once home holds them, or deleted (SL1, #2268, the owner's
 * "clear both"). Nothing is left to copy, so the receipt stays bounded by
 * the sessions still here.
 *
 * A forgotten copy is no longer claimed, so a create whose answer was lost
 * could look like it by content; the copy adopts only a session that also
 * has the same `createdAt` (`sessions-copy`'s `planTransfer`), so it never
 * patches the copy of a session that left. Best effort: a receipt that
 * cannot be written keeps the entries, as before, and so does an entry a
 * copy in flight writes back after this.
 */
export function forgetCopies(
  localIds: ReadonlyArray<string>,
  storage: KeyedStorage = browserLocalStorage
): void {
  if (localIds.length === 0) return
  const receipt = readReceipt(storage)
  if (!localIds.some((id) => Object.hasOwn(receipt, id))) return
  for (const id of localIds) Reflect.deleteProperty(receipt, id)
  writeKept(storage, RECEIPT_KEY, receipt, readCopies)
}
