/**
 * Wet-floor signs for the activities that are still being built.
 *
 * This app ships applets at very different stages on purpose - they get
 * better by being used, and holding them back until they are perfect means
 * shipping nothing. The problem is not that they are unfinished; it is that
 * nothing said so, and a person picked "Mock Interview" expecting the same
 * finish as "Hangul Honeycomb".
 *
 * So the sign goes where the choice is made, not where the disappointment
 * lands: on the card, before the click. It says how finished the thing is
 * and nothing else - no error counts, no "known issues", no roadmap, no
 * apology. A person needs to calibrate their expectations, not diagnose the
 * build.
 *
 * A `"ready"` activity is unmarked, deliberately. A badge on everything is
 * a badge on nothing, and the absence of a sign is what makes a sign mean
 * something.
 */

import type { JSX } from "react"
import { Badge } from "@some-ui/shared"
import { cn } from "some-ui-utils"

import type {
  ActivityDefinition,
  ActivityMaturity,
} from "@/lib/activity-catalog"

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
