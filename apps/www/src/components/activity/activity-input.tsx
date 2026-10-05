/**
 * Input disclosure: what an activity will ask of a person's hands. The
 * sibling of `components/audio/audio-activity-notice`, same shape: a hint on
 * a card being chosen, a note inside the chosen surface.
 *
 * For an activity that changes shape on a phone (LeetType becomes a
 * read-and-say exercise with no keyboard). Nothing reads the viewport: the
 * hint is true at every width, since a person may choose on one device and
 * play on another.
 */

import type { JSX } from "react"
import type { ActivityDefinition } from "@some-ui/activity-catalog"
import { Keyboard, Pointer } from "lucide-react"
import { cn } from "some-ui-utils"

export type ActivityInputProps = {
  activity: ActivityDefinition
  className?: string
}

/**
 * A glyph and one line for an activity card; nothing for an activity that
 * asks nothing worth disclosing (most of them).
 */
export const ActivityInputHint = ({
  activity,
  className,
}: ActivityInputProps): JSX.Element | null => {
  const input = activity.input
  if (!input) return null

  const Glyph = input.modalities.includes("keyboard") ? Keyboard : Pointer

  return (
    <span
      className={cn(
        "text-muted-foreground flex items-center gap-1.5 text-xs",
        className
      )}
      data-input-modalities={input.modalities.join(",")}
    >
      <Glyph className="size-3.5 shrink-0" aria-hidden="true" />
      {input.blurb}
    </span>
  )
}

/**
 * The same disclosure on the Configure screen. Only an activity whose
 * small-screen interaction is a different exercise (`switchesOnSmallScreens`)
 * gets the extra sentence.
 */
export const ActivityInputNote = ({
  activity,
  className,
}: ActivityInputProps): JSX.Element | null => {
  const input = activity.input
  if (!input?.switchesOnSmallScreens) return null

  return (
    <p className={cn("text-muted-foreground text-xs", className)}>
      On a small screen this runs as a reading exercise rather than a typing one
      — same material, a channel a phone can actually carry.
    </p>
  )
}
