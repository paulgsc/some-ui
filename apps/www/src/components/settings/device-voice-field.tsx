/**
 * The voice control on the Android app (#1628).
 *
 * The web builds' "Text-to-speech provider" and "Voice" choose a hosted
 * voice, and the phone has no hosted voice to choose: it speaks with its
 * own engine. So on the phone those two fields give way to this one, which
 * lists the Korean voices the phone has, and says plainly when it has none,
 * with the button that fixes it, since otherwise every lesson is silent with
 * no hint why.
 *
 * The list is re-read when the app returns to the front, so a voice
 * installed from the system settings appears here without a reload.
 */

import type { JSX } from "react"
import {
  Button,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
} from "@some-ui/shared"
import type { NativeVoice } from "@some-ui/speech"
import { queryOptions, useQuery } from "@tanstack/react-query"

import type { DeviceVoices } from "@/lib/device-speech"
import {
  DEVICE_SPEECH_LANG,
  openVoiceInstall,
  previewDeviceVoice,
  readDeviceVoices,
  voiceLabel,
} from "@/lib/device-speech"
import { IntentFailure } from "@/lib/intent/render"
import { matchQueryOutcome, queryOutcome } from "@/lib/query-outcome"

const deviceVoicesQuery = queryOptions({
  queryKey: ["device-speech", "voices", DEVICE_SPEECH_LANG],
  queryFn: readDeviceVoices,
  // A voice installed from the system settings shows up on return.
  refetchOnWindowFocus: "always",
  staleTime: 0,
})

/** Radix's Select reserves the empty string, so "the default" needs a name. */
const PHONE_DEFAULT = "phone-default"

type DeviceVoiceFieldProps = {
  /** A `NativeVoice.id`, or empty for the phone's default Korean voice. */
  value: string
  onChange: (voiceId: string) => void
}

const NoKoreanVoice = (): JSX.Element => (
  <div className="space-y-2">
    <p className="text-muted-foreground text-sm">
      This phone has no Korean voice installed, so lessons can&apos;t be read
      aloud. Installing one takes a minute and works offline afterwards.
    </p>
    <Button type="button" variant="outline" onClick={openVoiceInstall}>
      Install a Korean voice
    </Button>
  </div>
)

const VoicePicker = ({
  voices,
  value,
  onChange,
}: DeviceVoiceFieldProps & {
  voices: ReadonlyArray<NativeVoice>
}): JSX.Element => {
  // A chosen voice that has since been uninstalled reads as the default,
  // which is what the phone will actually speak with.
  const selected = voices.some((voice) => voice.id === value)
    ? value
    : PHONE_DEFAULT

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Select
          value={selected}
          onValueChange={(next: string) =>
            onChange(next === PHONE_DEFAULT ? "" : next)
          }
        >
          <SelectTrigger className="min-w-0 flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={PHONE_DEFAULT}>Phone default</SelectItem>
            {voices.map((voice) => (
              <SelectItem key={voice.id} value={voice.id}>
                {voiceLabel(voice)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            previewDeviceVoice(
              selected === PHONE_DEFAULT ? undefined : selected
            )
          }
        >
          Play sample
        </Button>
      </div>
      <p className="text-muted-foreground text-sm">
        Lessons are read aloud by this phone&apos;s own text-to-speech, so
        nothing is sent anywhere. Voices that need internet go silent offline.
      </p>
    </div>
  )
}

const VoiceOutcome = ({
  value,
  onChange,
}: DeviceVoiceFieldProps): JSX.Element =>
  matchQueryOutcome(queryOutcome(useQuery(deviceVoicesQuery)), {
    pending: () => <Skeleton className="h-10 w-full" />,
    failed: (error, retry) => <IntentFailure error={error} onRetry={retry} />,
    ready: ({ installed, voices }: DeviceVoices) =>
      installed && voices.length > 0 ? (
        <VoicePicker voices={voices} value={value} onChange={onChange} />
      ) : (
        <NoKoreanVoice />
      ),
  })

export const DeviceVoiceField = ({
  value,
  onChange,
}: DeviceVoiceFieldProps): JSX.Element => (
  <div className="space-y-2">
    <Label>Voice</Label>
    <VoiceOutcome value={value} onChange={onChange} />
  </div>
)
