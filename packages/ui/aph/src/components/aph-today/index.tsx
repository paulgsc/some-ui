/**
 * What aph puts on Home: one card that says what is due now (or when the
 * next checkpoint opens) and what waits on my call, plus today's entries
 * for the day's timeline. The links are the host's: Home passes its own, so
 * this package never knows the app's routes.
 */
import type { JSX, ReactNode } from "react"
import { useState } from "react"
import {
  CheckpointMark,
  Figures,
  StatusIcon,
  whenOf,
} from "@aph/components/status"
import {
  dayOf,
  dueCheckpoint,
  formatValue,
  isMissed,
  minutesOf,
  needsAttention,
  nextCheckpoint,
  primary,
  reconcile,
} from "@aph/lib/model"
import type { AphStore } from "@aph/lib/store"
import { aphStore } from "@aph/lib/store"
import { useAph } from "@aph/lib/use-aph"
import { Flag, TrendingUp, TriangleAlert } from "lucide-react"
import { cn } from "some-ui-utils"

type AphTodayCardProps = {
  /** The host's link to the logger, given the button's label. */
  renderLog: (label: string) => ReactNode
  /** The host's link to History, wrapped around the "waits on you" line. */
  renderReview: (children: ReactNode) => ReactNode
  now?: Date
  store?: AphStore
}

export const AphTodayCard = ({
  renderLog,
  renderReview,
  now: givenNow,
  store = aphStore,
}: AphTodayCardProps): JSX.Element => {
  const { settings, entries } = useAph(store)
  // The host's clock when it passes one (Home re-renders as time moves);
  // otherwise the moment this mounted.
  const [mounted] = useState(() => new Date())
  const now = givenNow ?? mounted
  const today = dayOf(now)
  const minutes = minutesOf(now)
  const due = dueCheckpoint(settings, entries, today, minutes)
  const missed = due !== null && isMissed(due, minutes)
  const next = nextCheckpoint(settings, minutes)
  const { review, flagged } = needsAttention(settings, entries)
  const morning = settings.checkpoints[0]
  const earlier =
    due === null || morning === undefined || morning.id === due.id
      ? undefined
      : primary(entries, today, morning.id)

  return (
    <div
      className={cn(
        "bg-card flex flex-col gap-2 rounded-xl border p-3",
        due !== null &&
          (missed ? "border-warning/60 border-2" : "border-foreground border-2")
      )}
    >
      <div className="flex items-center gap-3">
        <span className="bg-muted flex size-10 shrink-0 items-center justify-center rounded-lg">
          <TrendingUp aria-hidden className="size-5" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="font-semibold">
            {due === null ? "aph" : `aph · ${due.label}`}
            {missed && (
              <span className="text-warning ml-1.5 text-sm font-medium">
                missed
              </span>
            )}
          </span>
          <span className="text-muted-foreground truncate text-sm">
            {due !== null
              ? `goal ${formatValue(due.goal, true)}${
                  earlier?.mine != null && morning !== undefined
                    ? ` · ${morning.label} was ${formatValue(earlier.mine.value, earlier.mine.approx)}`
                    : ""
                }`
              : next !== null
                ? `next at ${next.label}`
                : "all logged today"}
          </span>
        </span>
        {renderLog(due === null ? "Log" : missed ? "Log late" : "Log mine")}
      </div>
      {review + flagged > 0 &&
        renderReview(
          <span className="flex items-center gap-3 text-sm">
            {review > 0 && (
              <span className="text-warning flex items-center gap-1.5">
                <TriangleAlert aria-hidden className="size-4" />
                {review} {review === 1 ? "waits" : "wait"} on your call
              </span>
            )}
            {flagged > 0 && (
              <span className="text-destructive flex items-center gap-1.5">
                <Flag aria-hidden className="size-4" />
                {flagged} flagged
              </span>
            )}
          </span>
        )}
    </div>
  )
}

type AphTodayEntriesProps = {
  /** Shown in place of the rows when today has none. */
  empty?: ReactNode
  now?: Date
  store?: AphStore
}

/** Today's aph entries, as list items for Home's timeline. */
export const AphTodayEntries = ({
  empty = null,
  now: givenNow,
  store = aphStore,
}: AphTodayEntriesProps): JSX.Element => {
  const { settings, entries } = useAph(store)
  // The host's clock when it passes one (Home re-renders as time moves);
  // otherwise the moment this mounted.
  const [mounted] = useState(() => new Date())
  const now = givenNow ?? mounted
  const today = dayOf(now)
  const todays = entries.filter((e) => e.day === today)
  if (todays.length === 0) return <>{empty}</>
  return (
    <>
      {todays.map((e) => (
        <li key={e.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
          <CheckpointMark settings={settings} checkpoint={e.checkpoint} />
          <span className="min-w-0 flex-1">aph {whenOf(settings, e)}</span>
          <Figures entry={e} />
          <StatusIcon status={reconcile(settings, e).status} />
        </li>
      ))}
    </>
  )
}
