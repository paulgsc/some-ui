import type { FC } from "react"
import { Fragment, useEffect, useState } from "react"
import { MegaphoneSpectrum } from "@umag/components/megaphone-spectrum"
import {
  ErrorBoundaryFallback,
  LoadingCard,
} from "@umag/components/now-playing/now-playing-card"
import { VoiceSelectorTrigger } from "@umag/components/voice-selector"
import { useSpeechQueue, useUtteranceWebSocket } from "some-ui-utils"
import type { TTSOptions, VoiceConfig } from "some-ui-utils"

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

  const {
    speak,
    ttsHook: { voices, selectedVoice },
  } = useSpeechQueue(COMPONENT_ID)
  const [voice, setVoice] = useState<VoiceConfig | null>(selectedVoice)

  // Remove the useCallback entirely and put logic in useEffect
  useEffect(() => {
    const speakContent = async (): Promise<void> => {
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

        await speak(text, options, Infinity)
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error("Failed to announce topic:", error)
        setIsSpeaking(false)
      }
    }

    speakContent()
  }, [isConnected, text, speak, voice])

  if (error) {
    return showErrorFallback ? (
      <ErrorBoundaryFallback error={error} />
    ) : (
      <Fragment />
    )
  }

  if (isInitializing) {
    return <LoadingCard />
  }

  return (
    <VoiceSelectorTrigger
      voices={[...voices]}
      selectedVoice={selectedVoice}
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
