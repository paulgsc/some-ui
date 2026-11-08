/**
 * The notes this phone has asked home to delete for good (My data, MD3) and
 * not yet heard home's last word on, kept in this phone's storage: written
 * before the `DELETE` goes, so a lost answer leaves the note here. The voice
 * lane sends none of them (`./voice-copy`'s `sendVoice`), and My data
 * settles each on home's answer (`lib/my-data/deleting-runtime`): a
 * receipt, a `404` or a `409` to the `DELETE`, or a receipt in home's list
 * of what it deleted. A note leaves this list on nothing else.
 */
import type { KeyedStorage, Salvaged } from "@some-ui/core-utils"
import {
  isRecord,
  jsonOf,
  localStorageOrNull,
  openKept,
  writeKept,
} from "@some-ui/core-utils"

const DELETING_KEY = "some-ui.home.deleting.v1"

/** A note asked to be deleted, and the kind My data let it go as. */
export type OwedDelete = { readonly id: string; readonly of: string }

function readOwed(raw: string): Salvaged<Array<OwedDelete>> | null {
  const parsed = jsonOf(raw)
  if (!Array.isArray(parsed)) return null
  const owed = parsed.filter(
    (entry): entry is OwedDelete =>
      isRecord(entry) &&
      typeof entry.id === "string" &&
      typeof entry.of === "string"
  )
  return { value: owed, whole: owed.length === parsed.length }
}

/** Every note asked to be deleted that home has not answered for. */
export function owedDeletes(
  storage: KeyedStorage | null = localStorageOrNull()
): ReadonlyArray<OwedDelete> {
  return openKept(storage, DELETING_KEY, readOwed, []).value
}

/** Adds `ids` of kind `of`; false when the phone could not keep that. */
export function oweDeletes(
  of: string,
  ids: ReadonlyArray<string>,
  storage: KeyedStorage | null = localStorageOrNull()
): boolean {
  const owed = owedDeletes(storage).filter((entry) => !ids.includes(entry.id))
  const next = [...owed, ...ids.map((id) => ({ id, of }))]
  return writeKept(storage, DELETING_KEY, next, readOwed)
}

/** Takes `ids` off, on home's answer for each. */
export function deletesAnswered(
  ids: ReadonlyArray<string>,
  storage: KeyedStorage | null = localStorageOrNull()
): void {
  if (ids.length === 0) return
  const next = owedDeletes(storage).filter((entry) => !ids.includes(entry.id))
  // Unwritten, each stays held back until the next answer takes it off.
  writeKept(storage, DELETING_KEY, next, readOwed)
}
