import { useCallback, useEffect, useRef, useState } from "react"
import type { SessionPhase } from "@chat/lib/topik/session-reducer"
import type { Message } from "@chat/types/topik"
import { useSpeechQueue } from "some-ui-utils"

type UseTTSProps = {
  componentId: string
  currentMessage: Message | undefined
  phase: SessionPhase
  onMessageComplete: () => void
}

type UseTTSReturn = {
  isSpeaking: boolean
  speakMessage: (message: Message) => Promise<void>
  cancelSpeech: () => void
}

/**
 * Simplified TTS hook that:
 * 1. Auto-speaks currentMessage when isPlaying
 * 2. Fires onMessageComplete when done
 * 3. Provides manual speakMessage for UI controls
 */
export function useTTS({
  componentId,
  currentMessage,
  phase,
  onMessageComplete,
}: UseTTSProps): UseTTSReturn {
  const [isSpeaking, setIsSpeaking] = useState(false)
  const lastSpokenIdRef = useRef<string | null>(null)
  const priorityCounterRef = useRef(0)

  const { speak, cancel } = useSpeechQueue(componentId)

  // Stable callback ref to avoid stale closures
  const onMessageCompleteRef = useRef(onMessageComplete)
  useEffect(() => {
    onMessageCompleteRef.current = onMessageComplete
  }, [onMessageComplete])

  /**
   * Core speak function - used by both auto and manual triggers
   */
  const doSpeak = useCallback(
    async (message: Message, isAuto: boolean) => {
      // If auto-speaking and already spoken, skip
      if (isAuto && lastSpokenIdRef.current === message.id) {
        return
      }

      try {
        const priority = ++priorityCounterRef.current

        await speak(
          message.korean,
          {
            volume: 1.0,
            onStart: () => {
              setIsSpeaking(true)
              // eslint-disable-next-line no-console
              console.log(`[useTTS] 🔊 Speaking: ${message.id}`)
            },
            onEnd: () => {
              setIsSpeaking(false)
              // eslint-disable-next-line no-console
              console.log(`[useTTS] ✅ Complete: ${message.id}`)

              // Mark as spoken (for auto-play deduplication)
              lastSpokenIdRef.current = message.id

              // Only fire completion callback for auto-play
              if (isAuto) {
                onMessageCompleteRef.current()
              }
            },
            onError: (error: Error) => {
              setIsSpeaking(false)
              // eslint-disable-next-line no-console
              console.error(`[useTTS] ❌ Error: ${message.id}`, error)
            },
          },
          priority
        )
      } catch (error) {
        setIsSpeaking(false)
        // eslint-disable-next-line no-console
        console.error(`[useTTS] ❌ speak() threw:`, error)
      }
    },
    [speak]
  )

  /**
   * Manual speak API - for UI controls
   * Cancels current speech and speaks immediately
   */
  const speakMessage = useCallback(
    async (message: Message) => {
      cancel()
      lastSpokenIdRef.current = null // Allow re-speaking
      await doSpeak(message, false)
    },
    [cancel, doSpeak]
  )

  /**
   * Auto-speak effect - fires when message changes while playing
   */
  useEffect(() => {
    if (!currentMessage) return
    if (phase !== "chatPlaying") {
      return
    }

    // eslint-disable-next-line no-console
    console.log(`[useTTS] 🎯 Auto-speak triggered: ${currentMessage.id}`)
    doSpeak(currentMessage, true)
  }, [currentMessage?.id, phase, doSpeak])

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return (): void => {
      // eslint-disable-next-line no-console
      console.log("[useTTS] 🧹 Cleanup")
      cancel()
      lastSpokenIdRef.current = null
    }
  }, [cancel])

  return {
    isSpeaking,
    speakMessage,
    cancelSpeech: cancel,
  }
}
