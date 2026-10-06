import type { JSX } from "react"
import { cn } from "@some-ui/core-utils"
import { Button } from "@some-ui/shared"

import { formatTimecode } from "@/lib/format"
import {
  useIsPaused,
  useIsRunning,
  useOrchestratorClock,
  useOrchestratorStore,
} from "@/lib/orchestrator"
import { EXTEND_MS, isWindingDown, leadMs } from "@/lib/wind-down"

const RING = 2 * Math.PI * 9

/** The session's last minutes: a pill beside the activity, never over it. */
export const WindDownNudge = ({
  className,
}: {
  className?: string
}): JSX.Element | null => {
  const { time_remaining: remaining, total_duration: total } =
    useOrchestratorClock()
  const isRunning = useIsRunning()
  const isPaused = useIsPaused()
  const extend = useOrchestratorStore((s) => s.extend)
  const stop = useOrchestratorStore((s) => s.stop)
  if (!(isRunning || isPaused) || !isWindingDown(remaining, total)) return null

  return (
    <div
      className={cn(
        "border-warning/40 bg-warning/10 text-warning animate-in fade-in slide-in-from-top-2 flex h-11 items-center gap-2 rounded-full border pl-3 pr-1",
        className
      )}
    >
      <svg viewBox="0 0 22 22" aria-hidden className="size-5 -rotate-90">
        <circle
          cx="11"
          cy="11"
          r="9"
          fill="none"
          strokeWidth="3"
          className="stroke-warning/25"
        />
        <circle
          cx="11"
          cy="11"
          r="9"
          fill="none"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={RING}
          strokeDashoffset={RING * (1 - remaining / leadMs(total))}
          className="stroke-warning"
        />
      </svg>
      <span className="min-w-0 flex-1 text-sm font-semibold tabular-nums">
        {formatTimecode(Math.ceil(remaining / 1000) * 1000)} left
      </span>
      <Button
        size="sm"
        variant="ghost"
        className="text-warning hover:text-warning h-9 rounded-full"
        onClick={() => void stop()}
      >
        Wrap up
      </Button>
      <Button
        size="sm"
        className="bg-warning text-warning-foreground hover:bg-warning/90 h-9 rounded-full"
        onClick={() => void extend(EXTEND_MS)}
      >
        +5 min
      </Button>
    </div>
  )
}
