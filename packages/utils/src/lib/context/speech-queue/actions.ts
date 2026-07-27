import type { TTSOptions } from "../../../types/tts-types"
import type { SpeechItem } from "./types"

export type SpeechAction =
  | {
      type: "SPEAK"
      payload: {
        componentId: string
        text: string
        options?: TTSOptions
        maxRetries?: number
      }
      priority?: number
      key?: string
    }
  | { type: "CANCEL"; payload: { componentId?: string; itemId?: string } }
  | { type: "PAUSE" }
  | { type: "RESUME" }
  | { type: "CLEAR" }
  | { type: "ITEM_STARTED"; payload: { item: SpeechItem } }
  | { type: "ITEM_COMPLETED"; payload: { itemId: string } }
  | {
      type: "ITEM_FAILED"
      payload: { itemId: string; error: string; shouldRetry: boolean }
    }
  | { type: "ITEM_CANCELLED"; payload: { itemId: string } }

export const generateId = (): string =>
  `speech_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`

export const createSpeechItem = (
  componentId: string,
  text: string,
  options?: TTSOptions,
  maxRetries = 2,
  priority = 0
): SpeechItem => ({
  id: generateId(),
  componentId,
  text,
  options,
  timestamp: Date.now(),
  retryCount: 0,
  maxRetries,
  priority,
  controller: new AbortController(),
})
