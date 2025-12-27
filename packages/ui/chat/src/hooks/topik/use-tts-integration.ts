import { useCallback, useEffect, useRef, useState } from "react"
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
  isActive: boolean
  isSpeaking: boolean
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
}: UseTTSIntegrationProps): UseTTSSIntegrationReturn {
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false)
  const allocatedIdsRef = useRef<Set<string>>(new Set())
  const priorityCounter = useRef(0)
  const currentSpeakingIdRef = useRef<string | null>(null)
  const isCancelledRef = useRef(false)

  // Store callbacks in ref to avoid stale closures
  const callbacksRef = useRef({
    onSpeakStart,
    onSpeakComplete,
    onSpeakError,
  })

  // Update callbacks ref on every render
  useEffect(() => {
    callbacksRef.current = { onSpeakStart, onSpeakComplete, onSpeakError }
  }, [onSpeakStart, onSpeakComplete, onSpeakError])

  const { isActive, speak, cancel } = useSpeechQueue(componentId)

  const requestSpeak = useCallback(
    async (message: Message, reason: "auto" | "manual") => {
      const allocated = allocatedIdsRef.current

      console.log(`[useTTSIntegration] requestSpeak called:`, {
        messageId: message.id,
        reason,
        alreadyAllocated: allocated.has(message.id),
        currentSpeaking: currentSpeakingIdRef.current,
      })

      // AUTO: fire once per message
      if (reason === "auto" && allocated.has(message.id)) {
        console.log(`[useTTSIntegration] Skipping - already allocated`)
        return
      }

      // MANUAL: always allowed, but cancel current speech
      if (reason === "manual") {
        isCancelledRef.current = true
        cancel()
        allocated.clear()
        currentSpeakingIdRef.current = null
        // Reset cancelled flag after a brief delay
        setTimeout(() => {
          isCancelledRef.current = false
        }, 100)
      }

      // If already speaking this message, don't start again
      if (currentSpeakingIdRef.current === message.id) {
        console.log(
          `[useTTSIntegration] Skipping - already speaking this message`
        )
        return
      }

      try {
        const priority = ++priorityCounter.current
        currentSpeakingIdRef.current = message.id

        await speak(
          message.korean,
          {
            volume: 1.0,
            onStart: (): void => {
              setIsSpeaking(true)
              console.log(`[useTTSIntegration] onStart:`, message.id)
              setIsSpeaking(true)
              allocated.add(message.id)
              callbacksRef.current.onSpeakStart?.()
            },
            onEnd: async () => {
              console.log(`[useTTSIntegration] onEnd:`, message.id)
              // Only fire completion if this is still the current message
              if (currentSpeakingIdRef.current === message.id) {
                currentSpeakingIdRef.current = null
                await callbacksRef.current.onSpeakComplete()
              }
              setIsSpeaking(false)
            },
            onError: (error: Error) => {
              setIsSpeaking(false)
              console.error("[useTTSIntegration] ❌ TTS onError fired", {
                messageId: message.id,
                error: error.message,
              })
              currentSpeakingIdRef.current = null
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
        currentSpeakingIdRef.current = null
        callbacksRef.current.onSpeakError?.(error as Error)
        setIsSpeaking(false)
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

  useEffect(() => {
    if (!isPlaying || !currentMessage) {
      return
    }

    console.log(`[useTTSIntegration] Auto-speak effect triggered:`, {
      messageId: currentMessage.id,
      isPlaying,
    })

    requestSpeak(currentMessage, "auto")
  }, [currentMessage?.id, isPlaying, requestSpeak])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      console.log("[useTTSIntegration] Cleanup - cancelling and clearing")
      cancel()
      allocatedIdsRef.current.clear()
      currentSpeakingIdRef.current = null
    }
  }, [cancel])

  return {
    isActive,
    isSpeaking,
    speakMessage,
    cancelSpeech: cancel,
  }
}
