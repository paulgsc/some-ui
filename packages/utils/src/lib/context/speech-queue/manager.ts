import { createStore } from "@utils/lib/context"
import type { Store } from "@utils/lib/context/ochestra/ochestrated-store"
import type { TTSOptions, UseAudioTTSReturn } from "@utils/types/tts-types"

import type { SpeechAction } from "./actions"
import { speechReducer } from "./reducer"
import type { SpeechQueueState } from "./types"

export class SpeechQueueManager {
  private store: Store<SpeechQueueState, SpeechAction>
  private ttsHook: UseAudioTTSReturn
  private processingTimeout: NodeJS.Timeout | null = null

  constructor(ttsHook: UseAudioTTSReturn) {
    this.ttsHook = ttsHook

    const initialState: SpeechQueueState = {
      items: [],
      currentItem: null,
      status: "idle",
      error: null,
      totalProcessed: 0,
      totalFailed: 0,
    }

    this.store = createStore(initialState, speechReducer)
    this.startProcessor()
  }

  private startProcessor(): void {
    this.store.subscribe(
      (state) => ({
        items: state.items,
        currentItem: state.currentItem,
        status: state.status,
      }),
      () => {
        if (this.processingTimeout) return
        this.processingTimeout = setTimeout(() => {
          this.processingTimeout = null
          this.processNext()
        }, 0)
      }
    )
  }

  private async processNext(): Promise<void> {
    const state = this.store.get()

    if (
      state.status === "paused" ||
      state.currentItem ||
      state.items.length === 0
    ) {
      return
    }

    const nextItem = state.items[0]
    if (!nextItem) return

    this.store.dispatch({
      type: "ITEM_STARTED",
      payload: { item: nextItem },
    })

    try {
      if (nextItem.controller.signal.aborted) {
        throw new DOMException("Aborted", "AbortError")
      }

      if (nextItem.options) {
        this.ttsHook.updateOptions(nextItem.options)
      }

      await this.ttsHook.speak(nextItem.text)

      if (nextItem.controller.signal.aborted) {
        throw new DOMException("Aborted", "AbortError")
      }

      this.store.dispatch({
        type: "ITEM_COMPLETED",
        payload: { itemId: nextItem.id },
      })
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))

      if (err.name === "AbortError") {
        this.store.dispatch({
          type: "ITEM_CANCELLED",
          payload: { itemId: nextItem.id },
        })
      } else {
        const shouldRetry = nextItem.retryCount < nextItem.maxRetries
        this.store.dispatch({
          type: "ITEM_FAILED",
          payload: {
            itemId: nextItem.id,
            error: err.message,
            shouldRetry,
          },
        })
      }
    }
  }

  speak(
    componentId: string,
    text: string,
    options?: TTSOptions,
    priority = 0,
    maxRetries = 2
  ): void {
    const state = this.store.get()
    const current = state.currentItem

    if (current && priority > current.priority) {
      // Interrupt: abort the current one
      current.controller.abort()
      this.ttsHook.stop()
      // Push the new item to the *front* of the queue
      this.store.dispatch({
        type: "SPEAK",
        payload: { componentId, text, options, maxRetries },
        priority,
        key: `${componentId}-${text}`,
      })
      return
    }

    // Normal path (just enqueue by priority)
    this.store.dispatch({
      type: "SPEAK",
      payload: { componentId, text, options, maxRetries },
      priority,
      key: `${componentId}-${text}`,
    })
  }

  cancel(componentId?: string, itemId?: string): void {
    this.store.dispatch({
      type: "CANCEL",
      payload: { componentId, itemId },
    })
    this.ttsHook.stop()
  }

  pause(): void {
    this.store.dispatch({ type: "PAUSE" })
    this.ttsHook.pause()
  }

  resume(): void {
    this.store.dispatch({ type: "RESUME" })
    this.ttsHook.resume()
  }

  clear(): void {
    this.store.dispatch({ type: "CLEAR" })
    this.ttsHook.stop()
  }

  getStore(): Store<SpeechQueueState, SpeechAction> {
    return this.store
  }

  getTTSHook(): UseAudioTTSReturn {
    return this.ttsHook
  }
}
