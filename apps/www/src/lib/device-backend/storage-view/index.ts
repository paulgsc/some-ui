/**
 * What the app shows about the phone's storage (`device-backend/storage`):
 * how much of the budget is in use, the removals not yet shown, and, after
 * a session save was refused, which session it could remove to make room.
 * A pull reads it again (`check`, PULL4).
 */
import { deviceBackend } from "@/lib/device-backend/boot"
import type { RemovableSession } from "@/lib/device-backend/handlers/sessions"
import { oldestRemovable } from "@/lib/device-backend/handlers/sessions"
import type { PruneNotice, StorageUse } from "@/lib/device-backend/storage"
import {
  dismissPruneNotice,
  onSaveRefused,
  readPruneNotice,
  storageUse,
} from "@/lib/device-backend/storage"

export type DeviceStorageView = {
  use: StorageUse
  notice: PruneNotice | null
  full: { removable: RemovableSession | null } | null
}

let snapshot: DeviceStorageView | null = null
let full: DeviceStorageView["full"] = null
const listeners = new Set<() => void>()
/** A pull's read still out, which another pull joins. */
let checking: Promise<void> | null = null

/** Reads the phone's storage again: whether it could. */
async function read(): Promise<boolean> {
  let read = false
  try {
    const { context } = await deviceBackend()
    snapshot = {
      use: await storageUse(context.db, context.budget),
      notice: await readPruneNotice(context.db),
      full,
    }
    read = true
  } catch {
    // Ignored: not shown this time; the next refresh tries again.
  }
  for (const listener of listeners) listener()
  return read
}

/** Rejects when `read` could not, as a pull's refresher says it. */
const orThrow = (ok: boolean): void => {
  if (!ok) throw new Error("this phone's storage could not be read")
}

onSaveRefused((spare) => {
  void (async (): Promise<void> => {
    try {
      const { context } = await deviceBackend()
      full = {
        removable: await oldestRemovable(context.db, context.now(), spare),
      }
    } catch {
      full = { removable: null }
    }
    await read()
  })()
})

export const deviceStorage = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
  getSnapshot(): DeviceStorageView | null {
    return snapshot
  },
  refresh(): Promise<void> {
    return read().then(() => undefined)
  },
  /**
   * A pull's read (`lib/pull-refresh/refreshers`): rejects when it could not
   * read, and joins one still out, so every screen showing it reads it once.
   */
  check(): Promise<void> {
    checking ??= read()
      .then(orThrow)
      .finally(() => {
        checking = null
      })
    return checking
  },
  /** Room was made, or the person declined: stop asking until the next refusal. */
  settle(): Promise<void> {
    full = null
    return read().then(() => undefined)
  },
  async dismiss(shown: PruneNotice): Promise<void> {
    try {
      const { context } = await deviceBackend()
      await dismissPruneNotice(context.db, shown)
    } catch {
      // Ignored: still shown; dismissing again tries again.
    }
    await read()
  },
}
