import type { FC } from "react"
import { useEffect, useState } from "react"
import { useSpeechQueue } from "@some-ui/speech"
import type { TTSOptions, VoiceConfig } from "@some-ui/speech"
import { MegaphoneSpectrum } from "@umag/components/megaphone-spectrum"
import {
  ErrorBoundaryFallback,
  LoadingCard,
} from "@umag/components/now-playing/now-playing-card"
import { VoiceSelectorTrigger } from "@umag/components/voice-selector"
import { useUtteranceWebSocket } from "@umag/hooks/prompt-utterance"

type DoxPromptProps = {
  className?: string
  showErrorFallback?: boolean
}

const COMPONENT_ID = "utterance"

export const DoxPrompt: FC<DoxPromptProps> = ({
  className,
  showErrorFallback = false,
}) => {
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false)

  const {
    prompt: { text },
    isConnected,
    isInitializing,
    error,
  } = useUtteranceWebSocket({
    url: `ws://${window.location.hostname}:3000/ws`,
  })

  // `voices`/`defaultVoice` come straight off the queue now. This used to
  // read them through `ttsHook`, the whole `useAudioTTS` return that
  // `useSpeechQueue` handed back - a consumer holding the TTS internals it
  // has no business knowing about.
  const { speak, voices, defaultVoice } = useSpeechQueue(COMPONENT_ID)
  const [voice, setVoice] = useState<VoiceConfig | null>(defaultVoice)

  // Remove the useCallback entirely and put logic in useEffect
  useEffect(() => {
    const speakContent = (): void => {
      if (!text || !isConnected || !voice) return

      try {
        const options: TTSOptions = {
          volume: 1.0,
          voice,
          onStart: (): void => {
            setIsSpeaking(true)
          },
          onEnd: (): void => {
            setIsSpeaking(false)
          },
          onError: (error: Error): void => {
            setIsSpeaking(false)
            // eslint-disable-next-line no-console
            console.error("TTS Error:", error)
          },
        }

        speak(text, options, Infinity)
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error("Failed to announce topic:", error)
        setIsSpeaking(false)
      }
    }

    speakContent()
  }, [isConnected, text, speak, voice])

  if (error) {
    return showErrorFallback ? <ErrorBoundaryFallback error={error} /> : null
  }

  if (isInitializing) {
    return <LoadingCard />
  }

  return (
    <VoiceSelectorTrigger
      voices={[...voices]}
      selectedVoice={defaultVoice}
      onVoiceSelect={(voice) => {
        setVoice(voice)
      }}
      className={className}
    >
      <p> voice {voice?.name} </p>
      <MegaphoneSpectrum className="size-full" isActive={isSpeaking} />
    </VoiceSelectorTrigger>
  )
}
