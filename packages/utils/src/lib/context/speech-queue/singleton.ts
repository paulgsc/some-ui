import type { UseAudioTTSReturn } from "@utils/types/tts-types"

import { SpeechQueueManager } from "./manager"

let globalSpeechManager: SpeechQueueManager | null = null

export function initializeSpeechQueue(
  ttsHook: UseAudioTTSReturn
): SpeechQueueManager {
  if (globalSpeechManager) {
    // eslint-disable-next-line no-console
    console.warn("Speech queue already initialized")
    return globalSpeechManager
  }

  globalSpeechManager = new SpeechQueueManager(ttsHook)
  return globalSpeechManager
}

export function getSpeechQueue(): SpeechQueueManager {
  if (!globalSpeechManager) {
    throw new Error(
      "Speech queue not initialized. Call initializeSpeechQueue() first."
    )
  }
  return globalSpeechManager
}
