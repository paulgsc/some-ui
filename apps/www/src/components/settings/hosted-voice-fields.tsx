/**
 * The hosted voice: which provider, and which of its voices. Typed end to
 * end: a `HostedVoiceChoice` pairs a provider only with its own voices, and
 * the dropdown's string is parsed (`parseHostedVoiceChoice`) on arrival.
 *
 * Under the dropdown, the voice a Korean lesson will be heard in, by the
 * session's own rule (`hostedVoiceFor`): the chosen voice if it speaks
 * Korean, else the provider's Korean default. A drama's characters of the
 * other gender are read in the provider's Korean voice of that gender.
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
import type {
  HostedVoiceChoice,
  TTSProvider,
  VoiceReport,
} from "@some-ui/speech"
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

/** Who reads lessons when it is not the hosted voice, as part of a sentence. */
function browserVoiceNow(report: VoiceReport): string {
  switch (report.availability) {
    case "available": {
      return `${report.voice ?? "its default Korean voice"}, your browser's own voice`
    }
    case "missing": {
      return "your browser's own voice, which has no Korean voice (see the speaker icon)"
    }
    case "checking":
    case "unverifiable": {
      return "your browser's own voice"
    }
    default: {
      return assertNever(report.availability)
    }
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled voice availability: ${JSON.stringify(value)}`)
}

const LessonVoice = ({ value }: { value: HostedVoiceChoice }): JSX.Element => {
  // The session only uses a hosted voice when it can reach the voice service;
  // otherwise the browser's own voice reads lessons, and saying otherwise
  // would be false.
  const speaking = useVoiceReport(LESSON_LANGUAGE)
  if (speaking && speaking.platform !== "hosted") {
    const now = browserVoiceNow(speaking)
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
  const otherPart = lessonVoice.gender === "male" ? "female" : "male"
  const other = hostedVoiceFor(value, LESSON_LANGUAGE, otherPart)
  return (
    <>
      <p className="text-muted-foreground text-sm">
        Korean lessons are read by {lessonVoice.name}
        {chosen && chosen.id !== lessonVoice.id
          ? `, since ${chosen.name} can't read Korean.`
          : "."}
      </p>
      {other && other.id !== lessonVoice.id && (
        <p className="text-muted-foreground text-sm">
          In a drama, {otherPart === "male" ? "men" : "women"} are read by{" "}
          {other.name}.
        </p>
      )}
    </>
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
            No preset voices for this provider, so it can&apos;t read lessons
            yet. Choose another provider to hear them.
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
