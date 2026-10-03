/**
 * The hosted voice: which provider, and which of its voices.
 *
 * Typed end to end. The value is a `HostedVoiceChoice`, so a provider is
 * only ever paired with one of its own voices, and the dropdown's string
 * goes through `parseHostedVoiceChoice` the moment it arrives.
 *
 * Under the dropdown, the voice a Korean lesson will actually be heard in,
 * computed by the same rule the session follows (`hostedVoiceFor`): the
 * chosen voice when it speaks Korean, otherwise the provider's Korean
 * default. The dropdown alone used to show "Onyx" with nothing chosen,
 * while lessons spoke SunHi.
 */

import type { JSX } from "react"
import {
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@some-ui/shared"
import type { HostedVoiceChoice, TTSProvider } from "@some-ui/speech"
import {
  hostedVoiceFor,
  hostedVoicesOf,
  isTTSProvider,
  parseHostedVoiceChoice,
  useVoiceReport,
} from "@some-ui/speech"

import { LESSON_LANGUAGE } from "@/lib/lesson-voice"

const PROVIDER_LABEL: Readonly<Record<TTSProvider, string>> = {
  openai: "OpenAI",
  elevenlabs: "ElevenLabs",
  google: "Google",
  azure: "Azure",
  custom: "Custom",
}

/** Radix's Select reserves the empty string, so "the default" needs a name. */
const PROVIDER_DEFAULT = "provider-default"

type HostedVoiceFieldsProps = {
  value: HostedVoiceChoice
  onChange: (next: HostedVoiceChoice) => void
}

const LessonVoice = ({ value }: { value: HostedVoiceChoice }): JSX.Element => {
  // The fields below choose a hosted voice, but the session only uses one
  // when it can reach the voice service (signed in, on a deployment that
  // has it). Otherwise saying which hosted voice reads lessons would be
  // false: the browser's own voice does.
  const speaking = useVoiceReport(LESSON_LANGUAGE)
  if (speaking && speaking.platform !== "hosted") {
    const now = speaking.speaksLanguage
      ? `${speaking.voice ?? "its default Korean voice"}, your browser's own voice`
      : "your browser's own voice, which has no Korean voice (see the speaker icon)"
    return (
      <p className="text-muted-foreground text-sm">
        Lessons are read by {now} right now. The voice chosen here applies when
        you&apos;re signed in.
      </p>
    )
  }

  const lessonVoice = hostedVoiceFor(value, LESSON_LANGUAGE)
  const chosen = hostedVoicesOf(value.provider).find(
    (voice) => voice.id === value.voiceId
  )

  if (!lessonVoice) {
    return (
      <p className="text-muted-foreground text-sm">
        {PROVIDER_LABEL[value.provider]} has no Korean voice here, so lessons
        won&apos;t be read aloud with it.
      </p>
    )
  }
  return (
    <p className="text-muted-foreground text-sm">
      Korean lessons are read by {lessonVoice.name}
      {chosen && chosen.id !== lessonVoice.id
        ? `, since ${chosen.name} can't read Korean.`
        : "."}
    </p>
  )
}

export const HostedVoiceFields = ({
  value,
  onChange,
}: HostedVoiceFieldsProps): JSX.Element => {
  const voices = hostedVoicesOf(value.provider)

  return (
    <>
      <div className="space-y-2">
        <Label>Text-to-speech provider</Label>
        <Select
          value={value.provider}
          onValueChange={(next: string) => {
            // A voice of the old provider is not one of the new one's.
            if (isTTSProvider(next))
              onChange(parseHostedVoiceChoice(next, null))
          }}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(PROVIDER_LABEL).map(([provider, label]) => (
              <SelectItem key={provider} value={provider}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Voice</Label>
        {voices.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No preset voices for this provider. Uses the endpoint default voice.
          </p>
        ) : (
          <Select
            value={value.voiceId ?? PROVIDER_DEFAULT}
            onValueChange={(next: string) =>
              onChange(
                parseHostedVoiceChoice(
                  value.provider,
                  next === PROVIDER_DEFAULT ? null : next
                )
              )
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={PROVIDER_DEFAULT}>
                Default for each language
              </SelectItem>
              {voices.map((voice) => (
                <SelectItem key={voice.id} value={voice.id}>
                  {voice.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <LessonVoice value={value} />
      </div>
    </>
  )
}
