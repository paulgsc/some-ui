import { toneTextClass } from "@milestones/lib/tone"
import type { Milestone } from "@milestones/types"
import { cn } from "some-ui-utils"

type Props = {
  milestone: Milestone
}

/**
 * The "back" of a grid cell — what a `MilestoneGridCell` flips to reveal.
 * Milestones without stats fall back to a large tone/category treatment
 * rather than an empty face, so every cell has something to flip to.
 */
export const MilestoneStatFace = ({ milestone }: Props): React.JSX.Element => (
  <article className="flex size-full flex-col justify-center gap-4 rounded-lg border border-border bg-card p-3 text-card-foreground">
    {milestone.stats && milestone.stats.length > 0 ? (
      <dl className="grid grid-cols-2 gap-3">
        {milestone.stats.map((stat) => (
          <div key={stat.label}>
            <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {stat.label}
            </dt>
            <dd
              className={cn(
                "text-base font-bold",
                toneTextClass[milestone.tone]
              )}
            >
              {stat.value}
            </dd>
          </div>
        ))}
      </dl>
    ) : (
      <div>
        <p
          className={cn(
            "text-[10px] font-medium uppercase tracking-wider",
            toneTextClass[milestone.tone]
          )}
        >
          {milestone.category}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {milestone.timestamp}
        </p>
      </div>
    )}
  </article>
)
