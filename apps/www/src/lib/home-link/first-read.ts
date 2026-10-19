/**
 * The pairing the phone's own record held the first time the app read it
 * (or none), kept once and never written over: a choice a record's own
 * switch made before the consent log enters the log only under this pairing
 * (LA9), so never under one paired since, on this page load or a later one.
 */
import { isRecord } from "@/lib/device-backend/common"

export const FIRST_READ_KEY = "some-ui.home.first-read.v1"

type Store = Pick<Storage, "getItem" | "setItem"> | null

/** What the first read found, or null before it is kept, or unreadable. */
export function firstRead(storage: Store): { pairing: string | null } | null {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(FIRST_READ_KEY) ?? "")
    if (!isRecord(parsed)) return null
    const { pairing } = parsed
    return typeof pairing === "string" || pairing === null ? { pairing } : null
  } catch {
    return null
  }
}

/** Keeps `pairing` as the first read's, unless one is kept already. */
export function noteFirstRead(storage: Store, pairing: string | null): void {
  try {
    if (storage?.getItem(FIRST_READ_KEY) !== null) return
    storage.setItem(FIRST_READ_KEY, JSON.stringify({ pairing }))
  } catch {
    // Not kept: no earlier choice enters the log.
  }
}
