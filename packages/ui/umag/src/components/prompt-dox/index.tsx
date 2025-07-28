import type { FC } from "react"
import { Fragment, useEffect, useState } from "react"
import { MegaphoneSpectrum } from "@umag/components/megaphone-spectrum"
import {
  ErrorBoundaryFallback,
  LoadingCard,
} from "@umag/components/now-playing/now-playing-card"
import { useUtteranceWebSocket } from "@umag/hooks/use-prompt-utterance"
import { useSpeechQueue } from "some-ui-utils"

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
    isConnecting,
    error,
  } = useUtteranceWebSocket()

  const { speak } = useSpeechQueue(COMPONENT_ID)

  // Remove the useCallback entirely and put logic in useEffect
  useEffect(() => {
    const speakContent = async () => {
      if (!text || !isConnected) return

      try {
        const options = {
          volume: 1.0,
          onStart: (): void => {
            setIsSpeaking(true)
          },
          onEnd: (): void => {
            setIsSpeaking(false)
          },
          onError: (error: Error): void => {
            setIsSpeaking(false)
            console.error("TTS Error:", error)
          },
        }

        await speak(text, Infinity, options)
      } catch (error) {
        console.error("Failed to announce topic:", error)
        setIsSpeaking(false)
      }
    }

    speakContent()
  }, [isConnected, text, speak])

  if (error) {
    return showErrorFallback ? (
      <ErrorBoundaryFallback error={error} />
    ) : (
      <Fragment />
    )
  }

  if (isConnecting) {
    return <LoadingCard />
  }

  return <MegaphoneSpectrum className={className} isActive={isSpeaking} />
}
