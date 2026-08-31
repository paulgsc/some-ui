import type { FC } from "react"
import type { Budget } from "@leetype/types/constraint"
import { cn } from "some-ui-utils"

/**
 * Axiom 3.1's own honesty requirement, said plainly rather than implied by
 * a number on its own: no constant factor, no cache behaviour, no
 * allocator, no language is modelled by an operation count. This is what
 * stops a learner reading a measured runtime against `B` as though the
 * comparison established something (the habit Cor. 4.1 forbids).
 */
const COARSENESS_STATEMENT =
  "A rule of thumb, not a promise about a machine: no constant factor, cache behaviour, allocator, or language is modelled."

const OPERATIONS_FORMAT = new Intl.NumberFormat("en-US")

type BudgetDisplayProps = {
  budget: Budget
  className?: string
}

/**
 * `B`, rendered (R2, #1205, Ax. 3.1): an operation-count bound, its
 * optional wall-clock annotation, and the coarseness statement — all three
 * always on the surface, never behind a toggle. Prop. 1.1's own posture
 * ("the reveal may never be conditioned") is about `SourcePanel`'s `A`, not
 * `B` — nothing here is closed by default, because Ax. 3.1's requirement is
 * that the caveat is said, not that it is *available if asked for*: "not
 * in a tooltip a learner may never open" is this story's own acceptance
 * criterion, word for word.
 */
export const BudgetDisplay: FC<BudgetDisplayProps> = ({
  budget,
  className,
}) => {
  return (
    <div
      className={cn(
        "flex flex-col gap-1 rounded-md border border-border/60 bg-background/90 px-3 py-2 text-sm",
        className
      )}
    >
      <p className="font-medium text-foreground">
        Budget: ≤ {OPERATIONS_FORMAT.format(budget.operations)} operations
        {budget.wallClock !== undefined && (
          <span className="font-normal text-muted-foreground">
            {" "}
            (~{budget.wallClock})
          </span>
        )}
      </p>
      <p className="text-xs leading-relaxed text-muted-foreground">
        {COARSENESS_STATEMENT}
      </p>
    </div>
  )
}
