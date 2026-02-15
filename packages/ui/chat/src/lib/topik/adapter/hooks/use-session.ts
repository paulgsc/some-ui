import { useCallback, useEffect, useMemo, useRef, useState } from "react"
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

export type UseEnhancedSessionConfig = {
  repository: ITopikRepository
  metadataRepository: ITopikMetadataRepository
  speechQueue: SpeechQueueService
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
}

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

  const machineRef = useRef<ISessionMachine | null>(null)
  const executorRef = useRef<EffectExecutor | null>(null)

  if (!machineRef.current) {
    machineRef.current = createSessionMachine()
  }

  const machine = machineRef.current

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

  const handleSpeechStart = useCallback(
    (messageId: string) => {
      setIsSpeaking(true)
      setCurrentSpeakingId(messageId)
      onSpeechStart?.(messageId)
    },
    [onSpeechStart]
  )

  const handleSpeechEnd = useCallback(
    (messageId: string) => {
      setIsSpeaking(false)
      setCurrentSpeakingId(null)
      onSpeechEnd?.(messageId)
    },
    [onSpeechEnd]
  )

  // ══════════════════════════════════════════════════════
  // EXECUTOR EFFECT
  // ══════════════════════════════════════════════════════

  useEffect(() => {
    executorRef.current?.destroy()

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
      onSpeechStart: handleSpeechStart,
      onSpeechEnd: handleSpeechEnd,
      onError: (error, effect) =>
        console.error("[Executor] Error:", effect, error),
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
    return () => executorRef.current?.destroy()
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
