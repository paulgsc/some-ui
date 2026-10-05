import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react"
import type { Speaker } from "@some-ui/speech"
import { useQueryClient } from "@tanstack/react-query"
import type {
  EffectExecutor,
  ISessionMachine,
  ITopikMetadataRepository,
  ITopikRepository,
  Message,
  SessionEvent,
  SessionState,
} from "@topik/lib/topik"
import {
  actions,
  createEffectExecutor,
  createSessionMachine,
} from "@topik/lib/topik"
import { createQueryBridge } from "@topik/lib/topik/adapter/server"

export type UseEnhancedSessionConfig = {
  repository: ITopikRepository
  metadataRepository: ITopikMetadataRepository
  /** Null when the host provides no speech session. */
  speaker: Speaker | null
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
  speaker: Speaker | null
}

export function useSession(
  config: UseEnhancedSessionConfig
): UseEnhancedSessionReturn {
  const {
    repository,
    metadataRepository,
    speaker,
    componentId,
    enableTTS = true,
    onBatchComplete,
    onSessionComplete,
    onSpeechStart,
    onSpeechEnd,
    timerInterval,
  } = config

  const queryClient = useQueryClient()

  // AUDIO TTS HOOK

  // MEMOIZED REPOSITORY LOADERS

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

  // MACHINE INSTANCE (stable for the component's lifetime)

  const [machine] = useState<ISessionMachine>(createSessionMachine)
  const executorRef = useRef<EffectExecutor | null>(null)

  // REACT STATE SYNC (external store - no render-time ref reads)

  const subscribe = useCallback(
    (onStoreChange: () => void) => machine.subscribe(onStoreChange),
    [machine]
  )
  const getSnapshot = useCallback(() => machine.getState(), [machine])
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  // TTS STATE

  const [isSpeaking, setIsSpeaking] = useState(false)
  const [currentSpeakingId, setCurrentSpeakingId] = useState<string | null>(
    null
  )

  // STABLE CALLBACK REFS (prevent executor recreation)

  const callbacksRef = useRef({
    onBatchComplete,
    onSessionComplete,
    onSpeechStart,
    onSpeechEnd,
  })

  useEffect(() => {
    callbacksRef.current = {
      onBatchComplete,
      onSessionComplete,
      onSpeechStart,
      onSpeechEnd,
    }
  }, [onBatchComplete, onSessionComplete, onSpeechStart, onSpeechEnd])

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

  // Muted mid-line: nothing is speaking, but the line has not ended, so the
  // caller's onSpeechEnd (which the lesson advances on) is not told.
  const handleSpeechStopped = useCallback(() => {
    setIsSpeaking(false)
    setCurrentSpeakingId(null)
  }, [])

  const handleBatchComplete = useCallback((batchIndex: number) => {
    callbacksRef.current.onBatchComplete?.(batchIndex)
  }, [])

  const handleSessionComplete = useCallback(() => {
    callbacksRef.current.onSessionComplete?.()
  }, [])

  // EXECUTOR EFFECT (only recreate when truly necessary)

  useEffect(() => {
    executorRef.current?.destroy()

    executorRef.current = createEffectExecutor({
      machine,
      repository,
      queryBridge,
      speaker, // Pass the audio TTS instance instead of speech queue
      componentId,
      enableTTS,
      timerInterval,
      onBatchComplete: handleBatchComplete,
      onSessionComplete: handleSessionComplete,
      onSpeechStart: handleSpeechStart,
      onSpeechEnd: handleSpeechEnd,
      onSpeechStopped: handleSpeechStopped,
      onError: (error, effect) => {
        // eslint-disable-next-line no-console
        console.error("[Executor] Error:", effect, error)
      },
    })

    return (): void => {
      executorRef.current?.destroy()
      executorRef.current = null
    }
  }, [
    machine,
    repository,
    queryBridge,
    speaker,
    componentId,
    enableTTS,
    timerInterval,
    handleBatchComplete,
    handleSessionComplete,
    handleSpeechStart,
    handleSpeechEnd,
    handleSpeechStopped,
  ])

  // INITIAL CATALOG LOAD

  useEffect(() => {
    const effects = machine.dispatch(actions.requestCatalog())
    executorRef.current?.execute(effects)
  }, [machine])

  // DISPATCH FUNCTION

  const dispatch = useCallback(
    (event: SessionEvent) => {
      const effects = machine.dispatch(event)
      executorRef.current?.execute(effects)
    },
    [machine]
  )

  // TTS CONTROLS

  const speakMessage = useCallback(async (message: Message) => {
    await executorRef.current?.speakMessage(message)
  }, [])

  // CLEANUP ON UNMOUNT

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
    speaker,
  }
}
