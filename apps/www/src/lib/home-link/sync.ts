/**
 * The sync from home as one call for the Home server block: through the
 * link's stoppable `get`, with what happened said in a line. Published
 * lessons and rounds only, read with no credential (LA8).
 */
import { reportFailure, toIntentError } from "@some-ui/intent-kit"

import { deviceBackend } from "@/lib/device-backend/boot"
import {
  HomeBusyError,
  HomeUnreachableError,
  syncFromHome,
} from "@/lib/device-backend/home-sync"
import { DeviceStorageError } from "@/lib/device-backend/sql"
import { deviceStorage } from "@/lib/device-backend/storage-view"

import { hostOf } from "./address"
import { homeLink } from "./index"
import { remember, remembered } from "./remembered"
import type { SyncEnd } from "./sync-words"
import { syncLine } from "./sync-words"

const LAST_SYNC_KEY = "some-ui.device.last-sync.v1"

export function lastSync(): string {
  return remembered(LAST_SYNC_KEY)
}

/** A sync's end, in the words the block shows. */
export type SyncResult = {
  readonly ok: boolean
  readonly line: string
}

/**
 * Syncs from `base` (an API base), then calls `refresh` once anything may
 * have changed, so the app re-reads what it shows whether or not the page
 * that started the sync is still open. Never throws: a failure is a line.
 */
export async function syncLessonsFrom(
  base: string,
  refresh: () => unknown
): Promise<SyncResult> {
  const host = hostOf(base)
  let started = false
  try {
    const { context } = await deviceBackend()
    started = true
    const outcome = await homeLink().sync((get) =>
      syncFromHome(context.db, base, get)
    )
    void deviceStorage.refresh()
    if (outcome === null) return { ok: false, line: "" }
    refresh()
    if (outcome.kind === "stopped") {
      return { ok: true, line: syncLine({ kind: "stopped" }) }
    }
    const line = syncLine({ kind: "done", report: outcome.value })
    remember(
      LAST_SYNC_KEY,
      `${new Date().toLocaleString()} · ${host} · ${line}`
    )
    return { ok: true, line }
  } catch (error) {
    // Ended part way, it may have copied some: the app shows what it did.
    if (started) {
      void deviceStorage.refresh()
      refresh()
    }
    const end = endOf(error)
    const line = syncLine(end)
    if (end.kind === "other") {
      reportFailure({
        port: "home server (sync)",
        error: { ...toIntentError(error), summary: line },
      })
    }
    // Busy is not a failure: like a stop, it ends the sync where it was.
    return { ok: end.kind === "busy", line }
  }
}

/**
 * How a sync that threw ended. The phone's own storage says so in its words
 * (reported, with the plugin's, to the native log).
 */
function endOf(error: unknown): SyncEnd {
  if (error instanceof HomeBusyError) return { kind: "busy" }
  if (error instanceof HomeUnreachableError) return { kind: "unreachable" }
  if (error instanceof DeviceStorageError) {
    return { kind: "storage", summary: error.error.summary }
  }
  return { kind: "other" }
}
