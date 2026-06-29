import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type {
  EffectExecutor,
  ISessionMachine,
  ITopikMetadataRepository,
  ITopikRepository,
  Message,
  SessionEvent,
  SessionState,
} from "@chat/lib/topik"
import {
  actions,
  createEffectExecutor,
  createSessionMachine,
} from "@chat/lib/topik"
import { createQueryBridge } from "@chat/lib/topik/adapter/server"
import { useQueryClient } from "@tanstack/react-query"
import type { UseAudioTTSReturn } from "some-ui-utils"

export type UseEnhancedSessionConfig = {
  repository: ITopikRepository
  metadataRepository: ITopikMetadataRepository
  audioTTS: UseAudioTTSReturn
  componentId: string
  enableTTS: boolean
  onBatchComplete?: (batchIndex: number) => void
  onSessionComplete?: () => void
  onSpeechStart?: (messageId: string) => void
  onSpeechEnd?: (messageId: string) => void
  timerInterval?: number
}

export type UseEnhancedSessionReturn = {
  state: SessionState
  dispatch: (event: SessionEvent) => void
  speakMessage: (message: Message) => Promise<void>
  isSpeaking: boolean
  currentSpeakingId: string | null
  machine: ISessionMachine
  repository: ITopikRepository
  audioTTS: UseAudioTTSReturn
}

export function useSession(
  config: UseEnhancedSessionConfig
): UseEnhancedSessionReturn {
  const {
    repository,
    metadataRepository,
    audioTTS,
    componentId,
    enableTTS = true,
    onBatchComplete,
    onSessionComplete,
    onSpeechStart,
    onSpeechEnd,
    timerInterval,
  } = config

  const queryClient = useQueryClient()

  // ══════════════════════════════════════════════════════
  // AUDIO TTS HOOK
  // ══════════════════════════════════════════════════════

  // ══════════════════════════════════════════════════════
  // MEMOIZED REPOSITORY LOADERS
  // ══════════════════════════════════════════════════════

  const loadCatalog = useCallback(
    () => metadataRepository.loadCatalog(),
    [metadataRepository]
  )
  const loadKey = useCallback(
    (key: string) => repository.load(key),
    [repository]
  )

  const queryBridge = useMemo(
    () => createQueryBridge(queryClient, loadCatalog, loadKey),
    [queryClient, loadCatalog, loadKey]
  )

  // ══════════════════════════════════════════════════════
  // MACHINE INSTANCE (stable across remounts)
  // ══════════════════════════════════════════════════════

  const [machine] = useState<ISessionMachine>(() => createSessionMachine())
  const executorRef = useRef<EffectExecutor | null>(null)

  // ══════════════════════════════════════════════════════
  // REACT STATE SYNC
  // ══════════════════════════════════════════════════════

  // TODO (future optimization):
  // Consider switching to `useSyncExternalStore` (React 18+) for machine state
  // to eliminate the extra render caused by the initial `setState` in useEffect.
  // This will provide fully synchronous state with minimal re-renders.

  const [state, setState] = useState<SessionState>(() => machine.getState())

  useEffect(() => {
    // Subscribe to machine changes.
    // We do NOT setState here initially, because useState already initializes
    // with the machine's current state. This avoids double render on mount.
    const unsubscribe = machine.subscribe((newState) => setState(newState))
    return unsubscribe
  }, [machine])

  // ══════════════════════════════════════════════════════
  // TTS STATE
  // ══════════════════════════════════════════════════════

  const [isSpeaking, setIsSpeaking] = useState(false)
  const [currentSpeakingId, setCurrentSpeakingId] = useState<string | null>(
    null
  )

  // ══════════════════════════════════════════════════════
  // STABLE CALLBACK REFS (prevent executor recreation)
  // ══════════════════════════════════════════════════════

  const callbacksRef = useRef({
    onBatchComplete,
    onSessionComplete,
    onSpeechStart,
    onSpeechEnd,
  })

  // Update refs when callbacks change (without triggering executor recreation)
  useEffect(() => {
    callbacksRef.current = {
      onBatchComplete,
      onSessionComplete,
      onSpeechStart,
      onSpeechEnd,
    }
  }, [onBatchComplete, onSessionComplete, onSpeechStart, onSpeechEnd])

  // Stable wrapper functions that use the refs
  const handleSpeechStart = useCallback((messageId: string) => {
    setIsSpeaking(true)
    setCurrentSpeakingId(messageId)
    callbacksRef.current.onSpeechStart?.(messageId)
  }, [])

  const handleSpeechEnd = useCallback((messageId: string) => {
    setIsSpeaking(false)
    setCurrentSpeakingId(null)
    callbacksRef.current.onSpeechEnd?.(messageId)
  }, [])

  const handleBatchComplete = useCallback((batchIndex: number) => {
    callbacksRef.current.onBatchComplete?.(batchIndex)
  }, [])

  const handleSessionComplete = useCallback(() => {
    callbacksRef.current.onSessionComplete?.()
  }, [])

  // ══════════════════════════════════════════════════════
  // EXECUTOR EFFECT (only recreate when truly necessary)
  // ══════════════════════════════════════════════════════

  useEffect(() => {
    // Clean up previous executor
    executorRef.current?.destroy()

    // Create new executor with stable callbacks and audio TTS
    executorRef.current = createEffectExecutor({
      machine,
      repository,
      queryBridge,
      audioTTS, // Pass the audio TTS instance instead of speech queue
      componentId,
      enableTTS,
      timerInterval,
      onBatchComplete: handleBatchComplete,
      onSessionComplete: handleSessionComplete,
      onSpeechStart: handleSpeechStart,
      onSpeechEnd: handleSpeechEnd,
      onError: undefined,
    })

    return (): void => {
      executorRef.current?.destroy()
      executorRef.current = null
    }
  }, [
    machine,
    repository,
    queryBridge,
    audioTTS,
    componentId,
    enableTTS,
    timerInterval,
    handleBatchComplete,
    handleSessionComplete,
    handleSpeechStart,
    handleSpeechEnd,
  ])

  // ══════════════════════════════════════════════════════
  // INITIAL CATALOG LOAD
  // ══════════════════════════════════════════════════════

  useEffect(() => {
    const effects = machine.dispatch(actions.requestCatalog())
    executorRef.current?.execute(effects)
  }, [machine])

  // ══════════════════════════════════════════════════════
  // DISPATCH FUNCTION
  // ══════════════════════════════════════════════════════

  const dispatch = useCallback(
    (event: SessionEvent) => {
      const effects = machine.dispatch(event)
      executorRef.current?.execute(effects)
    },
    [machine]
  )

  // ══════════════════════════════════════════════════════
  // TTS CONTROLS
  // ══════════════════════════════════════════════════════

  const speakMessage = useCallback(async (message: Message) => {
    await executorRef.current?.speakMessage(message)
  }, [])

  // ══════════════════════════════════════════════════════
  // CLEANUP ON UNMOUNT
  // ══════════════════════════════════════════════════════

  useEffect(() => {
    return (): void => executorRef.current?.destroy()
  }, [])

  return {
    state,
    dispatch,
    speakMessage,
    isSpeaking,
    currentSpeakingId,
    machine,
    repository,
    audioTTS,
  }
}
