import { toneTextClass } from "@milestones/lib/tone"
import type { Milestone } from "@milestones/types"
import { cn } from "some-ui-utils"

type Props = {
  milestone: Milestone
  index: number
  count: number
  className?: string
}

/**
 * The featured zone: whichever milestone is currently active, at headline
 * scale. Driven by the same `activeIndex` as the dice and timeline rather
 * than fixed copy, so the hero is never permanently about one milestone —
 * it's a window onto whichever one is up.
 */
export const MilestoneHero = ({
  milestone,
  index,
  count,
  className,
}: Props): React.JSX.Element => {
  const metrics =
    milestone.stats && milestone.stats.length > 0
      ? milestone.stats
      : [
          { label: "Category", value: milestone.category },
          { label: "Logged", value: milestone.timestamp },
        ]

  return (
    <div className={cn(className)}>
      <p className="flex items-center gap-3 font-mono text-xs uppercase tracking-[0.25em] text-muted-foreground">
        <span className={toneTextClass[milestone.tone]}>
          Milestone unlocked
        </span>
        <span>
          {String(index + 1).padStart(2, "0")} /{" "}
          {String(count).padStart(2, "0")}
        </span>
      </p>
      <h1 className="mt-3 line-clamp-2 text-balance text-3xl font-extrabold leading-[1.1] tracking-tight sm:text-4xl lg:text-5xl">
        {milestone.title}
      </h1>
      <p className="mt-3 line-clamp-2 max-w-2xl text-balance text-sm text-muted-foreground sm:text-base">
        “{milestone.reflection}”
      </p>
      <dl className="mt-5 flex flex-wrap gap-x-8 gap-y-3 border-t border-border pt-4">
        {metrics.map((metric) => (
          <div key={metric.label}>
            <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {metric.label}
            </dt>
            <dd
              className={cn("text-xl font-bold", toneTextClass[milestone.tone])}
            >
              {metric.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
