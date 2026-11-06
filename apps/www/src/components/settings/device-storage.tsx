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
import type { JSX, ReactNode } from "react"
import { useEffect, useSyncExternalStore } from "react"
import { formatSize } from "@some-ui/core-utils"
import type { Intent } from "@some-ui/intent-kit"
import { matchIntent } from "@some-ui/intent-kit"
import { Alert, AlertDescription, AlertTitle, Button } from "@some-ui/shared"
import { HardDrive } from "lucide-react"

import type { RemovableSession } from "@/lib/device-backend/handlers/sessions"
import type { PruneNotice } from "@/lib/device-backend/storage"
import type { DeviceStorageView } from "@/lib/device-backend/storage-view"
import { deviceStorage } from "@/lib/device-backend/storage-view"
import type { LetGoEnd, LetGoRun } from "@/lib/home-link/study-let-go"
import { leftPhone } from "@/lib/home-link/study-let-go"
import { LET_GO } from "@/lib/home-link/words"
import { useIntentEffect } from "@/lib/intent"
import { IntentButton } from "@/lib/intent/render"
import { screenRefreshers } from "@/lib/pull-refresh/refreshers"
import { PULL_WORDS } from "@/lib/pull-refresh/words"
import type { SessionLetGo } from "@/components/sessions/device-let-go"
import { useSessionLetGo } from "@/components/sessions/device-let-go"

/**
 * What a pull reads again (PULL4): on Settings' This phone, and on every
 * screen through the phone-full offer the shell mounts, so a pull anywhere
 * can bring up a notice of what was let go.
 */
const ROOM = { what: PULL_WORDS.room, checkAgain: deviceStorage.check }

function useDeviceStorage(): DeviceStorageView | null {
  const view = useSyncExternalStore(
    deviceStorage.subscribe,
    deviceStorage.getSnapshot
  )
  useEffect(() => {
    void deviceStorage.refresh()
    return screenRefreshers.register(ROOM)
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
 * again. "Try again" after a failure re-runs the same promise. Drawn from
 * `letGo`, so the phone page can draw it on a fake
 * (`tests/ui-fit/phone-page/www.tsx`).
 */
export const RemoveOffer = ({
  session,
  letGo,
  onSettle,
}: {
  session: RemovableSession
  letGo: Pick<SessionLetGo, "host" | "promise" | "state" | "start">
  onSettle: () => void
}): JSX.Element => {
  const { host, promise } = letGo
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
      {/* A failure takes its own line at the row's end, and why it stayed
          comes after the row: below every control, in a prompt that grows
          down, so neither moves one (HS1). */}
      <div className="flex flex-wrap gap-2">
        <IntentButton
          state={letGo.state}
          // What this offer says is what runs: the promise and the host it
          // rendered with.
          onPress={() => letGo.start(session.id, promise, host)}
          size="sm"
          variant="destructive"
          idleLabel={LET_GO.room.confirm}
          workingLabel={LET_GO.room.working}
          failureOwnLine
        />
        <Button size="sm" variant="outline" onClick={onSettle}>
          Not now
        </Button>
      </div>
      {/* Inside the prompt's own alert, which announces it. */}
      {stayed === null ? null : (
        <p className="text-destructive break-words">{stayed}</p>
      )}
    </>
  )
}

/** The offer on this phone's own let-go, which settles the prompt once it closes. */
const LiveRemoveOffer = ({
  session,
}: {
  session: RemovableSession
}): JSX.Element => {
  const letGo = useSessionLetGo()
  useIntentEffect(letGo, ({ end }) => {
    if (closes(end)) void deviceStorage.settle()
  })
  return (
    <RemoveOffer
      session={session}
      letGo={letGo}
      onSettle={() => void deviceStorage.settle()}
    />
  )
}

/**
 * The prompt as drawn from `view`: what was refused, the offer that makes
 * room (`renderOffer`), and a notice of what was let go.
 */
export const StoragePrompt = ({
  view,
  renderOffer,
  onSettle,
  onDismiss,
}: {
  view: DeviceStorageView | null
  renderOffer: (session: RemovableSession) => ReactNode
  onSettle: () => void
  onDismiss: (notice: PruneNotice) => void
}): JSX.Element | null => {
  if (view === null) return null
  const { full, notice } = view
  if (full === null && notice === null) return null
  // Over the page, not in its flow: below the header, above the bar along
  // the bottom, so bringing it up or dismissing it moves nothing on the
  // screen under it (HS1).
  return (
    <div
      data-scroll-intent="long-form"
      className={
        // scroll-intent: long-form — held sideways, the offer can outgrow
        // the room between the header and the bar, so the prompt scrolls.
        "pointer-events-none fixed inset-x-0 top-14 z-40 max-h-[calc(100dvh-8.75rem)] space-y-2 overflow-y-auto px-4 pt-3 *:pointer-events-auto *:shadow-lg"
      }
    >
      {full === null ? null : (
        <Alert>
          <HardDrive className="size-4" />
          <AlertTitle>Phone full. Not saved.</AlertTitle>
          <AlertDescription className="space-y-2">
            {full.removable === null ? (
              <>
                <p>Delete a session you don&apos;t need, then try again.</p>
                <Button size="sm" variant="outline" onClick={onSettle}>
                  OK
                </Button>
              </>
            ) : (
              renderOffer(full.removable)
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
            <Button size="sm" variant="ghost" onClick={() => onDismiss(notice)}>
              Got it
            </Button>
          </AlertDescription>
        </Alert>
      )}
    </div>
  )
}

export const DeviceStoragePrompt = (): JSX.Element | null => (
  <StoragePrompt
    view={useDeviceStorage()}
    renderOffer={(session) => (
      <LiveRemoveOffer key={session.id} session={session} />
    )}
    onSettle={() => void deviceStorage.settle()}
    onDismiss={(notice) => void deviceStorage.dismiss(notice)}
  />
)
