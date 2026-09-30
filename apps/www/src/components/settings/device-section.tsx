/**
 * The Android app's stand-in for the account section: what is on this
 * phone, and a sync from the home server that puts TOPIK lessons (and any
 * newer Leetype rounds) on it for later.
 *
 * There is nothing to sign out of on the device - `/auth/session` is always
 * signed in there, with the phone's own lock as the lock - so the account
 * controls are not shown rather than shown and inert.
 *
 * The home address is remembered in `localStorage`: a per-phone convenience,
 * and if it is lost the person types it again. What was synced is in the
 * database, not here.
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
import { useAsyncIntent } from "@/lib/intent"
import { IntentButton } from "@/lib/intent/render"

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
  const { lessons, rounds, failed } = report
  const parts = [
    `${lessons.listed} TOPIK lesson${lessons.listed === 1 ? "" : "s"} (${lessons.added} new, ${lessons.updated} updated)`,
    `${rounds.added + rounds.updated} Leetype round${rounds.added + rounds.updated === 1 ? "" : "s"} refreshed`,
  ]
  if (lessons.retired > 0) parts.push(`${lessons.retired} retired`)
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
        remember(HOME_KEY, address)
        const summary = `${new Date().toLocaleString()} - ${describe(report)}`
        remember(LAST_SYNC_KEY, summary)
        setLastSync(summary)
        // What the catalogue and rounds queries hold is now stale.
        await queryClient.invalidateQueries()
        toast.success(describe(report))
      } catch (error) {
        toast.error(
          error instanceof HomeUnreachableError
            ? `Couldn't reach ${error.base}. Are you on the home network?`
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
