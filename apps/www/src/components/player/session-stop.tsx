import type { JSX } from "react"
import { useId, useState } from "react"
import { cn } from "@some-ui/core-utils"
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
import type { Reason, Stop } from "@/lib/session-stop"
import {
  msSinceStop,
  PICK_UP_MS,
  REASONS,
  updateStop,
} from "@/lib/session-stop"
import { formatRemaining } from "@/lib/wind-down"

const ICONS: Record<Reason, LucideIcon> = {
  break: Clock,
  person: User,
  call: Phone,
  move: MapPin,
  focus: BatteryLow,
  other: Ellipsis,
}

/**
 * "What came up?": optional, one tap, a second tap clears it. Never gates
 * anything, so a person in a hurry can ignore it and the stop is still kept.
 */
export const StopReasons = ({
  stop,
  from,
}: {
  stop: Stop
  from: NonNullable<Stop["reasonFrom"]>
}): JSX.Element => {
  const headingId = useId()
  const [picked, setPicked] = useState<Reason | null | undefined>(undefined)
  const reason = picked === undefined ? stop.reason : picked

  const pick = (id: Reason): void => {
    const next = reason === id ? null : id
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
        {REASONS.map(([id, label]) => {
          const Icon = ICONS[id]
          return (
            <Button
              key={id}
              type="button"
              variant={reason === id ? "default" : "outline"}
              aria-pressed={reason === id}
              className="h-12 justify-start gap-2"
              onClick={() => pick(id)}
            >
              <Icon aria-hidden className="size-4 shrink-0" />
              <span className="min-w-0 truncate">{label}</span>
            </Button>
          )
        })}
      </div>
    </section>
  )
}

const minutesOf = (ms: number): number => Math.floor(ms / 60_000)

/**
 * A stopped session, over the activity (which stays mounted underneath, so a
 * pick-up finds it as it was). Just after "Got to go" it confirms the stop
 * is kept and lets the person go; on coming back it offers the pick-up while
 * the window is open, or calling it done.
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
  const away = msSinceStop(stop, new Date())
  const reasons = (
    <StopReasons
      key={stop.stoppedAt}
      stop={stop}
      from={returning ? "return" : "stop"}
    />
  )

  return (
    <div
      data-scroll-intent="short-landscape"
      className={cn(
        // scroll-intent: short-landscape — fits a portrait phone whole; a
        // phone held sideways (390px tall) scrolls rather than clipping Go.
        "bg-background flex flex-col gap-5 overflow-y-auto p-6",
        className
      )}
    >
      <header className="space-y-1">
        {returning ? (
          <p className="text-muted-foreground text-sm font-medium">
            {Math.max(1, minutesOf(away))} min ago
          </p>
        ) : (
          <p className="text-success flex items-center gap-1.5 text-sm font-semibold">
            <Check aria-hidden className="size-4" strokeWidth={3} />
            Saved
          </p>
        )}
        <h2 className="text-2xl font-bold tracking-tight">
          {returning ? "You stopped at" : "Stopped at"}{" "}
          {formatRemaining(stop.elapsedMs)}.
        </h2>
        {!returning && (
          <p className="text-muted-foreground">
            Go. You can pick this up in the next {minutesOf(PICK_UP_MS)}{" "}
            minutes.
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
                {formatRemaining(stop.plannedMs - stop.elapsedMs)} left
              </span>
            </span>
          </Button>
          <Button variant="outline" className="h-12" onClick={onDone}>
            Call it done ({minutesOf(stop.elapsedMs)} min)
          </Button>
          <p className="text-muted-foreground -mt-2 text-center text-xs">
            Pick up stays open {Math.max(0, minutesOf(PICK_UP_MS - away))} more
            min.
          </p>
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
