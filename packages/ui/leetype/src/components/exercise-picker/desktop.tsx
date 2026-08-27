import type { FC } from "react"
import { cn } from "some-ui-utils"

import { ExercisePickerBadgeChip } from "./badge-chip"
import type { ExercisePickerProps } from "./types"

/**
 * The wide-viewport picker: a tile grid, sized for a pointer and a glance
 * across several titles at once. Each tile is a native `button` rather than
 * a styled `div` with a click handler, so focus, keyboard activation and
 * the accessibility tree come from the platform instead of being rebuilt.
 */
export const ExercisePickerDesktop: FC<ExercisePickerProps> = ({
  items,
  onSelect,
  className,
}) => (
  <div
    data-scroll-intent="picker-grid"
    className={cn(
      // scroll-intent: picker-grid — the corpus is expected to keep growing,
      // and a tile grid that scrolls past however many exercises exist today
      // is the deliberate choice over paging or capping the list.
      "absolute inset-0 flex flex-col gap-4 overflow-y-auto p-6",
      className
    )}
  >
    <h1 className="text-sm font-medium text-muted-foreground">
      Choose what to practice
    </h1>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onSelect(item.id)}
          className="flex flex-col items-start gap-2 rounded-lg border border-border bg-card p-4 text-left transition-colors hover:border-primary/50 hover:bg-accent"
        >
          <span className="text-sm font-semibold text-card-foreground">
            {item.title}
          </span>
          {item.badge && <ExercisePickerBadgeChip badge={item.badge} />}
        </button>
      ))}
    </div>
  </div>
)
