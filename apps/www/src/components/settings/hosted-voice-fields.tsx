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
} from "@some-ui/speech"

const PROVIDER_LABEL: Readonly<Record<TTSProvider, string>> = {
  openai: "OpenAI",
  elevenlabs: "ElevenLabs",
  google: "Google",
  azure: "Azure",
  custom: "Custom",
}

/** Radix's Select reserves the empty string, so "the default" needs a name. */
const PROVIDER_DEFAULT = "provider-default"

/** What every lesson on this site is spoken in. */
const LESSON_LANGUAGE = "ko-KR"

type HostedVoiceFieldsProps = {
  value: HostedVoiceChoice
  onChange: (next: HostedVoiceChoice) => void
}

const LessonVoice = ({ value }: { value: HostedVoiceChoice }): JSX.Element => {
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
