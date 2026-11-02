/**
 * The phone's storage, said plainly (`lib/device-backend/storage`). Device
 * build only, like this module (`build.paths.ts`): render each behind an
 * inline `import.meta.env.VITE_DEVICE_BACKEND === "true"`.
 *
 * When a save is refused, the offer to remove the oldest finished session
 * is the study list's let-go asked in its own words (`useSessionLetGo`,
 * LA8): on a paired phone "Remove it" copies the session home and lets it
 * go only once home holds it as it is, and otherwise it stays, said in the
 * offer (PF1, `__tests__/device-storage.test.tsx`). On a phone known to be
 * unpaired it is deleted, after an offer that says it can't be brought back.
 */
import type { JSX } from "react"
import { useEffect, useSyncExternalStore } from "react"
import { formatSize } from "@some-ui/core-utils"
import type { Intent } from "@some-ui/intent-kit"
import { matchIntent } from "@some-ui/intent-kit"
import { Alert, AlertDescription, AlertTitle, Button } from "@some-ui/shared"
import { HardDrive } from "lucide-react"

import type { RemovableSession } from "@/lib/device-backend/handlers/sessions"
import type { DeviceStorageView } from "@/lib/device-backend/storage-view"
import { deviceStorage } from "@/lib/device-backend/storage-view"
import type { LetGoEnd, LetGoRun } from "@/lib/home-link/study-let-go"
import { leftPhone } from "@/lib/home-link/study-let-go"
import { LET_GO } from "@/lib/home-link/words"
import { useIntentEffect } from "@/lib/intent"
import { IntentButton } from "@/lib/intent/render"
import { useSessionLetGo } from "@/components/sessions/device-let-go"

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

/**
 * Whether the offer is done once a let-go ended so: the session left this
 * phone, or was no longer on it, so there is nothing left to offer.
 */
const closes = (end: LetGoEnd): boolean =>
  leftPhone(end) || end.kind === "missing"

/**
 * Why the offered session is still here, once a let-go ended with it
 * staying, naming the host the offer asked about. A failure is said by the
 * button's own, with its retry.
 */
function stayedLine(state: Intent<LetGoRun>): string | null {
  return matchIntent(state, {
    idle: () => null,
    working: () => null,
    succeeded: ({ end, host }) =>
      closes(end) ? null : LET_GO.ended(end, host),
    failed: () => null,
  })
}

/**
 * One offer per refusal: keyed by the session it names. It closes once the
 * session is off this phone; while it stays, the offer says why and asks
 * again. "Try again" after a failure re-runs the same promise.
 */
const RemoveOffer = ({
  session,
}: {
  session: RemovableSession
}): JSX.Element => {
  const letGo = useSessionLetGo()
  const { host, promise } = letGo
  useIntentEffect(letGo, ({ end }) => {
    if (closes(end)) void deviceStorage.settle()
  })
  const stayed = stayedLine(letGo.state)
  return (
    <>
      <p>
        {LET_GO.room.question(
          session.name,
          finishedOn(session.finishedAt),
          promise,
          host
        )}
      </p>
      {/* Inside the prompt's own alert, which announces it. */}
      {stayed === null ? null : (
        <p className="text-destructive break-words">{stayed}</p>
      )}
      <div className="flex gap-2">
        <IntentButton
          state={letGo.state}
          // What this offer says is what runs: the promise and the host it
          // rendered with.
          onPress={() => letGo.start(session.id, promise, host)}
          size="sm"
          variant="destructive"
          idleLabel={LET_GO.room.confirm}
          workingLabel={LET_GO.room.working}
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
