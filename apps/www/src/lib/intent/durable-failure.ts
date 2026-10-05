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

export function readDurableFailure(
  sessionId: string
): StoredAutosaveFailure | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(keyFor(sessionId))
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    return isStoredAutosaveFailure(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function writeDurableFailure(
  sessionId: string,
  failure: StoredAutosaveFailure
): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(keyFor(sessionId), JSON.stringify(failure))
  } catch {
    // Best-effort: on a storage failure the in-memory status still covers this
    // mount; only surviving navigation is lost.
  }
}

export function clearDurableFailure(sessionId: string): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.removeItem(keyFor(sessionId))
  } catch {
    // See writeDurableFailure.
  }
}
