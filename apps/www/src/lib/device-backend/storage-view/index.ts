/**
 * What the app shows about the phone's storage (`device-backend/storage`):
 * how much of the budget is in use, the removals not yet shown, and, after
 * a session save was refused, which session it could remove to make room.
 *
 * A snapshot store outside React (`docs/monorepo-boundaries.md`, R1): the
 * components read it and dispatch. Nothing here deletes a session; the
 * person's yes does, through the app's own sessions repository.
 *
 * Device build only: it opens the same database the backend answers from.
 */
import { deviceBackend } from "@/lib/device-backend/boot"
import type { RemovableSession } from "@/lib/device-backend/handlers/sessions"
import { oldestRemovable } from "@/lib/device-backend/handlers/sessions"
import type { PruneNotice, StorageUse } from "@/lib/device-backend/storage"
import {
  dismissPruneNotice,
  onSessionRefused,
  readPruneNotice,
  storageUse,
} from "@/lib/device-backend/storage"

export type DeviceStorageView = {
  use: StorageUse
  notice: PruneNotice | null
  /** Set by a refused save until room is made or the person declines. */
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
      notice: await readPruneNotice(context.db),
      full,
    }
  } catch {
    // Not shown this time; the next refresh tries again.
  }
  for (const listener of listeners) listener()
}

onSessionRefused(() => {
  void (async (): Promise<void> => {
    try {
      const { context } = await deviceBackend()
      full = { removable: await oldestRemovable(context.db, context.now()) }
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
  async dismiss(shown: PruneNotice): Promise<void> {
    try {
      const { context } = await deviceBackend()
      await dismissPruneNotice(context.db, shown)
    } catch {
      // Still shown; dismissing again tries again.
    }
    await read()
  },
}

export function megabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
