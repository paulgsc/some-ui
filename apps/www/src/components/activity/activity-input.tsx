/**
 * Input disclosure: what an activity is going to ask of a person's hands.
 *
 * The sibling of `components/audio/audio-activity-notice`, and deliberately
 * built to the same shape — a hint at rest on a card someone is choosing
 * from, and a note inside the surface they have already chosen. Audio
 * disclosure exists because a module that makes noise should say so before it
 * does; this exists because a module that changes shape on a phone should say
 * so before someone starts it there.
 *
 * The case that made it necessary is LeetType. Its large-screen surface is a
 * typing probe; below the small-screen breakpoint it is a different exercise
 * — read a change, say what it does — because there is no keyboard on a phone
 * to produce code with. A person who launched it on their phone expecting the
 * typing game would otherwise find out by being handed something else.
 *
 * Nothing here reads the viewport. The hint is written to be true at every
 * width ("Typing on a keyboard; reading and tapping on a phone"), which is
 * what a card in a launcher needs: the person may well be choosing on one
 * device for a session they will play on another.
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
 * A glyph and one line, for an activity card a person is choosing between.
 * Renders nothing for an activity that asks nothing worth disclosing — which
 * is most of them, and the point.
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
 * The same disclosure one step further in, on the Configure screen where a
 * person is about to commit to a session length.
 *
 * Only an activity whose small-screen interaction is a genuinely different
 * exercise (`switchesOnSmallScreens`) earns the extra sentence. For anything
 * else the hint above is the right weight, and a second callout would be a
 * banner nobody reads.
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
