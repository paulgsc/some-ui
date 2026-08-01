/**
 * Layer 1 of audio disclosure: the persistent capability indicator.
 *
 * A small speaker in the chrome that always reflects what this app may play
 * right now - `🔇 Sound off`, `🔊 Voice`, `🎵 Effects`, `🔉 Voice + Effects`.
 * It communicates the app's audio capability without interrupting anyone,
 * and it is the canonical place a person learns this app has audio at all.
 *
 * The other two layers lean on it: the first-use notice for an activity
 * points here ("you can change this anytime from the speaker icon"), and
 * transient toasts stay reserved for things that actually happened rather
 * than for teaching the feature.
 */

import type { JSX } from "react"
import {
  Button,
  Label,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Separator,
  Slider,
  Switch,
} from "@some-ui/shared"
import { useSpeechStatus } from "@some-ui/speech"
import { cn } from "some-ui-utils"

import type { AudioChannelId } from "@/lib/audio-preferences"
import {
  AUDIO_CHANNELS,
  setAllEnabled,
  setChannelEnabled,
  setChannelVolume,
  summarizeAudio,
} from "@/lib/audio-preferences"
import { useAudioPreferences } from "@/lib/audio-preferences/use-audio-preferences"

/**
 * A one-line health note, shown only when speech is not simply fine.
 *
 * `useSpeechStatus` is the coarse, user-facing view `@some-ui/speech`
 * exposes - which voice, and whether it works. Nothing about endpoints,
 * adapters or error strings is reachable from here, by design.
 */
const SpeechHealthNote = (): JSX.Element | null => {
  const status = useSpeechStatus()

  if (status.muted || status.health === "ready") return null

  return (
    <p className={cn("text-muted-foreground text-xs")}>
      {status.health === "unavailable"
        ? "This browser can't read text aloud."
        : "Speech hit a problem recently. It may recover on its own."}
    </p>
  )
}

export const AudioIndicator = (): JSX.Element => {
  const { preferences, update, isReady } = useAudioPreferences()
  const summary = summarizeAudio(preferences)

  const toggleChannel = (channel: AudioChannelId, enabled: boolean): void => {
    update(setChannelEnabled(preferences, channel, enabled))
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn("gap-2")}
          disabled={!isReady}
          aria-label={`Audio: ${summary.label}`}
          data-audio-summary={summary.label}
        >
          <span aria-hidden="true">{summary.icon}</span>
          <span className={cn("hidden text-xs sm:inline")}>
            {summary.label}
          </span>
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className={cn("w-72 space-y-4")}>
        <div className={cn("space-y-1")}>
          <h2 className={cn("text-sm font-semibold")}>Audio</h2>
          <p className={cn("text-muted-foreground text-xs")}>
            What this app may play. Changes apply immediately.
          </p>
        </div>

        <div className={cn("space-y-4")}>
          {AUDIO_CHANNELS.map((channel) => (
            <div key={channel.id} className={cn("space-y-2")}>
              <div className={cn("flex items-center justify-between gap-2")}>
                <Label
                  htmlFor={`audio-${channel.id}`}
                  className={cn("text-sm font-medium")}
                >
                  {channel.label}
                </Label>
                <Switch
                  id={`audio-${channel.id}`}
                  checked={preferences[channel.id].enabled}
                  onCheckedChange={(checked) =>
                    toggleChannel(channel.id, checked)
                  }
                />
              </div>
              <p className={cn("text-muted-foreground text-xs")}>
                {channel.description}
              </p>
              <Slider
                aria-label={`${channel.label} volume`}
                value={[Math.round(preferences[channel.id].volume * 100)]}
                min={0}
                max={100}
                step={5}
                disabled={!preferences[channel.id].enabled}
                onValueChange={(values) =>
                  update(
                    setChannelVolume(
                      preferences,
                      channel.id,
                      (values[0] ?? 0) / 100
                    )
                  )
                }
              />
            </div>
          ))}
        </div>

        <Separator />

        <div className={cn("flex items-center justify-between gap-2")}>
          <SpeechHealthNote />
          <Button
            variant="ghost"
            size="sm"
            className={cn("ml-auto shrink-0 text-xs")}
            onClick={() =>
              update(setAllEnabled(preferences, summary.label === "Sound off"))
            }
          >
            {summary.label === "Sound off" ? "Turn all on" : "Mute everything"}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
