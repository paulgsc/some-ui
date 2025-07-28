import type { FC } from "react"
import { Fragment, useCallback, useEffect, useState } from "react"
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

  const { speak, isActive, pauseQueue, resumeQueue } =
    useSpeechQueue(COMPONENT_ID)

  const speakContent = useCallback(async () => {
    if (!text) return // Avoid speaking empty text

    try {
      const options = {
        volume: 1.0,
        onStart: (): void => {
          setIsSpeaking(true)
        },
        onEnd: (): void => {
          setIsSpeaking(false)
          resumeQueue()
        },
        onError: (error: Error): void => {
          setIsSpeaking(false)
          console.error("TTS Error:", error)
        },
      }

      // if (isActive) pauseQueue()
      await speak(text, Infinity, options)
    } catch (error) {
      console.error("Failed to announce topic:", error)
      setIsSpeaking(false)
    }
  }, [text, speak, pauseQueue, isActive])

  // Trigger speech when new text arrives
  useEffect(() => {
    if (isConnected && text) {
      speakContent()
    }
  }, [isConnected, text, speakContent])

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

  return (
      <MegaphoneSpectrum className={className} isActive={isSpeaking} />
  )
}
