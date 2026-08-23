import { toneDotClass, toneTextClass } from "@milestones/lib/tone"
import type { Milestone } from "@milestones/types"
import { cn } from "some-ui-utils"

type Props = {
  milestone: Milestone
  /** Denser spacing/type for small surfaces like a grid cell. */
  compact?: boolean
}

export const MilestoneFace = ({
  milestone,
  compact = false,
}: Props): React.JSX.Element => (
  <article
    className={cn(
      "flex size-full flex-col justify-between gap-3 rounded-lg border border-border bg-card text-card-foreground",
      compact ? "p-3" : "p-5"
    )}
  >
    <header className="flex items-center justify-between gap-3">
      <span
        className={cn(
          "inline-flex items-center gap-1.5 font-medium uppercase tracking-wider",
          compact ? "text-[10px]" : "text-xs",
          toneTextClass[milestone.tone]
        )}
      >
        <span
          className={cn("size-1.5 rounded-full", toneDotClass[milestone.tone])}
          aria-hidden
        />
        {milestone.category}
      </span>
      <span
        className={cn(
          "text-muted-foreground",
          compact ? "text-[10px]" : "text-xs"
        )}
      >
        {milestone.timestamp}
      </span>
    </header>

    <div className="min-h-0 flex-1 overflow-hidden">
      <h2
        className={cn(
          "text-balance font-semibold leading-snug",
          compact ? "text-sm" : "text-lg sm:text-xl"
        )}
      >
        {milestone.title}
      </h2>
      <blockquote
        className={cn(
          "mt-2 italic text-muted-foreground",
          compact ? "line-clamp-2 text-xs" : "line-clamp-3 text-sm"
        )}
      >
        “{milestone.reflection}”
      </blockquote>
    </div>

    {!compact && milestone.stats && milestone.stats.length > 0 && (
      <dl className="grid grid-cols-2 gap-3 border-t border-border pt-3">
        {milestone.stats.map((stat) => (
          <div key={stat.label}>
            <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {stat.label}
            </dt>
            <dd
              className={cn(
                "text-sm font-semibold",
                toneTextClass[milestone.tone]
              )}
            >
              {stat.value}
            </dd>
          </div>
        ))}
      </dl>
    )}
  </article>
)
