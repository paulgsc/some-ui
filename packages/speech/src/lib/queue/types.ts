import type { TTSOptions } from "@speech/lib/types/tts-types"

export type SpeechItem = {
  id: string
  componentId: string
  text: string
  options?: TTSOptions
  timestamp: number
  retryCount: number
  maxRetries: number
  controller: AbortController
  priority: number
}

export type SpeechQueueState = {
  items: Array<SpeechItem>
  currentItem: SpeechItem | null
  status: "idle" | "speaking" | "paused" | "error"
  error: string | null
  totalProcessed: number
  totalFailed: number
}
