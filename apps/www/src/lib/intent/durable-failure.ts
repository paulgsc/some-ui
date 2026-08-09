/**
 * #946/S2: the mechanism behind `ambient-durable`'s `failureMustSurvive
 * Navigation` promise (see `presentation.ts`'s "The autosave verdict").
 * `useIntent`'s own state is plain React state, gone the moment
 * `use-live-layout-editor.ts` unmounts - exactly what happens when the
 * person navigates away from a live session mid-edit. A failed autosave
 * has to outlive that unmount, so it's mirrored here, keyed by session id,
 * and read back the next time that session's editor mounts.
 *
 * Deliberately narrow: this is not a general "durable intent" facility,
 * just a small keyed record store for the one producer the census found
 * that needs it. If a second producer ever needs the same guarantee,
 * that's the signal to generalize - one caller doesn't justify the
 * abstraction yet.
 *
 * No retry payload is stored, on purpose. The policy this mode grants
 * (`presentation.ts`) never requires a retry affordance for
 * `ambient-durable`, and by the time a person is back on this screen the
 * in-memory tree that failed to save is already gone - resending it would
 * mean persisting a whole `LayoutNode` tree here too, for a capability
 * nothing asks for. Editing the layout again is the retry path.
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
    // Best-effort - private-mode/quota storage failures here still leave
    // the in-memory ambient status covering the current mount; only the
    // survives-navigation guarantee is lost.
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
