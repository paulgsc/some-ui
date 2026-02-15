/**
 * Enhanced React Adapter with TTS Support
 *
 */

import { useEffect, useMemo, useRef, useState } from "react"
import type {
  EffectExecutor,
  ISessionMachine,
  ITopikMetadataRepository,
  ITopikRepository,
  Message,
  SessionEvent,
  SessionState,
  SpeechQueueService,
} from "@chat/lib/topik"
import {
  actions,
  createEffectExecutor,
  createSessionMachine,
} from "@chat/lib/topik"
import { createQueryBridge } from "@chat/lib/topik/adapter/server"
import { useQueryClient } from "@tanstack/react-query"

// ═══════════════════════════════════════════════════════════════════════════
// HOOK CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

export type UseEnhancedSessionConfig = {
  repository: ITopikRepository
  metadataRepository: ITopikMetadataRepository

  // TTS configuration
  speechQueue: SpeechQueueService
  componentId: string
  enableTTS: boolean

  // Callbacks
  onBatchComplete?: (batchIndex: number) => void
  onSessionComplete?: () => void
  onSpeechStart?: (messageId: string) => void
  onSpeechEnd?: (messageId: string) => void

  // Timer configuration
  timerInterval?: number
}

export type UseEnhancedSessionReturn = {
  // Core state
  state: SessionState

  // Dispatch function
  dispatch: (event: SessionEvent) => void

  // TTS controls
  speakMessage: (message: Message) => Promise<void>
  isSpeaking: boolean
  currentSpeakingId: string | null

  // Machine reference (for advanced usage)
  machine: ISessionMachine
  repository: ITopikRepository
}

// ═══════════════════════════════════════════════════════════════════════════
// HOOK
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Enhanced React hook with integrated TTS
 *
 * Automatically handles:
 * - Auto-play TTS when messages advance
 * - Race condition safety
 * - Cancellation on pause/stop
 * - Manual speak controls for UI
 */
export function useSession(
  config: UseEnhancedSessionConfig
): UseEnhancedSessionReturn {
  const {
    repository,
    metadataRepository,
    speechQueue,
    componentId,
    enableTTS = true,
    onBatchComplete,
    onSessionComplete,
    onSpeechStart,
    onSpeechEnd,
    timerInterval,
  } = config

  const queryClient = useQueryClient()

  // Create query bridge
  const queryBridge = useMemo(
    () =>
      createQueryBridge(
        queryClient,
        () => metadataRepository.loadCatalog(),
        (key) => repository.load(key)
      ),
    [queryClient, metadataRepository, repository]
  )

  // ═════════════════════════════════════════════════════════════════════════
  // MACHINE INSTANCE - Survives remounts
  // ═════════════════════════════════════════════════════════════════════════

  const machineRef = useRef<ISessionMachine | null>(null)
  const executorRef = useRef<EffectExecutor | null>(null)

  // Create machine only once
  if (!machineRef.current) {
    machineRef.current = createSessionMachine()
  }

  const machine = machineRef.current

  // ═════════════════════════════════════════════════════════════════════════
  // STATE SYNC
  // ═════════════════════════════════════════════════════════════════════════

  const [state, setState] = useState<SessionState>(() => machine.getState())

  useEffect(() => {
    // Sync React state with machine state
    setState(machine.getState())

    // Subscribe to changes
    const unsubscribe = machine.subscribe((newState) => {
      setState(newState)
    })

    return unsubscribe
  }, [machine])

  // ═════════════════════════════════════════════════════════════════════════
  // TTS STATE (from executor)
  // ═════════════════════════════════════════════════════════════════════════

  const [isSpeaking, setIsSpeaking] = useState(false)
  const [currentSpeakingId, setCurrentSpeakingId] = useState<string | null>(
    null
  )

  // ═════════════════════════════════════════════════════════════════════════
  // EXECUTOR - Create/recreate when callbacks change
  // ═════════════════════════════════════════════════════════════════════════

  useEffect(() => {
    // Cleanup previous executor
    if (executorRef.current) {
      executorRef.current.destroy()
    }

    // Create new executor with TTS
    executorRef.current = createEffectExecutor({
      machine,
      repository,
      queryBridge,
      queryClient,
      speechQueue,
      componentId,
      enableTTS,
      timerInterval,

      onBatchComplete,
      onSessionComplete,

      onSpeechStart: (messageId) => {
        setIsSpeaking(true)
        setCurrentSpeakingId(messageId)
        onSpeechStart?.(messageId)
      },

      onSpeechEnd: (messageId) => {
        setIsSpeaking(false)
        setCurrentSpeakingId(null)
        onSpeechEnd?.(messageId)
      },

      onError: (error, effect) => {
        console.error("[Executor] Error:", effect, error)
      },
    })

    return () => {
      executorRef.current?.destroy()
      executorRef.current = null
    }
  }, [
    machine,
    repository,
    queryBridge,
    queryClient,
    speechQueue,
    componentId,
    enableTTS,
    timerInterval,
    onBatchComplete,
    onSessionComplete,
    onSpeechStart,
    onSpeechEnd,
  ])

  // Trigger initial catalog load on mount
  useEffect(() => {
    const effects = machine.dispatch(actions.requestCatalog())
    executorRef.current?.execute(effects)
  }, [machine])

  // ═════════════════════════════════════════════════════════════════════════
  // DISPATCH FUNCTION
  // ═════════════════════════════════════════════════════════════════════════

  const dispatch = useMemo(
    () => (event: SessionEvent) => {
      const effects = machine.dispatch(event)
      executorRef.current?.execute(effects)
    },
    [machine]
  )

  // ═════════════════════════════════════════════════════════════════════════
  // TTS CONTROLS
  // ═════════════════════════════════════════════════════════════════════════

  const speakMessage = useMemo(
    () => async (message: Message) => {
      if (!executorRef.current) return
      await executorRef.current.speakMessage(message)
    },
    []
  )

  // ═════════════════════════════════════════════════════════════════════════
  // AUTO-PLAY TTS EFFECT
  // ═════════════════════════════════════════════════════════════════════════

  // Auto-play is now handled by the executor via PLAY_AUDIO effects
  // The reducer emits PLAY_AUDIO effects when appropriate
  // This keeps the logic in the core, not in React

  // ═════════════════════════════════════════════════════════════════════════
  // CLEANUP
  // ═════════════════════════════════════════════════════════════════════════

  useEffect(() => {
    return (): void => {
      executorRef.current?.destroy()
    }
  }, [])

  return {
    state,
    dispatch,
    speakMessage,
    isSpeaking,
    currentSpeakingId,
    machine,
    repository,
  }
}
