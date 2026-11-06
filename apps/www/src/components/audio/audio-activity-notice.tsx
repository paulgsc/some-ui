/**
 * Layer 2 of audio disclosure: a notice the first time a person enters an
 * activity that uses audio, offering the choice there, never shown for that
 * activity again. Said over the screen (`Notice`), so the activity under it
 * holds still when it comes and goes (HS1); it stays until answered, so it
 * is not missed as a passing toast would be.
 *
 * Not a modal (audio is expected in a learning app), except for a `required`
 * activity, which cannot work without sound.
 */

import type { JSX } from "react"
import { useSyncExternalStore } from "react"
import type { ActivityDefinition } from "@some-ui/activity-catalog"
import { cn } from "@some-ui/core-utils"
import { Button, Notice } from "@some-ui/shared"

import { audioNotice } from "@/lib/audio-notice"
import {
  setAllEnabled,
  setChannelEnabled,
  summarizeAudio,
} from "@/lib/audio-preferences"
import { useAudioPreferences } from "@/lib/audio-preferences/use-audio-preferences"

export type AudioActivityNoticeProps = {
  activity: ActivityDefinition
}

export type AudioActivityHintProps = AudioActivityNoticeProps & {
  className?: string
}

/**
 * Renders nothing for a silent activity, one already acknowledged, or before
 * settings load: a returning person usually sees no notice.
 */
export const AudioActivityNotice = ({
  activity,
}: AudioActivityNoticeProps): JSX.Element | null => {
  const { preferences, update, isReady } = useAudioPreferences()
  const acknowledged = useSyncExternalStore(audioNotice.subscribe, () =>
    audioNotice.answered(activity.id)
  )
  const setAcknowledged = (): void => {
    audioNotice.answer(activity.id)
  }

  const audio = activity.audio
  if (!audio || acknowledged || !isReady) return null

  const channelsOn = audio.channels.filter(
    (channel) => preferences[channel].enabled
  )
  const alreadyOn = channelsOn.length === audio.channels.length

  const enableAndDismiss = (): void => {
    const next = audio.channels.reduce(
      (preference, channel) => setChannelEnabled(preference, channel, true),
      preferences
    )
    update(next)
    setAcknowledged()
  }

  const continueMuted = (): void => {
    update(setAllEnabled(preferences, false))
    setAcknowledged()
  }

  return (
    <Notice role="status">
      <div className="flex flex-col gap-3">
        <p className="flex items-center gap-2 font-medium">
          <span aria-hidden="true">{summarizeAudio(preferences).icon}</span>
          {activity.name} {audio.blurb.toLowerCase()}
        </p>
        <p className="text-muted-foreground">
          {alreadyOn
            ? "Sound is on for this activity. You can change it anytime from the speaker icon in the header."
            : "Sound is currently off. You can turn it on here, or anytime from the speaker icon in the header."}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {alreadyOn ? (
            <>
              <Button size="sm" onClick={() => setAcknowledged()}>
                Got it
              </Button>
              <Button size="sm" variant="ghost" onClick={continueMuted}>
                Continue muted
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" onClick={enableAndDismiss}>
                Enable audio
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setAcknowledged()}
              >
                Continue muted
              </Button>
            </>
          )}
        </div>
      </div>
    </Notice>
  )
}

/**
 * The same disclosure at rest: a speaker glyph and one line, for an
 * activity card a person is choosing between rather than already inside.
 */
export const AudioActivityHint = ({
  activity,
  className,
}: AudioActivityHintProps): JSX.Element | null => {
  if (!activity.audio) return null

  return (
    <span
      className={cn(
        "text-muted-foreground flex items-center gap-1.5 text-xs",
        className
      )}
      data-audio-channels={activity.audio.channels.join(",")}
    >
      <span aria-hidden="true">
        {activity.audio.channels.includes("speech") ? "🔊" : "🎵"}
      </span>
      {activity.audio.blurb}
    </span>
  )
}
