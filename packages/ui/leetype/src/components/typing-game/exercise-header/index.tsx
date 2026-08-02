import type { FC } from "react"
import { cn } from "some-ui-utils"

type ExerciseHeaderProps = {
  title: string
  /** Seconds since the session began, across every step. */
  elapsedTime: number
  /** Cumulative WPM — the figure worth showing a person. */
  wpm: number
  accuracy: number
  className?: string
}

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const rest = Math.floor(seconds % 60)
  return `${minutes}:${rest.toString().padStart(2, "0")}`
}

/**
 * The exercise's title and the three numbers worth glancing at.
 *
 * Deliberately not the instantaneous figure, and deliberately not `k`. Those
 * two are the *controller's* inputs, they move several times a second, and
 * putting either on screen would give the player something to watch instead
 * of type — which is the one thing the loop is supposed to spare them. The
 * reveal loop should be felt, not announced.
 *
 * The clock is a stat, not a terminator. Nothing here can end a session.
 */
export const ExerciseHeader: FC<ExerciseHeaderProps> = ({
  title,
  elapsedTime,
  wpm,
  accuracy,
  className,
}) => (
  <div
    className={cn(
      "flex shrink-0 flex-wrap items-baseline justify-between gap-x-4 gap-y-1",
      className
    )}
  >
    <span className="text-base font-semibold text-card-foreground">
      {title}
    </span>
    <div className="flex items-baseline gap-4 font-mono text-xs tabular-nums text-muted-foreground">
      <span>
        <span className="text-card-foreground">{wpm}</span> wpm
      </span>
      <span>
        <span className="text-card-foreground">{accuracy.toFixed(0)}</span>%
      </span>
      <span>{formatTime(elapsedTime)}</span>
    </div>
  </div>
)
