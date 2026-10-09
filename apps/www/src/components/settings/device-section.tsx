/**
 * The Android app's stand-in for the account section: what is on this phone,
 * and a sync from home for TOPIK lessons (and newer Leetype rounds). No
 * account controls: the device is always signed in, locked by the phone. The
 * home address is a per-phone convenience in `localStorage`.
 */

import type { JSX } from "react"
import { useState } from "react"
import { Input, Label } from "@some-ui/shared"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { deviceBackend } from "@/lib/device-backend/boot"
import type { SyncReport } from "@/lib/device-backend/home-sync"
import {
  homeApiBase,
  HomeUnreachableError,
  syncFromHome,
} from "@/lib/device-backend/home-sync"
import { nativeHomeGet } from "@/lib/device-backend/native-http"
import { DeviceStorageError } from "@/lib/device-backend/sql"
import { deviceStorage } from "@/lib/device-backend/storage-view"
import { useAsyncIntent } from "@/lib/intent"
import { IntentButton } from "@/lib/intent/render"
import { DeviceStorageSummary } from "@/components/settings/device-storage"

const HOME_KEY = "some-ui.device.home-server.v1"
const LAST_SYNC_KEY = "some-ui.device.last-sync.v1"

function remembered(key: string): string {
  try {
    return window.localStorage.getItem(key) ?? ""
  } catch {
    return ""
  }
}

function remember(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Not remembered; the sync itself still happened.
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

export const DeviceSection = (): JSX.Element => {
  const queryClient = useQueryClient()
  const [home, setHome] = useState(() => remembered(HOME_KEY))
  const [lastSync, setLastSync] = useState(() => remembered(LAST_SYNC_KEY))

  const syncIntent = useAsyncIntent(
    async (address: string): Promise<void> => {
      try {
        const { context } = await deviceBackend()
        const report = await syncFromHome(context.db, address, nativeHomeGet)
        void deviceStorage.refresh()
        remember(HOME_KEY, address)
        const summary = `${new Date().toLocaleString()} - ${describe(report)}`
        remember(LAST_SYNC_KEY, summary)
        setLastSync(summary)
        // What the catalogue and rounds queries hold is now stale.
        await queryClient.invalidateQueries()
        toast.success(describe(report))
      } catch (error) {
        // The phone's own storage says so in its words (reported, with the
        // plugin's, to the native log); anything else names the error.
        toast.error(
          error instanceof HomeUnreachableError
            ? `Couldn't reach ${error.base}. Are you on the home network?`
            : error instanceof DeviceStorageError
              ? `Sync failed: ${error.error.summary}`
              : `Sync failed: ${String(error)}`
        )
      }
    },
    { presentation: "interactive" }
  )

  const address = home.trim()

  return (
    <section className="space-y-4" aria-labelledby="device-heading">
      <div className="space-y-1">
        <Label id="device-heading">This phone</Label>
        <p className="text-muted-foreground text-sm">
          Everything you do here is saved on this phone and works with no
          network. TOPIK lessons come from your home server: sync while
          you&apos;re on the home network, and they stay here for later.
        </p>
      </div>

      <DeviceStorageSummary />

      <div className="space-y-2">
        <Label htmlFor="home-server">Home server</Label>
        <Input
          id="home-server"
          inputMode="url"
          autoCapitalize="off"
          autoCorrect="off"
          placeholder="192.168.1.10:3000"
          value={home}
          onChange={(event) => setHome(event.target.value)}
        />
        {address === "" ? null : (
          <p className="text-muted-foreground text-xs">
            Reads {homeApiBase(address)}
          </p>
        )}
      </div>

      <IntentButton
        state={syncIntent.state}
        onPress={() => syncIntent.start(address)}
        disabled={address === ""}
        variant="outline"
        size="sm"
        idleLabel="Sync lessons from home"
        workingLabel="Syncing..."
      />
      {lastSync === "" ? null : (
        <p className="text-muted-foreground text-xs">Last sync: {lastSync}</p>
      )}
    </section>
  )
}
