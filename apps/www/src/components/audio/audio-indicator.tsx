/**
 * Layer 1 of audio disclosure: a speaker in the chrome that always shows what
 * this app may play (`🔇 Sound off`, `🔊 Voice`, `🎵 Effects`,
 * `🔉 Voice + Effects`), without interrupting. The first-use notice points
 * here; toasts are kept for things that actually happened.
 *
 * It also names who reads lessons aloud (the voice and its platform), and
 * warns when a browser with no Korean voice would read Hangul in another
 * language's voice.
 */

import type { JSX } from "react"
import { cn } from "@some-ui/core-utils"
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
import { useSpeechStatus, useVoiceReport } from "@some-ui/speech"

import type { AudioChannelId } from "@/lib/audio-preferences"
import {
  AUDIO_CHANNELS,
  setAllEnabled,
  setChannelEnabled,
  setChannelVolume,
  summarizeAudio,
} from "@/lib/audio-preferences"
import { useAudioPreferences } from "@/lib/audio-preferences/use-audio-preferences"
import type { LessonVoiceSummary } from "@/lib/lesson-voice"
import {
  deviceKindOf,
  LESSON_LANGUAGE,
  summarizeLessonVoice,
} from "@/lib/lesson-voice"

/**
 * A one-line health note, shown only when speech is not simply fine.
 * `useSpeechStatus` exposes no endpoints, adapters or error strings, by
 * design.
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

/** Who reads lessons aloud: the voice by name, and the platform. */
const LessonVoice = ({ voice }: { voice: LessonVoiceSummary }): JSX.Element => (
  <div className={cn("space-y-1")} data-lesson-voice-warning={voice.warning}>
    <p className={cn("text-sm font-medium")}>
      {voice.warning ? "⚠ " : ""}
      {voice.label}
    </p>
    <p className={cn("text-muted-foreground text-xs")}>{voice.detail}</p>
    {voice.fix ? <p className={cn("text-xs")}>{voice.fix}</p> : null}
  </div>
)

export const AudioIndicator = (): JSX.Element => {
  const { preferences, update, isReady } = useAudioPreferences()
  const summary = summarizeAudio(preferences)
  // Re-read on every session announcement: voices load asynchronously, and
  // opening the popover re-renders only the popover.
  const report = useVoiceReport(LESSON_LANGUAGE)
  const voice = report
    ? summarizeLessonVoice(
        report,
        deviceKindOf(
          typeof navigator === "undefined" ? "" : navigator.userAgent
        )
      )
    : null

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
          aria-label={`Audio: ${summary.label}${voice ? `. Lessons: ${voice.label}` : ""}`}
          title={voice ? `Lessons: ${voice.label}` : undefined}
          data-audio-summary={summary.label}
        >
          <span aria-hidden="true">
            {summary.icon}
            {voice?.warning ? "⚠" : ""}
          </span>
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

        {voice ? <LessonVoice voice={voice} /> : null}

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
