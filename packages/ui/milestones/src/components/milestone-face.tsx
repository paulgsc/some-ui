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
  compact?: boolean
  className?: string
}

export const MilestoneFace = ({
  milestone,
  compact = false,
  className,
}: Props): React.JSX.Element => (
  <article
    className={cn(
      "group relative flex size-full flex-col justify-between gap-5 overflow-hidden rounded-2xl border-2 bg-gradient-to-br text-card-foreground shadow-[6px_7px_0_hsl(var(--foreground)/0.85)] transition-transform duration-300 hover:-translate-y-1 hover:shadow-[8px_10px_0_hsl(var(--foreground)/0.85)]",
      toneBorderClass[milestone.tone],
      toneTintClass[milestone.tone],
      compact ? "p-4" : "p-6",
      className
    )}
  >
    <div
      className={cn(
        "absolute inset-x-0 top-0 h-1.5",
        toneDotClass[milestone.tone]
      )}
      aria-hidden
    />

    <header className="flex items-start justify-between gap-4 pt-1">
      <span
        className={cn(
          "inline-flex items-center gap-2 rounded-full border border-foreground/20 bg-background/60 px-2.5 py-1 font-mono font-bold uppercase tracking-[0.14em] backdrop-blur-sm",
          compact ? "text-[9px]" : "text-[10px]",
          toneTextClass[milestone.tone]
        )}
      >
        <span
          className={cn(
            "size-2 rounded-full ring-2 ring-background/80",
            toneDotClass[milestone.tone]
          )}
          aria-hidden
        />
        {milestone.category}
      </span>
      <time
        className={cn(
          "shrink-0 font-mono font-bold uppercase tracking-wider text-muted-foreground",
          compact ? "text-[9px]" : "text-[10px]"
        )}
      >
        {milestone.timestamp}
      </time>
    </header>

    <div className="min-h-0 flex-1">
      <h2
        className={cn(
          "text-balance font-black tracking-[-0.04em] text-foreground",
          compact
            ? "line-clamp-1 text-base leading-tight"
            : "text-2xl leading-[1.08] sm:text-3xl"
        )}
      >
        {milestone.title}
      </h2>
      {milestone.reflection && (
        <blockquote
          className={cn(
            "border-l-2 border-foreground/30 pl-3 text-muted-foreground",
            compact
              ? "mt-2 line-clamp-2 text-xs leading-5"
              : "mt-4 line-clamp-3 text-sm leading-6"
          )}
        >
          “{milestone.reflection}”
        </blockquote>
      )}
    </div>

    {!compact && milestone.stats && milestone.stats.length > 0 && (
      <dl className="grid grid-cols-2 gap-3 border-t-2 border-foreground/15 pt-4">
        {milestone.stats.map((stat) => (
          <div key={stat.label} className="min-w-0">
            <dt className="truncate font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
              {stat.label}
            </dt>
            <dd
              className={cn(
                "mt-1 truncate font-black",
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
