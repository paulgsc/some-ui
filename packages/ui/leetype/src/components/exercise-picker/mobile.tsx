import type { FC } from "react"
import { cn } from "some-ui-utils"

import { ExercisePickerBadgeChip } from "./badge-chip"
import type { ExercisePickerProps } from "./types"

/**
 * The narrow-viewport picker: one scrolling column of full-width rows, each
 * tall enough for a thumb rather than a cursor. `ReadingSession`'s own doc
 * comment argues the one-vertical-scroll rule this follows: `data-scroll-
 * intent="picker-list"` marks this as the page's own scroller so nothing
 * downstream nests a second one under it.
 */
export const ExercisePickerMobile: FC<ExercisePickerProps> = ({
  items,
  onSelect,
  className,
}) => (
  <div
    data-scroll-intent="picker-list"
    className={cn(
      // scroll-intent: picker-list — this surface is the whole page on a
      // phone, the same one-vertical-scroll rule ReadingSession follows.
      "mx-auto flex h-full w-full max-w-lg flex-col gap-3 overflow-y-auto px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3",
      className
    )}
  >
    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">
      Choose what to practice
    </p>
    {items.map((item) => (
      <button
        key={item.id}
        type="button"
        onClick={() => onSelect(item.id)}
        className="flex shrink-0 items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-4 text-left transition-colors active:bg-accent"
      >
        <span className="text-sm font-semibold text-card-foreground">
          {item.title}
        </span>
        {item.badge && <ExercisePickerBadgeChip badge={item.badge} />}
      </button>
    ))}
  </div>
)
