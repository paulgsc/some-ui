/**
 * The session's audio disclosure: at most one callout, for the first
 * audio-bearing activity in it that the person has not already
 * acknowledged.
 *
 * One rather than one-per-activity on purpose. A session can hold several
 * activities and a stack of callouts above the viewport is its own kind of
 * noise - the second one teaches nothing the first didn't, and the speaker
 * indicator in the header is where the full picture lives anyway. The
 * remaining activities disclose themselves the next time they lead a
 * session, or on their card in the composer.
 */

import type { JSX } from "react"
import { ACTIVITY_CATALOG } from "@some-ui/activity-catalog"
import { cn } from "some-ui-utils"

import type { SessionRecord } from "@/lib/tenant"
import { AudioActivityNotice } from "@/components/audio/audio-activity-notice"

export type SessionAudioNoticeProps = {
  session: SessionRecord
  className?: string
}

export const SessionAudioNotice = ({
  session,
  className,
}: SessionAudioNoticeProps): JSX.Element | null => {
  const leadingAudioActivity = session.activities
    .map((item) => ACTIVITY_CATALOG[item.activityId])
    .find((activity) => activity.audio !== undefined)

  if (!leadingAudioActivity) return null

  return (
    <AudioActivityNotice
      activity={leadingAudioActivity}
      className={cn("shrink-0", className)}
    />
  )
}
