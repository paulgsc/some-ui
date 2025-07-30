import { useCallback, useEffect, useState } from "react"
import type { TTSOptions, UseAudioTTSReturn } from "@utils/types/tts-types"

import { createEventBus } from "./event-bus"
import type { QueueState } from "./event-queue"
import { createSpeechQueue } from "./event-queue"

// Updated global event types
type AppEventMap = {
  "speech:request": {
    componentId: string
    text: string
    priority?: number
    options?: TTSOptions
  }
  "speech:cancel": { componentId: string; itemId?: string }
  "speech:queue:status": { status: string; queueSize: number }
  "component:mounted": { componentId: string }
  "component:unmounted": { componentId: string }
}

// Create application-wide event bus
const appEventBus = createEventBus<AppEventMap>()

// Speech Context Manager - now requires a TTS hook
class SpeechContextManager {
  private componentItems = new Map<string, Set<string>>() // componentId -> itemIds
  private speechQueue: ReturnType<typeof createSpeechQueue>
  private ttsHook: UseAudioTTSReturn

  constructor(ttsHook: UseAudioTTSReturn) {
    this.ttsHook = ttsHook

    // Create the speech queue with the TTS hook
    this.speechQueue = createSpeechQueue(this.ttsHook, {
      maxSize: 5,
      maxRetries: 2,
      strategy: "greedy", // Latest speech interrupts older ones
      overflow: "priority",
    })

    this.setupEventListeners()
  }

  private setupEventListeners(): void {
    // Listen for speech requests from components
    appEventBus.on(
      "speech:request",
      ({ componentId, text, priority = 0, options }) => {
        const itemId = this.speechQueue.enqueue({
          payload: {
            text,
            options: {
              ...options,
              volume: options?.volume ?? 0.8,
              playbackRate: options?.playbackRate ?? 1.0,
            },
          },
          componentId,
          priority,
          maxRetries: 2,
        })

        // Track which component owns this item
        if (!this.componentItems.has(componentId)) {
          this.componentItems.set(componentId, new Set())
        }
        this.componentItems.get(componentId)!.add(itemId)
        this.emitQueueStatus()
      }
    )

    // Listen for cancellation requests
    appEventBus.on("speech:cancel", ({ componentId, itemId }) => {
      if (itemId) {
        this.speechQueue.cancel(itemId)
        this.componentItems.get(componentId)?.delete(itemId)
      } else {
        // Cancel all items for this component
        const items = this.componentItems.get(componentId) ?? new Set()
        items.forEach((id) => this.speechQueue.cancel(id))
        this.componentItems.set(componentId, new Set())
      }
      this.emitQueueStatus()
    })

    // Clean up when components unmount
    appEventBus.on("component:unmounted", ({ componentId }) => {
      const items = this.componentItems.get(componentId) ?? new Set()
      items.forEach((id) => this.speechQueue.cancel(id))
      this.componentItems.delete(componentId)
      this.emitQueueStatus()
    })

    // Listen to queue events and forward to app bus
    this.speechQueue.on("queue:state:changed", (state: QueueState) => {
      appEventBus.emit("speech:queue:status", {
        status: state.status,
        queueSize: state.size,
      })
    })

    // Clean up item tracking when items are removed
    this.speechQueue.on(
      "queue:item:removed",
      ({
        id,
      }: {
        id: string
        reason: "completed" | "failed" | "cancelled" | "overflow"
      }) => {
        for (const [_, items] of this.componentItems.entries()) {
          if (items.has(id)) {
            items.delete(id)
            break
          }
        }
      }
    )
  }

  private emitQueueStatus(): void {
    const state = this.speechQueue.getState()
    appEventBus.emit("speech:queue:status", {
      status: state.status,
      queueSize: state.size,
    })
  }

  // Public methods for direct control
  pauseQueue(): void {
    this.speechQueue.pause()
  }

  resumeQueue(): void {
    this.speechQueue.resume()
  }

  clearQueue(): void {
    this.speechQueue.clear()
    this.componentItems.clear()
  }

  getQueueStatus(): QueueState {
    return this.speechQueue.getState()
  }

  getQueue() {
    return this.speechQueue
  }

  // Direct access to TTS hook for advanced control
  getTTSHook(): UseAudioTTSReturn {
    return this.ttsHook
  }
}

// Factory function to create the manager with a TTS hook
export function createSpeechContextManager(
  ttsHook: UseAudioTTSReturn
): SpeechContextManager {
  return new SpeechContextManager(ttsHook)
}

// Global instance - will be created later
let speechContext: SpeechContextManager | null = null

// Initialize function to be called from your app root
export function initializeSpeechContext(
  ttsHook: UseAudioTTSReturn
): SpeechContextManager {
  if (speechContext) {
    console.warn("Speech context already initialized")
    return speechContext
  }

  speechContext = createSpeechContextManager(ttsHook)
  return speechContext
}

// Get the initialized speech context
export function getSpeechContext(): SpeechContextManager {
  if (!speechContext) {
    throw new Error(
      "Speech context not initialized. Call initializeSpeechContext() first."
    )
  }
  return speechContext
}

// Updated hook for React components
export function useSpeechQueue(componentId: string) {
  const context = getSpeechContext()

  // Register component on mount
  useEffect(() => {
    appEventBus.emit("component:mounted", { componentId })

    return (): void => {
      appEventBus.emit("component:unmounted", { componentId })
    }
  }, [componentId])

  // Speech queue status
  const [queueStatus, setQueueStatus] = useState(() => context.getQueueStatus())

  useEffect(() => {
    // Fix: Remove unused parameter to avoid TS6133 error
    return appEventBus.on("speech:queue:status", () => {
      setQueueStatus(context.getQueueStatus())
    })
  }, [context])

  // Functions for component to use
  const speak = useCallback(
    (
      text: string,
      priority = 0,
      options?: AppEventMap["speech:request"]["options"]
    ) => {
      appEventBus.emit("speech:request", {
        componentId,
        text,
        priority,
        options,
      })
    },
    [componentId]
  )

  const cancelSpeech = useCallback(
    (itemId?: string) => {
      appEventBus.emit("speech:cancel", { componentId, itemId })
    },
    [componentId]
  )

  const pauseQueue = useCallback(() => {
    context.pauseQueue()
  }, [context])

  const resumeQueue = useCallback(() => {
    context.resumeQueue()
  }, [context])

  return {
    speak,
    cancelSpeech,
    pauseQueue,
    resumeQueue,
    queueStatus,
    isActive: queueStatus.status === "processing",
    isPaused: queueStatus.status === "paused",
    queueSize: queueStatus.size,
    // Access to the underlying TTS hook for advanced usage
    ttsHook: context.getTTSHook(),
  }
}

// Updated metrics hook
export function useSpeechQueueMetrics() {
  const context = getSpeechContext()
  const speechQueue = context.getQueue()

  const [metrics, setMetrics] = useState({
    totalProcessed: 0,
    totalFailed: 0,
    averageQueueSize: 0,
    currentQueueSize: 0,
  })

  useEffect(() => {
    let processedCount = 0
    let failedCount = 0
    let queueSizeSamples: Array<number> = []

    // Check if speechQueue has event methods before using them
    if (typeof speechQueue.on !== "function") {
      console.warn("Speech queue does not support event listeners")
      return
    }

    const unsubscribeCompleted = speechQueue.on(
      "queue:item:removed",
      ({
        reason,
      }: {
        reason: "completed" | "failed" | "cancelled" | "overflow"
      }) => {
        if (reason === "completed") {
          processedCount++
        } else if (reason === "failed") {
          failedCount++
        }
      }
    )

    const unsubscribeState = speechQueue.on(
      "queue:state:changed",
      (state: QueueState) => {
        queueSizeSamples.push(state.size)

        // Keep only last 100 samples for rolling average
        if (queueSizeSamples.length > 100) {
          queueSizeSamples = queueSizeSamples.slice(-100)
        }

        const avgQueueSize =
          queueSizeSamples.reduce((a, b) => a + b, 0) / queueSizeSamples.length

        setMetrics({
          totalProcessed: processedCount,
          totalFailed: failedCount,
          averageQueueSize: Math.round(avgQueueSize * 100) / 100,
          currentQueueSize: state.size,
        })
      }
    )

    return (): void => {
      if (typeof unsubscribeCompleted === "function") {
        unsubscribeCompleted()
      }
      if (typeof unsubscribeState === "function") {
        unsubscribeState()
      }
    }
  }, [speechQueue])

  return metrics
}

export { appEventBus }
