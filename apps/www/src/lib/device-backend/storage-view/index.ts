/**
 * What the app shows about the phone's storage (`device-backend/storage`):
 * how much of the budget is in use and, after a session save was refused,
 * which session it could remove to make room.
 */
import { deviceBackend } from "@/lib/device-backend/boot"
import type { RemovableSession } from "@/lib/device-backend/handlers/sessions"
import { oldestRemovable } from "@/lib/device-backend/handlers/sessions"
import type { StorageUse } from "@/lib/device-backend/storage"
import { onSaveRefused, storageUse } from "@/lib/device-backend/storage"

export type DeviceStorageView = {
  use: StorageUse
  full: { removable: RemovableSession | null } | null
}

let snapshot: DeviceStorageView | null = null
let full: DeviceStorageView["full"] = null
const listeners = new Set<() => void>()

async function read(): Promise<void> {
  try {
    const { context } = await deviceBackend()
    snapshot = {
      use: await storageUse(context.db, context.budget),
      full,
    }
  } catch {
    // Ignored: not shown this time; the next refresh tries again.
  }
  for (const listener of listeners) listener()
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
    return read()
  },
  /** Room was made, or the person declined: stop asking until the next refusal. */
  settle(): Promise<void> {
    full = null
    return read()
  },
}
