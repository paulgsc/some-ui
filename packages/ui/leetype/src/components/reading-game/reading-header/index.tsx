import type { FC } from "react"
import { cn } from "some-ui-utils"

type ReadingHeaderProps = {
  /** 1-based position of the step in flight. */
  position: number
  total: number
  className?: string
}

/**
 * The top bar (LTY-MOBILE): a label, a count, and a hairline of progress.
 *
 * Deliberately not `ExerciseHeader`. That one reports elapsed time, WPM and
 * accuracy — three figures the reading surface does not produce and must not
 * appear to: a WPM readout on a screen nobody types into would be a claim
 * about a channel that is switched off. What is left once those go is a
 * count, which is small enough that a second component is cheaper than
 * teaching the first one a mode.
 *
 * No XP, no streak, no coins — the same line `docs/leetype/README.md` has
 * held since M20 retired them, and a new surface is exactly where they get
 * proposed again.
 */
export const ReadingHeader: FC<ReadingHeaderProps> = ({
  position,
  total,
  className,
}) => {
  const fraction = total > 0 ? Math.min(position / total, 1) : 0

  return (
    <div className={cn("shrink-0", className)}>
      <div className="flex items-baseline justify-between gap-3 px-1 pb-2">
        <span className="text-sm font-medium text-foreground">Practice</span>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {position} / {total}
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={position}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-label="Exercise progress"
        className="h-px w-full bg-border"
      >
        <div
          className="h-full bg-primary transition-[width] duration-300"
          style={{ width: `${fraction * 100}%` }}
        />
      </div>
    </div>
  )
}
