import type { JSX } from "react"
import type { Pane } from "@lesson-crm/lib/panes"
import { PANE_LABELS } from "@lesson-crm/lib/panes"
import { cn } from "some-ui-utils"

type StepRailProps = {
  steps: Array<Pane>
  current: Pane
  onStep: (pane: Pane) => void
}

/**
 * The wide-screen editor's step rail, in the session composer's shape
 * (`apps/www` `components/composer/session-composer.tsx`): numbered dots
 * joined by rules, the current one filled. Every step is reachable - none
 * depends on another being done, and Save (in Check) waits on the lesson
 * itself, not on the path taken to it.
 */
export const StepRail = ({
  steps,
  current,
  onStep,
}: StepRailProps): JSX.Element => {
  const at = steps.indexOf(current)
  return (
    <nav aria-label="Lesson steps" className="flex shrink-0 items-center">
      {steps.map((pane, index) => (
        <div
          key={pane}
          className="flex min-w-0 flex-1 items-center gap-2 last:flex-none"
        >
          <button
            type="button"
            onClick={() => onStep(pane)}
            aria-current={pane === current ? "step" : undefined}
            aria-label={`Step ${index + 1}: ${PANE_LABELS[pane]}`}
            className="flex shrink-0 items-center gap-2 rounded-full p-2"
          >
            <span
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-medium transition-colors",
                pane === current
                  ? "bg-primary text-primary-foreground"
                  : index < at
                    ? "bg-primary/20 text-primary"
                    : "bg-muted text-muted-foreground hover:bg-primary/30"
              )}
            >
              {index + 1}
            </span>
            <span
              className={cn(
                "hidden text-sm lg:inline",
                pane === current ? "font-medium" : "text-muted-foreground"
              )}
            >
              {PANE_LABELS[pane]}
            </span>
          </button>
          {index < steps.length - 1 && (
            <div className="bg-border mx-2 h-px min-w-0 flex-1" />
          )}
        </div>
      ))}
    </nav>
  )
}
