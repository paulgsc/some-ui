/**
 * The mechanism behind `ambient-durable`'s `failureMustSurviveNavigation`
 * (`presentation.ts`): `useIntent`'s state dies when
 * `use-live-layout-editor.ts` unmounts, so a failed autosave is mirrored here
 * by session id and read back when that session's editor mounts.
 *
 * Narrow on purpose: one producer needs it. No retry payload: the policy
 * requires no retry for this mode, and the failed tree is gone by then;
 * editing again is the retry.
 */

import {
  jsonOf,
  localStorageOrNull,
  openKept,
  readWhole,
  removeRecord,
  writeKept,
} from "@some-ui/core-utils"
import type { IntentErrorKind } from "@some-ui/intent-kit"

export type StoredAutosaveFailure = {
  readonly kind: IntentErrorKind
  readonly summary: string
}

const STORAGE_PREFIX = "some-ui:autosave-failure:"

function keyFor(sessionId: string): string {
  return `${STORAGE_PREFIX}${sessionId}`
}

function isStoredAutosaveFailure(
  value: unknown
): value is StoredAutosaveFailure {
  if (typeof value !== "object" || value === null) return false
  if (!("kind" in value) || typeof value.kind !== "string") return false
  if (!("summary" in value) || typeof value.summary !== "string") return false
  return true
}

const readFailure = readWhole((raw): StoredAutosaveFailure | null => {
  const value = jsonOf(raw)
  return isStoredAutosaveFailure(value) ? value : null
})

export function readDurableFailure(
  sessionId: string
): StoredAutosaveFailure | null {
  return openKept<StoredAutosaveFailure | null>(
    localStorageOrNull(),
    keyFor(sessionId),
    readFailure,
    null
  ).value
}

/**
 * Best-effort: on a storage failure the in-memory status still covers this
 * mount; only surviving navigation is lost.
 */
export function writeDurableFailure(
  sessionId: string,
  failure: StoredAutosaveFailure
): void {
  writeKept(localStorageOrNull(), keyFor(sessionId), failure, readFailure)
}

export function clearDurableFailure(sessionId: string): void {
  const storage = localStorageOrNull()
  // As writeDurableFailure: best-effort.
  if (storage !== null) removeRecord(storage, keyFor(sessionId))
}
