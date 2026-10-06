/**
 * Wet-floor signs for activities still being built: on the card, before the
 * click, saying how finished it is and nothing else (no error counts, no
 * roadmap). A `"ready"` activity is unmarked: a badge on everything means
 * nothing.
 */

import type { JSX } from "react"
import type {
  ActivityDefinition,
  ActivityMaturity,
} from "@some-ui/activity-catalog"
import { cn } from "@some-ui/core-utils"
import { Badge } from "@some-ui/shared"

type MaturityCopy = {
  label: string
  /** One line, in the second person, about what to expect. */
  note: string
  variant: "secondary" | "outline"
}

const COPY: Readonly<Record<Exclude<ActivityMaturity, "ready">, MaturityCopy>> =
  {
    preview: {
      label: "Preview",
      note: "Works, with rough edges still being smoothed out.",
      variant: "secondary",
    },
    early: {
      label: "Early access",
      note: "Under construction - expect gaps and unfinished parts.",
      variant: "outline",
    },
  }

function copyFor(activity: ActivityDefinition): MaturityCopy | null {
  const maturity = activity.maturity ?? "ready"
  return maturity === "ready" ? null : COPY[maturity]
}

export type ActivityMaturityProps = {
  activity: ActivityDefinition
  className?: string
}

/** The badge alone, for a card that is already dense. */
export const ActivityMaturityBadge = ({
  activity,
  className,
}: ActivityMaturityProps): JSX.Element | null => {
  const copy = copyFor(activity)
  if (!copy) return null

  return (
    <Badge
      variant={copy.variant}
      className={cn("shrink-0", className)}
      data-activity-maturity={activity.maturity}
      // The badge is two words; the sentence is what actually sets an
      // expectation, and someone who can't hover still gets it.
      title={copy.note}
    >
      {copy.label}
    </Badge>
  )
}

/** The sentence, for a card with room to say it plainly. */
export const ActivityMaturityNote = ({
  activity,
  className,
}: ActivityMaturityProps): JSX.Element | null => {
  const copy = copyFor(activity)
  if (!copy) return null

  return (
    <p
      className={cn("text-muted-foreground text-xs", className)}
      data-activity-maturity={activity.maturity}
    >
      {copy.note}
    </p>
  )
}
