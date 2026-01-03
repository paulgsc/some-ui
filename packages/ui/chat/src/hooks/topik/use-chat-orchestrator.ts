import { useEffect, useMemo } from "react"
import type { ChatPlayState, Message } from "@chat/types/topik"

import { useTTSIntegration } from "./use-tts-integration"

type UseChatOrchestratorProps = {
  messages: Array<Message>
  currentMessageIndex: number
  playState: ChatPlayState
  onMessageComplete: () => void
  componentId: string
}

type UseChatOrchestratorReturn = {
  speakMessage: (message: Message) => Promise<void>
  isSpeaking: boolean
  visibleMessages: Array<Message>
}

/**
 * Orchestrates chat playback using the TTS queue as the source of truth.
 *
 * Responsibilities:
 * - Decide *what* message should be spoken
 * - Advance message index only after TTS completion
 * - Expose derived playback state for UI
 *
 * Non-responsibilities:
 * - Managing speech lifecycle
 * - Tracking speaking state manually
 */
export function useChatOrchestrator({
  messages,
  currentMessageIndex,
  playState,
  onMessageComplete,
  componentId,
}: UseChatOrchestratorProps): UseChatOrchestratorReturn {
  const currentMessage = messages[currentMessageIndex] ?? null
  const isPlaying = playState === "playing"

  const { speakMessage, isSpeaking } = useTTSIntegration({
    componentId,
    currentMessage,
    isPlaying,
    onSpeakComplete: onMessageComplete,
    onSpeakStart: () => {},
    onSpeakError: (error) => {
      console.error(`[${componentId}] ❌ TTS error`, error)
    },
  })

  // Messages that should be visible in the UI
  const visibleMessages = useMemo(
    () => messages.slice(0, currentMessageIndex + 1),
    [messages, currentMessageIndex]
  )

  // Orchestrator-level diagnostics
  useEffect(() => {}, [
    componentId,
    playState,
    isPlaying,
    isSpeaking,
    currentMessageIndex,
    messages.length,
    currentMessage,
  ])

  return {
    speakMessage,
    isSpeaking,
    visibleMessages,
  }
}
