/**
 * @module hooks/use-speech-queue
 *
 * What a component uses to say something.
 *
 * The return type is deliberately free of internals. It used to hand back
 * `ttsHook` (the whole `useAudioTTS` return) and `store` (the raw reducer
 * store), which is how `packages/ui/umag` ended up reaching through the
 * queue into the TTS hook to read `voices` - a consumer holding the exact
 * detail this workspace exists to own. Voices are surfaced directly now,
 * and the adapter behind them stays this package's business.
 */

import { useCallback, useEffect, useId, useMemo } from "react"
import type { SpeechQueueManager, SpeechQueueState } from "@speech/lib/queue"
import { getSpeechQueue } from "@speech/lib/queue"
import type { TTSOptions, VoiceConfig } from "@speech/lib/types/tts-types"

import { useQueueStore } from "./use-queue-store"

export type SpeechQueueActions = {
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
}

export type UseSpeechQueueReturn = SpeechQueueActions & {
  queueState: SpeechQueueState
  isActive: boolean
  isPaused: boolean
  queueSize: number
  currentItem: SpeechQueueState["currentItem"]
  error: string | null
  totalProcessed: number
  totalFailed: number
  /** Voices the resolved adapter offers - browser or backend, same shape. */
  voices: ReadonlyArray<VoiceConfig>
  /** Voice used by utterances that don't carry one. */
  defaultVoice: VoiceConfig | null
  setDefaultVoice: (voice: VoiceConfig | null) => void
}

const selectSelf = (state: SpeechQueueState): SpeechQueueState => state
const selectIsActive = (state: SpeechQueueState): boolean =>
  state.status === "speaking"
const selectIsPaused = (state: SpeechQueueState): boolean =>
  state.status === "paused"
const selectQueueSize = (state: SpeechQueueState): number => state.items.length
const selectCurrentItem = (
  state: SpeechQueueState
): SpeechQueueState["currentItem"] => state.currentItem
const selectError = (state: SpeechQueueState): string | null => state.error
const selectTotalProcessed = (state: SpeechQueueState): number =>
  state.totalProcessed
const selectTotalFailed = (state: SpeechQueueState): number => state.totalFailed

function useQueueActions(
  manager: SpeechQueueManager,
  componentId: string
): SpeechQueueActions {
  // Every utterance this component queued is cancelled when it unmounts -
  // the component that asked for it is gone, and nothing else in the app
  // asked to hear it.
  useEffect(() => {
    return (): void => manager.cancel(componentId)
  }, [manager, componentId])

  const speak = useCallback(
    (text: string, options?: TTSOptions, priority = 0, maxRetries = 2) => {
      manager.speak(componentId, text, options, priority, maxRetries)
    },
    [manager, componentId]
  )

  const cancel = useCallback(
    (itemId?: string) => manager.cancel(componentId, itemId),
    [manager, componentId]
  )

  const pause = useCallback(() => manager.pause(), [manager])
  const resume = useCallback(() => manager.resume(), [manager])
  const clear = useCallback(() => manager.clear(), [manager])

  return useMemo(
    () => ({ speak, cancel, pause, resume, clear }),
    [speak, cancel, pause, resume, clear]
  )
}

export function useSpeechQueue(componentId?: string): UseSpeechQueueReturn {
  const manager = getSpeechQueue()
  const store = manager.getStore()
  const generatedId = useId()
  const actualComponentId = componentId ?? generatedId

  const actions = useQueueActions(manager, actualComponentId)

  const queueState = useQueueStore(store, selectSelf)
  const isActive = useQueueStore(store, selectIsActive)
  const isPaused = useQueueStore(store, selectIsPaused)
  const queueSize = useQueueStore(store, selectQueueSize)
  const currentItem = useQueueStore(store, selectCurrentItem)
  const error = useQueueStore(store, selectError)
  const totalProcessed = useQueueStore(store, selectTotalProcessed)
  const totalFailed = useQueueStore(store, selectTotalFailed)

  const setDefaultVoice = useCallback(
    (voice: VoiceConfig | null) => manager.setDefaultVoice(voice),
    [manager]
  )

  return {
    ...actions,
    queueState,
    isActive,
    isPaused,
    queueSize,
    currentItem,
    error,
    totalProcessed,
    totalFailed,
    voices: manager.getVoices(),
    defaultVoice: manager.getDefaultVoice(),
    setDefaultVoice,
  }
}

/**
 * Actions only - no subscription, so a component that just needs to speak
 * doesn't re-render every time the queue's status changes.
 */
export function useSpeechQueueActions(
  componentId?: string
): SpeechQueueActions {
  const manager = getSpeechQueue()
  const generatedId = useId()
  return useQueueActions(manager, componentId ?? generatedId)
}

export type SpeechQueueMetrics = {
  totalProcessed: number
  totalFailed: number
  currentQueueSize: number
  isActive: boolean
  isPaused: boolean
  hasError: boolean
  error: string | null
}

const selectMetrics = (state: SpeechQueueState): SpeechQueueMetrics => ({
  totalProcessed: state.totalProcessed,
  totalFailed: state.totalFailed,
  currentQueueSize: state.items.length,
  isActive: state.status === "speaking",
  isPaused: state.status === "paused",
  hasError: state.error !== null,
  error: state.error,
})

export function useSpeechQueueMetrics(): SpeechQueueMetrics {
  return useQueueStore(getSpeechQueue().getStore(), selectMetrics)
}
