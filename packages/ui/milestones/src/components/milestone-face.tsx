import { toneDotClass, toneTextClass } from "@milestones/lib/tone"
import type { Milestone } from "@milestones/types"
import { cn } from "some-ui-utils"

type Props = {
  milestone: Milestone
}

export const MilestoneFace = ({ milestone }: Props): React.JSX.Element => (
  <article className="flex size-full flex-col justify-between gap-3 rounded-lg border border-border bg-card p-5 text-card-foreground">
    <header className="flex items-center justify-between gap-3">
      <span
        className={cn(
          "inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider",
          toneTextClass[milestone.tone]
        )}
      >
        <span
          className={cn("size-1.5 rounded-full", toneDotClass[milestone.tone])}
          aria-hidden
        />
        {milestone.category}
      </span>
      <span className="text-xs text-muted-foreground">
        {milestone.timestamp}
      </span>
    </header>

    <div className="min-h-0 flex-1 overflow-hidden">
      <h2 className="text-balance text-lg font-semibold leading-snug sm:text-xl">
        {milestone.title}
      </h2>
      <blockquote className="mt-2 line-clamp-3 text-sm italic text-muted-foreground">
        “{milestone.reflection}”
      </blockquote>
    </div>

    {milestone.stats && milestone.stats.length > 0 && (
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
