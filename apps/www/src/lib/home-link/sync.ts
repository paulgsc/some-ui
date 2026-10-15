/**
 * The sync from home as one call for the Home server block: through the
 * link's stoppable `get`, with what happened said in a line. Published
 * lessons and rounds only, read with no credential (LA8).
 */
import { deviceBackend } from "@/lib/device-backend/boot"
import type { SyncReport } from "@/lib/device-backend/home-sync"
import {
  HomeUnreachableError,
  syncFromHome,
} from "@/lib/device-backend/home-sync"
import { DeviceStorageError } from "@/lib/device-backend/sql"
import { deviceStorage } from "@/lib/device-backend/storage-view"

import { hostOf } from "./address"
import { homeLink } from "./index"

const LAST_SYNC_KEY = "some-ui.device.last-sync.v1"

export function lastSync(): string {
  try {
    return window.localStorage.getItem(LAST_SYNC_KEY) ?? ""
  } catch {
    return ""
  }
}

function describe(report: SyncReport): string {
  const { lessons, trees, rounds, failed } = report
  const parts = [
    `${lessons.listed} TOPIK lesson${lessons.listed === 1 ? "" : "s"} (${lessons.added} new, ${lessons.updated} updated)`,
    `${trees.listed} drama${trees.listed === 1 ? "" : "s"} (${trees.added} new, ${trees.updated} updated)`,
    `${rounds.added + rounds.updated} Leetype round${rounds.added + rounds.updated === 1 ? "" : "s"} refreshed`,
  ]
  const removed = lessons.removed + trees.removed + rounds.removed
  if (removed > 0) parts.push(`${removed} home no longer lists removed`)
  const skipped = lessons.skipped + trees.skipped + rounds.skipped
  if (skipped > 0) parts.push(`${skipped} not added: this phone is full`)
  if (failed.length > 0) parts.push(`${failed.length} could not be fetched`)
  return parts.join(" · ")
}

/** A sync's end, in the words the block shows. `changed`: re-read the app's queries. */
export type SyncResult = {
  readonly ok: boolean
  readonly line: string
  readonly changed: boolean
}

/** Syncs from `base` (an API base). Never throws: a failure is a line. */
export async function syncLessonsFrom(base: string): Promise<SyncResult> {
  const host = hostOf(base)
  try {
    const { context } = await deviceBackend()
    const outcome = await homeLink().sync((get) =>
      syncFromHome(context.db, base, get)
    )
    void deviceStorage.refresh()
    if (outcome === null) return { ok: false, line: "", changed: false }
    if (outcome.kind === "stopped") {
      return {
        ok: true,
        line: `Stopped. What came from ${host} before that stays on this phone.`,
        changed: true,
      }
    }
    const line = describe(outcome.value)
    try {
      window.localStorage.setItem(
        LAST_SYNC_KEY,
        `${new Date().toLocaleString()} · ${host} · ${line}`
      )
    } catch {
      // Not remembered; the sync itself still happened.
    }
    return { ok: true, line, changed: true }
  } catch (error) {
    // The phone's own storage says so in its words (reported, with the
    // plugin's, to the native log); anything else names the error.
    return {
      ok: false,
      line:
        error instanceof HomeUnreachableError
          ? `Couldn't reach ${host}. Are you on the home network?`
          : error instanceof DeviceStorageError
            ? `Sync failed: ${error.error.summary}`
            : `Sync failed: ${String(error)}`,
      changed: false,
    }
  }
}
