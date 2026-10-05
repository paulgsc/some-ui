import type { TTSOptions } from "@speech/lib/types/tts-types"

import type { SpeechItem } from "./types"

export type SpeechAction =
  | {
      type: "SPEAK"
      payload: {
        componentId: string
        text: string
        options?: TTSOptions
        maxRetries?: number
        /** Given when the caller tracks the item (a speaker's line). */
        id?: string
      }
      priority?: number
      key?: string
    }
  /**
   * An interrupted item goes back to the front of its priority band, to be
   * said again from the start once the interruption has played.
   */
  | { type: "REQUEUE"; payload: { item: SpeechItem } }
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
  priority = 0,
  id: string = generateId()
): SpeechItem => ({
  id,
  componentId,
  text,
  options,
  timestamp: Date.now(),
  retryCount: 0,
  maxRetries,
  priority,
  controller: new AbortController(),
})
