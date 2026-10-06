import type { JSX } from "react"
import { useEffect, useId, useRef, useState } from "react"
import { cn, formatRelativeTime } from "@some-ui/core-utils"
import { Button } from "@some-ui/shared"
import { Link } from "@tanstack/react-router"
import type { LucideIcon } from "lucide-react"
import {
  BatteryLow,
  Check,
  Clock,
  Ellipsis,
  MapPin,
  Phone,
  Play,
  User,
} from "lucide-react"

import { hasAudience } from "@/lib/build-profile"
import { useMinuteClock } from "@/lib/clock"
import { formatDurationMs, formatTimecode } from "@/lib/format"
import type { Reason, Stop } from "@/lib/session-stop"
import {
  msSinceStop,
  PICK_UP_MS,
  REASONS,
  updateStop,
} from "@/lib/session-stop"

import { ToggleChips } from "./toggle-chips"

const ICONS: Record<Reason, LucideIcon> = {
  break: Clock,
  person: User,
  call: Phone,
  move: MapPin,
  focus: BatteryLow,
  other: Ellipsis,
}

/** "What came up?", written straight to the stop's record. */
export const StopReasons = ({
  stop,
  from,
}: {
  stop: Stop
  from: NonNullable<Stop["reasonFrom"]>
}): JSX.Element => {
  const headingId = useId()
  const [picked, setPicked] = useState<Reason | null | undefined>(undefined)

  const pick = (next: Reason | null): void => {
    updateStop(stop, { reason: next, reasonFrom: next ? from : null })
    setPicked(next)
  }

  return (
    <section aria-labelledby={headingId} className="space-y-2">
      <h3
        id={headingId}
        className="text-muted-foreground text-xs font-semibold uppercase tracking-wide"
      >
        What came up? <span className="font-normal normal-case">Optional</span>
      </h3>
      <div className="grid grid-cols-2 gap-2">
        <ToggleChips
          options={REASONS}
          value={picked === undefined ? stop.reason : picked}
          onChange={pick}
          icons={ICONS}
        />
      </div>
    </section>
  )
}

/**
 * A stopped session, as a dialog over the paused activity. Just after "Got
 * to go" it confirms the stop is kept and lets the person go; on coming back
 * it offers the pick-up, or calling it done.
 */
export const StopScreen = ({
  stop,
  returning,
  onPickUp,
  onDone,
  className,
}: {
  stop: Stop
  returning: boolean
  onPickUp: () => void
  onDone: () => void
  className?: string
}): JSX.Element => {
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  useEffect(() => dialogRef.current?.focus(), [])
  const windowLeft = PICK_UP_MS - msSinceStop(stop, useMinuteClock())
  const reasons = (
    <StopReasons
      key={stop.stoppedAt}
      stop={stop}
      from={returning ? "return" : "stop"}
    />
  )

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
      data-scroll-intent="short-landscape"
      className={cn(
        // scroll-intent: short-landscape — fits a portrait phone whole; a
        // phone held sideways (390px tall) scrolls rather than clipping Go.
        "bg-background flex flex-col gap-5 overflow-y-auto p-6 outline-none",
        className
      )}
    >
      <header className="space-y-1">
        {returning ? (
          <p className="text-muted-foreground text-sm font-medium">
            {formatRelativeTime(stop.stoppedAt)}
          </p>
        ) : (
          <p className="text-success flex items-center gap-1.5 text-sm font-semibold">
            <Check aria-hidden className="size-4" strokeWidth={3} />
            Saved
          </p>
        )}
        <h2 id={titleId} className="text-2xl font-bold tracking-tight">
          {returning ? "You stopped at" : "Stopped at"}{" "}
          {formatTimecode(stop.elapsedMs)}.
        </h2>
        {!returning && (
          <p className="text-muted-foreground">
            Go. You can pick this up in the next {formatDurationMs(PICK_UP_MS)}.
          </p>
        )}
      </header>
      {returning ? (
        <>
          <Button
            className="h-auto justify-start gap-3 py-3 text-left"
            onClick={onPickUp}
          >
            <Play aria-hidden className="size-5 shrink-0" />
            <span className="flex min-w-0 flex-col">
              <span className="font-semibold">Pick up where you left off</span>
              <span className="text-sm opacity-90">
                {formatTimecode(stop.plannedMs - stop.elapsedMs)} left · open{" "}
                {formatDurationMs(Math.max(0, windowLeft))} more
              </span>
            </span>
          </Button>
          <Button variant="outline" className="h-12" onClick={onDone}>
            Call it done ({formatDurationMs(stop.elapsedMs)})
          </Button>
          {reasons}
        </>
      ) : (
        <>
          {reasons}
          <div className="mt-auto flex flex-col gap-1">
            <Button asChild className="h-12">
              <Link to={hasAudience("apk") ? "/today" : "/sessions"}>Go</Link>
            </Button>
            <Button variant="ghost" className="h-11" onClick={onPickUp}>
              Oops, keep going
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
