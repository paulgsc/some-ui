import { useCallback, useEffect, useRef } from "react"
import type { Message } from "@chat/types/topik"
import { useSpeechQueue } from "some-ui-utils"

type UseTTSIntegrationProps = {
  componentId: string
  currentMessage?: Message
  isPlaying: boolean
  onSpeakComplete: () => void
  onSpeakStart?: () => void
  onSpeakError?: (error: Error) => void
}

type UseTTSSIntegrationReturn = {
  speakMessage: (message: Message) => Promise<void>
  cancelSpeech: () => void
}

export function useTTSIntegration({
  componentId,
  currentMessage,
  isPlaying,
  onSpeakComplete,
  onSpeakStart,
  onSpeakError,
}: UseTTSIntegrationProps): UseTTSIntegrationReturn {
  const allocatedIdsRef = useRef<Set<string>>(new Set())
  const priorityCounter = useRef(0)
  const callbacksRef = useRef({
    onSpeakStart,
    onSpeakComplete,
    onSpeakError,
  })

  useEffect(() => {
    callbacksRef.current = { onSpeakStart, onSpeakComplete, onSpeakError }

    return (): void => {
      allocatedIdsRef.current.clear()
    }
  }, [onSpeakStart, onSpeakComplete, onSpeakError])

  const { speak, cancel, isActive, currentItem } = useSpeechQueue(componentId)

  const requestSpeak = useCallback(
    async (message: Message, reason: "auto" | "manual") => {
      const allocated = allocatedIdsRef.current

      // AUTO: fire once per message
      if (reason === "auto" && allocated.has(message.id)) {
        return
      }

      // MANUAL: always allowed, but cancel current speech
      if (reason === "manual") {
        cancel()
        // Clear allocation on manual restart
        allocated.clear()
      }

      try {
        const priority = ++priorityCounter.current

        await speak(
          message.korean,
          {
            volume: 1.0,
            onStart: (): void => {
              allocated.add(message.id)
              callbacksRef.current.onSpeakStart?.()
            },
            onEnd: () => {
              callbacksRef.current.onSpeakComplete()
            },
            onError: (error: Error) => {
              console.error("[useTTSIntegration] ❌ TTS onError fired", {
                messageId: message.id,
                error: error.message,
              })
              callbacksRef.current.onSpeakError?.(error)
              cancel()
            },
          },
          priority
        )
      } catch (error) {
        console.error("[useTTSIntegration] ❌ speak() threw error:", {
          messageId: message.id,
          error: (error as Error).message,
          stack: (error as Error).stack,
        })
        callbacksRef.current.onSpeakError?.(error as Error)
        cancel()
      }
    },
    [speak, cancel]
  )

  // Manual speak API
  const speakMessage = useCallback(
    async (message: Message) => {
      return requestSpeak(message, "manual")
    },
    [requestSpeak]
  )

  // Auto-speak effect
  useEffect(() => {
    if (!isPlaying || !currentMessage) {
      cancel()
      return
    }
    requestSpeak(currentMessage, "auto")
  }, [currentMessage?.id, isPlaying, requestSpeak])

  return {
    speakMessage,
    cancelSpeech: cancel,
  }
}
