import type { FC } from "react"
import { cn } from "some-ui-utils"

type StepRailProps = {
  total: number
  /** 0-based index of the step in flight. */
  current: number
  /** How many times the gate has held on the current step. */
  attempt: number
  className?: string
}

/**
 * Where you are in the exercise: `●●●●○○○○`.
 *
 * A row of dots, deliberately. It is glanceable without being read, and it
 * is not a second progress bar competing with the in-step one — those
 * measure different things (steps done vs. this step typed) and two bars
 * side by side invite the player to work out which is which.
 *
 * The repeat affordance lives here too, and it is the *only* place it lives.
 * The gate holding must never be a wall with a message on it: falling short
 * means the same step comes round again, and repetition is the intervention.
 * A dialog explaining that you were too slow would break the one rule the
 * loop has — the player's only conscious task is typing.
 */
export const StepRail: FC<StepRailProps> = ({
  total,
  current,
  attempt,
  className,
}) => (
  <div
    className={cn("flex shrink-0 items-center justify-center gap-3", className)}
    role="group"
    aria-label={`Step ${Math.min(current + 1, total)} of ${total}`}
  >
    <div className="flex items-center gap-1.5">
      {Array.from({ length: total }, (_, index) => (
        <span
          key={index}
          aria-hidden="true"
          className={cn(
            "h-1.5 w-1.5 rounded-full transition-colors",
            index < current && "bg-primary",
            index === current && "bg-primary ring-2 ring-primary/30",
            index > current && "bg-muted-foreground/30"
          )}
        />
      ))}
    </div>

    {attempt > 0 && (
      <span className="font-mono text-[0.65rem] uppercase tracking-wide text-muted-foreground">
        {`again ×${attempt}`}
      </span>
    )}
  </div>
)
