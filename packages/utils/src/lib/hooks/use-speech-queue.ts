import { useMemo, useCallback, useEffect, useId } from "react"
import { useStore } from "@utils/lib/context"
import type { Store } from "@utils/lib/context/ochestra/ochestrated-store"
import { getSpeechQueue } from "@utils/lib/context/speech-queue"
import type { SpeechAction } from "@utils/lib/context/speech-queue/actions"
import type { SpeechQueueState } from "@utils/lib/context/speech-queue/types"
import type { TTSOptions, UseAudioTTSReturn } from "@utils/types/tts-types"

type UseSpeechQueueReturn = {
  // Actions
  speak: (
    text: string,
    options?: TTSOptions,
    priority?: number,
    maxRetries?: number
  ) => void
  cancel: (itemId?: string) => void
  pause: () => void
  resume: () => void
  clear: () => void

  // State values
  queueState: SpeechQueueState
  isActive: boolean
  isPaused: boolean
  queueSize: number
  currentItem: SpeechQueueState["currentItem"]
  error: string | null
  totalProcessed: number
  totalFailed: number

  // Advanced access
  ttsHook: UseAudioTTSReturn
  store: Store<SpeechQueueState, SpeechAction>
}

export function useSpeechQueue(componentId?: string): UseSpeechQueueReturn {
  const manager = getSpeechQueue()
  const store = manager.getStore()
  const autoComponentId = useId()
  const actualComponentId = componentId ?? autoComponentId

  const queueState = useStore(store, (state) => state)
  const isActive = useStore(store, (state) => state.status === "speaking")
  const isPaused = useStore(store, (state) => state.status === "paused")
  const queueSize = useStore(store, (state) => state.items.length)
  const currentItem = useStore(store, (state) => state.currentItem)

  useEffect(() => {
    return (): void => {
      manager.cancel(actualComponentId)
    }
  }, [manager, actualComponentId])

  const speak = useCallback(
    (text: string, options?: TTSOptions, priority = 0, maxRetries = 2) => {
      manager.speak(actualComponentId, text, options, priority, maxRetries)
    },
    [manager, actualComponentId]
  )

  const cancel = useCallback(
    (itemId?: string) => {
      manager.cancel(actualComponentId, itemId)
    },
    [manager, actualComponentId]
  )

  const pause = useCallback(() => {
    manager.pause()
  }, [manager])

  const resume = useCallback(() => {
    manager.resume()
  }, [manager])

  const clear = useCallback(() => {
    manager.clear()
  }, [manager])

  return {
    speak,
    cancel,
    pause,
    resume,
    clear,
    queueState,
    isActive,
    isPaused,
    queueSize,
    currentItem,
    error: queueState.error,
    totalProcessed: queueState.totalProcessed,
    totalFailed: queueState.totalFailed,
    ttsHook: manager.getTTSHook(),
    store,
  }
}

type UseSpeechQueueMetricsReturn = {
  totalProcessed: number
  totalFailed: number
  currentQueueSize: number
  isActive: boolean
  isPaused: boolean
  hasError: boolean
  error: string | null
}

export function useSpeechQueueMetrics(): UseSpeechQueueMetricsReturn {
  const manager = getSpeechQueue()
  const store = manager.getStore()

  return useStore(store, (state) => ({
    totalProcessed: state.totalProcessed,
    totalFailed: state.totalFailed,
    currentQueueSize: state.items.length,
    isActive: state.status === "speaking",
    isPaused: state.status === "paused",
    hasError: !!state.error,
    error: state.error,
  }))
}

export function useSpeechQueueActions(componentId?: string) {
  const manager = getSpeechQueue()
  const autoComponentId = useId()
  const actualComponentId = componentId ?? autoComponentId

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      manager.cancel(actualComponentId)
    }
  }, [manager, actualComponentId])

  // Stable callbacks
  const speak = useCallback(
    (text: string, options?: TTSOptions, priority = 0, maxRetries = 2) => {
      manager.speak(actualComponentId, text, options, priority, maxRetries)
    },
    [manager, actualComponentId]
  )

  const cancel = useCallback(
    (itemId?: string) => {
      manager.cancel(actualComponentId, itemId)
    },
    [manager, actualComponentId]
  )

  const pause = useCallback(() => {
    manager.pause()
  }, [manager])

  const resume = useCallback(() => {
    manager.resume()
  }, [manager])

  const clear = useCallback(() => {
    manager.clear()
  }, [manager])

  // Return a MEMOIZED object so reference is stable
  return useMemo(
    () => ({
      speak,
      cancel,
      pause,
      resume,
      clear,
    }),
    [speak, cancel, pause, resume, clear]
  )
}
