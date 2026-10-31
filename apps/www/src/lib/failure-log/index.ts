/**
 * The phone's own record of what went wrong, readable on the phone itself
 * ("How it's running"): every failure `reportFailure` reports, as the same
 * line the native log gets (`lib/native-log`), with when. `adb logcat` needs
 * a computer; this needs only the phone. Kept in the page's storage, on this
 * phone only, and sent nowhere.
 *
 * It keeps the newest `FAILURE_LOG_CAP` and lets older ones go
 * (`boundedList`; owner, 2026-10-30, `docs/discard-sites.md`): a diagnostic
 * trail, not the study record. Device build only; installed with the native
 * log (`device-backend/boot`).
 */
import { isRecord } from "@some-ui/core-utils"
import type { ForeignFailure } from "@some-ui/intent-kit"
import { addFailureSink } from "@some-ui/intent-kit"

import { boundedList } from "@/lib/bounded-list"
import { failureLine } from "@/lib/native-log"

export const FAILURE_LOG_KEY = "some-ui.failure-log.v1"

/** How many it keeps; the oldest goes when one more comes. */
export const FAILURE_LOG_CAP = 200

export type LoggedFailure = {
  /** When it was reported, as an ISO 8601 instant. */
  readonly at: string
  /** `failureLine`'s line: where, what kind, the summary, and its cause. */
  readonly line: string
}

function isLoggedFailure(value: unknown): value is LoggedFailure {
  return (
    isRecord(value) &&
    typeof value.at === "string" &&
    typeof value.line === "string"
  )
}

const log = boundedList(FAILURE_LOG_KEY, FAILURE_LOG_CAP, isLoggedFailure)

const listeners = new Set<() => void>()

/** What `failureLogSnapshot` last read; `null` once a keep makes it stale. */
let snapshot: ReadonlyArray<LoggedFailure> | null = null

/** Newest first; the same array until a failure is kept (`useSyncExternalStore`). */
export function failureLogSnapshot(): ReadonlyArray<LoggedFailure> {
  snapshot ??= log.read()
  return snapshot
}

/** Calls `listener` after each entry is kept, until the returned function runs. */
export function subscribeFailureLog(listener: () => void): () => void {
  listeners.add(listener)
  return (): void => {
    listeners.delete(listener)
  }
}

/** Keeps `failure`; best effort, since storage that refuses has nowhere to say so. */
export function keepFailure(
  failure: ForeignFailure,
  now: Date = new Date()
): void {
  const entry = { at: now.toISOString(), line: failureLine(failure) }
  // Every entry is its own: none replaces another.
  if (!log.put(entry, () => false)) return
  snapshot = null
  for (const listener of listeners) listener()
}

let installed = false

/** Keeps every reported failure from now on. Once per page. */
export function installFailureLog(): void {
  if (installed) return
  installed = true
  addFailureSink((failure) => keepFailure(failure))
}
