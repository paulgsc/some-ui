/**
 * Layer 2 of audio disclosure: the first-use contextual notice.
 *
 * An inline callout the first time a person enters an activity that uses
 * audio, offering the choice there and then, and never shown for that
 * activity again.
 *
 * Inline rather than a toast, because a toast that teaches a feature is a
 * toast that gets missed - it lands while someone is still orienting
 * themselves visually and is gone before they look. Inline rather than a
 * modal, because for a learning app audio is the expected case: a
 * "This website contains audio. Press OK." dialog interrupts flow to
 * confirm something the person came here for. The one exception is an
 * activity marked `required`, which cannot function without sound, and
 * where a stronger prompt before starting is honest rather than rude.
 */

import type { JSX } from "react"
import type { ActivityDefinition } from "@some-ui/activity-catalog"
import { Alert, AlertDescription, AlertTitle, Button } from "@some-ui/shared"
import { cn, useLocalStorage } from "some-ui-utils"

import {
  setAllEnabled,
  setChannelEnabled,
  summarizeAudio,
} from "@/lib/audio-preferences"
import { useAudioPreferences } from "@/lib/audio-preferences/use-audio-preferences"

const STORAGE_PREFIX = "some-ui.audio.activity-notice.v1"

export type AudioActivityNoticeProps = {
  activity: ActivityDefinition
  className?: string
}

/**
 * Renders nothing at all for a silent activity, for one already
 * acknowledged, or before settings have loaded. The common case for a
 * returning person is no notice - which is the point.
 */
export const AudioActivityNotice = ({
  activity,
  className,
}: AudioActivityNoticeProps): JSX.Element | null => {
  const { preferences, update, isReady } = useAudioPreferences()
  const { value: acknowledged, setValue: setAcknowledged } = useLocalStorage(
    `${STORAGE_PREFIX}.${activity.id}`,
    false
  )

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
    setAcknowledged(true)
  }

  const continueMuted = (): void => {
    update(setAllEnabled(preferences, false))
    setAcknowledged(true)
  }

  return (
    <Alert className={cn("flex flex-col gap-3", className)}>
      <AlertTitle className={cn("flex items-center gap-2")}>
        <span aria-hidden="true">{summarizeAudio(preferences).icon}</span>
        {activity.name} {audio.blurb.toLowerCase()}
      </AlertTitle>
      <AlertDescription className={cn("space-y-3")}>
        <p>
          {alreadyOn
            ? "Sound is on for this activity. You can change it anytime from the speaker icon in the header."
            : "Sound is currently off. You can turn it on here, or anytime from the speaker icon in the header."}
        </p>
        <div className={cn("flex flex-wrap items-center gap-2")}>
          {alreadyOn ? (
            <>
              <Button size="sm" onClick={() => setAcknowledged(true)}>
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
                onClick={() => setAcknowledged(true)}
              >
                Continue muted
              </Button>
            </>
          )}
        </div>
      </AlertDescription>
    </Alert>
  )
}

/**
 * The same disclosure at rest: a speaker glyph and one line, for an
 * activity card a person is choosing between rather than already inside.
 */
export const AudioActivityHint = ({
  activity,
  className,
}: AudioActivityNoticeProps): JSX.Element | null => {
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
