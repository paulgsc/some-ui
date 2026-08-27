import type { FC } from "react"
import { Flame, Snowflake } from "lucide-react"
import { cn } from "some-ui-utils"

import type { ExercisePickerBadge } from "./types"

const TONE_LABEL: Record<ExercisePickerBadge["tone"], string> = {
  popular: "Popular",
  starved: "Starved",
}

/**
 * Renders whichever classification the caller already made
 * (`ExercisePickerBadge`'s own doc comment) — an icon and a count, nothing
 * that requires this package to know what "popular" means numerically.
 *
 * The icon is decorative (`aria-hidden`) and conveys tone by shape alone, so
 * `aria-label` names the tone in words too — otherwise a screen reader reads
 * only the bare count, and a "starved" 0 is indistinguishable from a
 * "popular" 0 (review finding on some-ui#1182).
 */
export const ExercisePickerBadgeChip: FC<{ badge: ExercisePickerBadge }> = ({
  badge,
}) => (
  <span
    aria-label={`${TONE_LABEL[badge.tone]}: ${badge.count}`}
    className={cn(
      "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[0.65rem] font-medium tabular-nums",
      badge.tone === "popular"
        ? "bg-primary/10 text-primary"
        : "bg-muted text-muted-foreground"
    )}
  >
    {badge.tone === "popular" ? (
      <Flame className="h-3 w-3" aria-hidden="true" />
    ) : (
      <Snowflake className="h-3 w-3" aria-hidden="true" />
    )}
    {badge.count}
  </span>
)
