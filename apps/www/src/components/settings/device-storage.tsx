/**
 * The phone's storage, said plainly (`lib/device-backend/storage`). Device
 * build only, like this module (`build.paths.ts`): render each behind an
 * inline `import.meta.env.VITE_DEVICE_BACKEND === "true"`.
 */
import type { JSX } from "react"
import { useEffect, useSyncExternalStore } from "react"
import { formatSize } from "@some-ui/core-utils"
import { Alert, AlertDescription, AlertTitle, Button } from "@some-ui/shared"
import { HardDrive } from "lucide-react"

import type { RemovableSession } from "@/lib/device-backend/handlers/sessions"
import type { DeviceStorageView } from "@/lib/device-backend/storage-view"
import { deviceStorage } from "@/lib/device-backend/storage-view"
import { useIntent, useIntentEffect } from "@/lib/intent"
import { IntentButton } from "@/lib/intent/render"
import { useDeleteSession } from "@/lib/tenant"

function useDeviceStorage(): DeviceStorageView | null {
  const view = useSyncExternalStore(
    deviceStorage.subscribe,
    deviceStorage.getSnapshot
  )
  useEffect(() => {
    void deviceStorage.refresh()
  }, [])
  return view
}

export const DeviceStorageSummary = (): JSX.Element | null => {
  const view = useDeviceStorage()
  if (view === null) return null
  const { databaseBytes, webViewBytes, quotaBytes } = view.use
  return (
    <div className="space-y-1">
      <p className="text-sm">
        Using {formatSize(databaseBytes + webViewBytes)} of{" "}
        {formatSize(quotaBytes)}
      </p>
      <p className="text-muted-foreground text-xs">
        Clear finished sessions home holds to free up space.
      </p>
    </div>
  )
}

const finishedOn = (stamp: string): string =>
  new Date(stamp).toLocaleDateString()

/** One offer per refusal: keyed by the session it names. */
const RemoveOffer = ({
  session,
}: {
  session: RemovableSession
}): JSX.Element => {
  const remove = useIntent(useDeleteSession(), { presentation: "interactive" })
  useIntentEffect(remove, () => void deviceStorage.settle())
  return (
    <>
      <p>
        Remove “{session.name}” (finished {finishedOn(session.finishedAt)}) to
        make room? It&apos;s gone unless home holds it.
      </p>
      <div className="flex gap-2">
        <IntentButton
          state={remove.state}
          onPress={() => remove.start(session.id)}
          size="sm"
          variant="destructive"
          idleLabel="Remove it"
          workingLabel="Removing..."
        />
        <Button
          size="sm"
          variant="outline"
          onClick={() => void deviceStorage.settle()}
        >
          Not now
        </Button>
      </div>
    </>
  )
}

export const DeviceStoragePrompt = (): JSX.Element | null => {
  const view = useDeviceStorage()
  if (view === null) return null
  const { full, notice } = view
  if (full === null && notice === null) return null
  return (
    <div className="space-y-2 px-4 pt-3">
      {full === null ? null : (
        <Alert>
          <HardDrive className="size-4" />
          <AlertTitle>Phone full. Not saved.</AlertTitle>
          <AlertDescription className="space-y-2">
            {full.removable === null ? (
              <>
                <p>Delete a session you don&apos;t need, then try again.</p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void deviceStorage.settle()}
                >
                  OK
                </Button>
              </>
            ) : (
              <RemoveOffer key={full.removable.id} session={full.removable} />
            )}
          </AlertDescription>
        </Alert>
      )}
      {notice === null ? null : (
        <Alert>
          <HardDrive className="size-4" />
          <AlertDescription className="flex items-center gap-2">
            <span className="min-w-0 flex-1">
              Removed {notice.rounds} Leetype round
              {notice.rounds === 1 ? "" : "s"} this version of the app no longer
              ships.
            </span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void deviceStorage.dismiss(notice)}
            >
              Got it
            </Button>
          </AlertDescription>
        </Alert>
      )}
    </div>
  )
}
