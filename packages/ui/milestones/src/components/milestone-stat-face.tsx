import {
  toneBorderClass,
  toneDotClass,
  toneTextClass,
  toneTintClass,
} from "@milestones/lib/tone"
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
  <article
    className={cn(
      "relative flex size-full flex-col justify-center gap-4 overflow-hidden rounded-lg border-2 bg-gradient-to-br p-3 text-card-foreground shadow-[4px_5px_0_hsl(var(--foreground)/0.85)]",
      toneBorderClass[milestone.tone],
      toneTintClass[milestone.tone]
    )}
  >
    <div
      className={cn(
        "absolute inset-x-0 top-0 h-1",
        toneDotClass[milestone.tone]
      )}
      aria-hidden
    />

    {milestone.stats && milestone.stats.length > 0 ? (
      <dl className="relative grid grid-cols-2 gap-3">
        {milestone.stats.map((stat) => (
          <div key={stat.label} className="min-w-0">
            <dt className="truncate text-[10px] uppercase tracking-wide text-muted-foreground">
              {stat.label}
            </dt>
            <dd
              className={cn(
                "truncate text-base font-bold",
                toneTextClass[milestone.tone]
              )}
            >
              {stat.value}
            </dd>
          </div>
        ))}
      </dl>
    ) : (
      <div className="relative">
        <p
          className={cn(
            "inline-flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider",
            toneTextClass[milestone.tone]
          )}
        >
          <span
            className={cn(
              "size-1.5 rounded-full",
              toneDotClass[milestone.tone]
            )}
            aria-hidden
          />
          {milestone.category}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {milestone.timestamp}
        </p>
      </div>
    )}
  </article>
)
