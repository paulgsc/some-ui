/**
 * The phone's storage, said plainly (`lib/device-backend/storage`). Device
 * build only, like this module (`build.paths.ts`): render each behind an
 * inline `import.meta.env.VITE_DEVICE_BACKEND === "true"`.
 */
import type { JSX } from "react"
import { useEffect, useSyncExternalStore } from "react"
import { Alert, AlertDescription, AlertTitle, Button } from "@some-ui/shared"
import { HardDrive } from "lucide-react"

import type { RemovableSession } from "@/lib/device-backend/handlers/sessions"
import type { DeviceStorageView } from "@/lib/device-backend/storage-view"
import { deviceStorage, megabytes } from "@/lib/device-backend/storage-view"
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

/** For Settings → This phone: the use, against the budget, and the rule. */
export const DeviceStorageSummary = (): JSX.Element | null => {
  const view = useDeviceStorage()
  if (view === null) return null
  const { databaseBytes, webViewBytes, reservedBytes, quotaBytes } = view.use
  return (
    <div className="space-y-1">
      <p className="text-sm">
        Using about {megabytes(databaseBytes + webViewBytes)} of{" "}
        {megabytes(quotaBytes)}, with {megabytes(reservedBytes)} kept free for
        soundbites
      </p>
      <p className="text-muted-foreground text-xs">
        Android backs this app up only while it stays under{" "}
        {megabytes(quotaBytes)}. When it&apos;s full, a new save waits until you
        choose something to remove. Sessions aren&apos;t synced anywhere yet, so
        a removed one is gone.
      </p>
    </div>
  )
}

const finishedOn = (stamp: string): string =>
  new Date(stamp).toLocaleDateString()

/**
 * One offer per refusal: keyed by the session it names, so each gets a fresh
 * intent (a delete's success value is always `undefined`, which
 * `useIntentEffect` would otherwise see only once).
 */
const RemoveOffer = ({
  session,
}: {
  session: RemovableSession
}): JSX.Element => {
  const remove = useIntent(useDeleteSession(), { presentation: "interactive" })
  useIntentEffect(remove.state, () => void deviceStorage.settle())
  return (
    <>
      <p>
        Remove your oldest finished session, “{session.name}” (finished{" "}
        {finishedOn(session.finishedAt)}), then try again? Sessions aren&apos;t
        synced anywhere yet, so it will be gone.
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

/**
 * For every page: after a refused save, which session could go and a yes or
 * no; and removals the person did not ask for, until they have seen them.
 */
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
          <AlertTitle>This phone is full, so that wasn&apos;t saved</AlertTitle>
          <AlertDescription className="space-y-2">
            {full.removable === null ? (
              <>
                <p>
                  Everything on it is from today or unfinished. Delete a session
                  you no longer need, then try again.
                </p>
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
