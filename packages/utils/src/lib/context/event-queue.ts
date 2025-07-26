// Event Queue Context Manager with Type-Safe State Pattern
// Built on top of the EventBus for speech API coordination

import type {
  UseAudioTTSReturn,
  VoiceConfig,
} from "@utils/lib/hooks/use-text-to-speech"

import { createEventBus } from "./event-bus"

// Core queue event types
type QueueEventMap = {
  "queue:item:added": QueueItem
  "queue:item:removed": {
    id: string
    reason: "completed" | "cancelled" | "failed" | "overflow"
  }
  "queue:item:started": QueueItem
  "queue:item:failed": { id: string; error: Error; retryCount: number }
  "queue:state:changed": QueueState
}

// Generic queue item with metadata
type QueueItem<TPayload = unknown> = {
  id: string
  componentId: string
  payload: TPayload
  priority: number
  timestamp: number
  retryCount: number
  maxRetries: number
  controller: AbortController
}

// Queue operation commands
type QueueCommand =
  | {
      type: "ENQUEUE"
      item: Omit<QueueItem, "id" | "timestamp" | "retryCount" | "controller">
    }
  | { type: "CANCEL"; id: string }
  | { type: "PAUSE" }
  | { type: "RESUME" }
  | { type: "CLEAR" }
  | { type: "SET_STRATEGY"; strategy: QueueStrategy }

// Queue states using discriminated unions
type QueueState =
  | { status: "idle"; currentItem: null; size: 0 }
  | { status: "processing"; currentItem: QueueItem; size: number }
  | { status: "paused"; currentItem: QueueItem | null; size: number }
  | {
      status: "error"
      currentItem: QueueItem | null
      size: number
      error: Error
    }

// Queue strategies
type QueueStrategyType = "lazy" | "greedy"
type OverflowStrategy = "fifo" | "lru" | "priority"

type QueueStrategy<TPayload = unknown> = {
  type: QueueStrategyType
  overflow: OverflowStrategy
  shouldPreempt: (
    newItem: QueueItem<TPayload>,
    currentItem: QueueItem<TPayload> | null
  ) => boolean
  onItemAdded: (
    item: QueueItem<TPayload>,
    queue: Array<QueueItem<TPayload>>
  ) => Array<QueueItem<TPayload>>
}

// Event processor function type
type EventProcessor<TPayload> = (
  payload: TPayload,
  signal: AbortSignal
) => Promise<void>

// Queue configuration
type QueueConfig = {
  maxSize: number
  maxRetries: number
  retryDelay: number
  strategy: QueueStrategyType
  overflow: OverflowStrategy
}

type AudioTTSOptions = {
  voice?: VoiceConfig | null
  volume?: number
  playbackRate?: number
  onStart?: () => void
  onEnd?: () => void
  onError?: (error: Error) => void
  onProgress?: (currentTime: number, duration: number) => void
}

// Default strategies implementation
const createLazyStrategy = <TPayload>(
  overflow: OverflowStrategy
): QueueStrategy<TPayload> => ({
  type: "lazy",
  overflow,
  shouldPreempt: () => false, // Never preempts in lazy mode
  onItemAdded: (item, queue) => {
    // Simple append for lazy strategy
    return [...queue, item]
  },
})

const createGreedyStrategy = <TPayload>(
  overflow: OverflowStrategy
): QueueStrategy<TPayload> => ({
  type: "greedy",
  overflow,
  shouldPreempt: (newItem, currentItem) => {
    // Preempt if new item has higher priority or is newer
    return currentItem ? newItem.priority > currentItem.priority : false
  },
  onItemAdded: (item, queue) => {
    // Insert by priority for greedy strategy
    const insertIndex = queue.findIndex(
      (existing) => existing.priority < item.priority
    )
    if (insertIndex === -1) {
      return [...queue, item]
    }
    return [...queue.slice(0, insertIndex), item, ...queue.slice(insertIndex)]
  },
})

// Overflow handling strategies
const handleOverflow = <TPayload>(
  queue: Array<QueueItem<TPayload>>,
  maxSize: number,
  strategy: OverflowStrategy
): Array<QueueItem<TPayload>> => {
  if (queue.length <= maxSize) return queue

  switch (strategy) {
    case "fifo":
      return queue.slice(-maxSize) // Keep newest

    case "lru":
      // Sort by timestamp and keep most recent
      return queue.sort((a, b) => b.timestamp - a.timestamp).slice(0, maxSize)

    case "priority":
      // Sort by priority and keep highest
      return queue.sort((a, b) => b.priority - a.priority).slice(0, maxSize)

    default:
      return queue.slice(0, maxSize)
  }
}

// Exponential backoff with jitter
const calculateRetryDelay = (retryCount: number, baseDelay: number): number => {
  const exponentialDelay = baseDelay * Math.pow(2, retryCount)
  const jitter = Math.random() * 0.1 * exponentialDelay
  return Math.min(exponentialDelay + jitter, 30000) // Cap at 30 seconds
}

// Create queue context manager
export function createQueueManager<TPayload = unknown>(
  processor: EventProcessor<TPayload>,
  config: Partial<QueueConfig> = {}
) {
  const finalConfig: QueueConfig = {
    maxSize: 10,
    maxRetries: 3,
    retryDelay: 1000,
    strategy: "lazy",
    overflow: "fifo",
    ...config,
  }

  // Internal state
  let currentStrategy: QueueStrategy<TPayload> =
    finalConfig.strategy === "lazy"
      ? createLazyStrategy<TPayload>(finalConfig.overflow)
      : createGreedyStrategy<TPayload>(finalConfig.overflow)

  let queue: Array<QueueItem<TPayload>> = []
  let currentItem: QueueItem<TPayload> | null = null
  let isProcessing = false
  let isPaused = false
  // let processingPromise: Promise<void> | null = null

  // Create event bus for queue coordination
  const eventBus = createEventBus<QueueEventMap>()

  // Generate unique IDs
  const generateId = (): string =>
    `queue_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

  // Get current state
  const getState = (): QueueState => {
    if (isPaused) {
      return { status: "paused", currentItem, size: queue.length }
    }
    if (currentItem) {
      return { status: "processing", currentItem, size: queue.length }
    }
    return { status: "idle", currentItem: null, size: 0 }
  }

  // Emit state change
  const emitStateChange = () => {
    eventBus.emit("queue:state:changed", getState())
  }

  // Process next item in queue
  const processNext = async (): Promise<void> => {
    console.log("state of process: ", isPaused, isProcessing, queue.length)
    if (isPaused || isProcessing || queue.length === 0) return

    console.log("🚀 Calling processNext")
    try {
      currentItem = queue.shift()!
      isProcessing = true
      emitStateChange()

      eventBus.emit("queue:item:started", currentItem)

      await processor(currentItem.payload, currentItem.controller.signal)

      // Successfully completed
      eventBus.emit("queue:item:removed", {
        id: currentItem.id,
        reason: "completed",
      })

      currentItem = null
      isProcessing = false
      emitStateChange()

      // Process next item
      setTimeout(() => processNext(), 0)
    } catch (error) {
      console.error("processor error: ", error)
      const err = error instanceof Error ? error : new Error(String(error))
      if (currentItem === null) {
        return
      }

      // Handle abort differently from other errors
      if (err.name === "AbortError") {
        eventBus.emit("queue:item:removed", {
          id: currentItem.id,
          reason: "cancelled",
        })
        currentItem = null
        isProcessing = false
        emitStateChange()
        setTimeout(() => processNext(), 0)
        return
      }

      // Increment retry count
      currentItem.retryCount++

      eventBus.emit("queue:item:failed", {
        id: currentItem.id,
        error: err,
        retryCount: currentItem.retryCount,
      })

      if (currentItem.retryCount < currentItem.maxRetries) {
        // Retry with exponential backoff
        const delay = calculateRetryDelay(
          currentItem.retryCount,
          finalConfig.retryDelay
        )

        setTimeout(() => {
          if (currentItem && !isPaused) {
            // Re-add to front of queue for immediate retry
            queue.unshift(currentItem)
            currentItem = null
            isProcessing = false
            emitStateChange()
            processNext()
          }
        }, delay)
      } else {
        // Max retries exceeded, remove item
        eventBus.emit("queue:item:removed", {
          id: currentItem.id,
          reason: "failed",
        })
        currentItem = null
        isProcessing = false
        emitStateChange()
        setTimeout(() => processNext(), 0)
      }
    }
  }

  // Queue management functions
  const enqueue = (
    itemData: Omit<
      QueueItem<TPayload>,
      "id" | "timestamp" | "retryCount" | "controller"
    >
  ): string => {
    console.log("📥 [ENQUEUE] Starting enqueue process", {
      componentId: itemData.componentId,
      priority: itemData.priority,
      payload:
        typeof itemData.payload === "object"
          ? {
              ...itemData.payload,
              text: (itemData.payload as any).text?.substring(0, 50) + "...",
            }
          : itemData.payload,
    })

    const item: QueueItem<TPayload> = {
      ...itemData,
      id: generateId(),
      timestamp: Date.now(),
      retryCount: 0,
      controller: new AbortController(),
      maxRetries: itemData.maxRetries ?? finalConfig.maxRetries,
    }

    console.log("🆔 [ENQUEUE] Created queue item", {
      id: item.id,
      timestamp: item.timestamp,
      maxRetries: item.maxRetries,
    })

    console.log("📊 [ENQUEUE] Queue state before processing", {
      currentQueueSize: queue.length,
      isProcessing,
      isPaused,
      currentItemId: currentItem?.id || "none",
      strategy: currentStrategy.type,
      overflow: currentStrategy.overflow,
    })

    // Check if we should preempt current item
    const shouldPreempt = currentStrategy.shouldPreempt(item, currentItem)
    console.log("🔄 [ENQUEUE] Preemption check", {
      shouldPreempt,
      currentItemId: currentItem?.id || "none",
      newItemPriority: item.priority,
      currentItemPriority: currentItem?.priority || "none",
    })

    if (shouldPreempt) {
      console.log("⚡ [ENQUEUE] Preempting current item", {
        preemptedItemId: currentItem?.id,
        newItemId: item.id,
      })

      // Cancel current item and add it back to queue
      if (currentItem) {
        console.log(
          "❌ [ENQUEUE] Aborting current item and adding back to queue"
        )
        currentItem.controller.abort()
        queue.unshift(currentItem)
      }
    }

    // Add item using strategy
    console.log("📋 [ENQUEUE] Adding item using strategy", {
      strategyType: currentStrategy.type,
      queueSizeBeforeAdd: queue.length,
    })

    queue = currentStrategy.onItemAdded(item, queue)

    console.log("📋 [ENQUEUE] Item added to queue", {
      queueSizeAfterAdd: queue.length,
      itemPosition: queue.findIndex((q) => q.id === item.id),
      queueIds: queue.map((q) => ({ id: q.id, priority: q.priority })),
    })

    // Handle overflow
    const previousSize = queue.length
    console.log("🌊 [ENQUEUE] Checking overflow", {
      currentSize: previousSize,
      maxSize: finalConfig.maxSize,
      overflowStrategy: currentStrategy.overflow,
    })

    queue = handleOverflow(queue, finalConfig.maxSize, currentStrategy.overflow)

    // Emit overflow events for removed items
    if (queue.length < previousSize) {
      const removedCount = previousSize - queue.length
      console.log("🗑️ [ENQUEUE] Overflow occurred - items removed", {
        removedCount,
        previousSize,
        newSize: queue.length,
      })

      for (let i = 0; i < removedCount; i++) {
        const overflowId = `overflow_${Date.now()}_${i}`
        console.log("🗑️ [ENQUEUE] Emitting overflow removal event", {
          overflowId,
        })
        eventBus.emit("queue:item:removed", {
          id: overflowId,
          reason: "overflow",
        })
      }
    } else {
      console.log("✅ [ENQUEUE] No overflow - all items retained")
    }

    console.log("📡 [ENQUEUE] Emitting queue:item:added event", {
      itemId: item.id,
    })
    eventBus.emit("queue:item:added", item)

    console.log("📊 [ENQUEUE] Emitting state change")
    emitStateChange()

    // Start processing if not already
    const shouldStartProcessing = !isProcessing && !isPaused
    console.log("🚀 [ENQUEUE] Processing decision", {
      shouldStartProcessing,
      isProcessing,
      isPaused,
      queueLength: queue.length,
    })

    if (shouldStartProcessing) {
      console.log("⏰ [ENQUEUE] Scheduling processNext with setTimeout")
      setTimeout(() => {
        console.log(
          "⏰ [ENQUEUE] setTimeout callback executing - calling processNext"
        )
        processNext()
      }, 0)
    } else {
      console.log("⏸️ [ENQUEUE] Not starting processing", {
        reason: isProcessing
          ? "already processing"
          : isPaused
            ? "paused"
            : "unknown",
      })
    }

    console.log("✅ [ENQUEUE] Enqueue completed", {
      returnedId: item.id,
      finalQueueSize: queue.length,
      finalQueueIds: queue.map((q) => q.id),
    })

    return item.id
  }

  const cancel = (id: string): boolean => {
    // Check if it's the current item
    if (currentItem?.id === id) {
      currentItem.controller.abort()
      return true
    }

    // Check queue
    const index = queue.findIndex((item) => item.id === id)
    if (index !== -1) {
      const item = queue.splice(index, 1)[0]
      item.controller.abort()
      eventBus.emit("queue:item:removed", { id, reason: "cancelled" })
      emitStateChange()
      return true
    }

    return false
  }

  const pause = (): void => {
    isPaused = true
    if (currentItem) {
      currentItem.controller.abort()
    }
    emitStateChange()
  }

  const resume = (): void => {
    isPaused = false
    emitStateChange()
    if (!isProcessing) {
      setTimeout(() => processNext(), 0)
    }
  }

  const clear = (): void => {
    // Cancel all items
    queue.forEach((item) => item.controller.abort())
    if (currentItem) {
      currentItem.controller.abort()
    }

    queue = []
    currentItem = null
    isProcessing = false
    emitStateChange()
  }

  const setStrategy = (strategyType: QueueStrategyType): void => {
    currentStrategy =
      strategyType === "lazy"
        ? createLazyStrategy(finalConfig.overflow)
        : createGreedyStrategy(finalConfig.overflow)

    // Re-sort existing queue according to new strategy
    if (queue.length > 0) {
      const tempQueue = [...queue]
      queue = []
      tempQueue.forEach((item) => {
        queue = currentStrategy.onItemAdded(item, queue)
      })
      emitStateChange()
    }
  }

  // Command processor
  const processCommand = (command: QueueCommand): void => {
    switch (command.type) {
      case "ENQUEUE":
        enqueue(command.item as any) // Type assertion needed due to generic constraints
        break
      case "CANCEL":
        cancel(command.id)
        break
      case "PAUSE":
        pause()
        break
      case "RESUME":
        resume()
        break
      case "CLEAR":
        clear()
        break
      case "SET_STRATEGY":
        setStrategy(command.strategy.type)
        break
    }
  }

  // Public API
  return {
    // Core operations
    enqueue,
    cancel,
    pause,
    resume,
    clear,
    setStrategy,
    processCommand,

    // State inspection
    getState,
    getQueueSize: () => queue.length,
    getCurrentItem: () => currentItem,
    getQueue: () => [...queue], // Return copy to prevent external mutation

    // Event bus for listening to queue events
    on: eventBus.on,
    onWithSelector: eventBus.onWithSelector,

    // Cleanup
    destroy: () => {
      clear()
      // Note: EventBus doesn't expose a destroy method, but all listeners will be GC'd
    },
  }
}

// Convenience function for speech API use case
export function createSpeechQueue(
  ttsHook: UseAudioTTSReturn,
  config?: Partial<QueueConfig>
) {
  return createQueueManager<{
    text: string
    options?: AudioTTSOptions
  }>(async (payload, signal) => {
    console.log("🎵 Starting TTS for:", payload.text.substring(0, 50))

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error("TTS timeout after 10 seconds"))
      }, 10000)
    })

    const ttsPromise = new Promise<void>((resolve, reject) => {
      if (signal.aborted) {
        console.log("❌ Signal already aborted before starting")
        reject(new DOMException("Aborted", "AbortError"))
        return
      }

      // Store original settings to restore later
      const originalVoice = ttsHook.selectedVoice

      // Apply options if provided
      if (payload.options) {
        if (payload.options.voice !== undefined) {
          ttsHook.setSelectedVoice(payload.options.voice)
        }
        if (payload.options.volume !== undefined) {
          ttsHook.setVolume(payload.options.volume)
        }
        if (payload.options.playbackRate !== undefined) {
          ttsHook.setPlaybackRate(payload.options.playbackRate)
        }
      }

      // Handle abort signal
      const abortHandler = () => {
        console.log("❌ Abort signal received, stopping TTS")
        ttsHook.stop()
        // Restore original settings
        ttsHook.setSelectedVoice(originalVoice)
        reject(new DOMException("Aborted", "AbortError"))
      }
      signal.addEventListener("abort", abortHandler)

      // Set up completion handlers
      let hasStarted = false
      let hasEnded = false

      const checkCompletion = () => {
        console.log(
          "🔍 Checking completion - speaking:",
          ttsHook.speaking,
          "hasStarted:",
          hasStarted,
          "hasEnded:",
          hasEnded
        )

        if (!ttsHook.speaking && hasStarted && !hasEnded) {
          console.log("✅ TTS completed successfully")
          hasEnded = true
          signal.removeEventListener("abort", abortHandler)
          // Restore original settings
          ttsHook.setSelectedVoice(originalVoice)
          payload.options?.onEnd?.()
          resolve()
        } else if (ttsHook.speaking && !hasStarted) {
          console.log("🎤 TTS started speaking")
          hasStarted = true
          payload.options?.onStart?.()
        }

        // Continue monitoring if still in progress
        if (hasStarted && !hasEnded) {
          console.log("recursing on completion")
          setTimeout(checkCompletion, 50)
        }
      }

      // Start the speech synthesis
      console.log("🚀 Calling ttsHook.speak()")
      ttsHook
        .speak(payload.text)
        .then(() => {
          // speak() resolved, start monitoring for completion
          console.log("✅ ttsHook.speak() resolved, starting monitoring")
          setTimeout(checkCompletion, 10)
        })
        .catch((error) => {
          console.log("❌ ttsHook.speak() rejected:", error)
          if (!hasEnded) {
            hasEnded = true
            signal.removeEventListener("abort", abortHandler)
            ttsHook.setSelectedVoice(originalVoice)
            payload.options?.onError?.(error)
            reject(new Error(`TTS synthesis error: ${error.message}`))
          }
        })
    })

    return Promise.race([ttsPromise, timeoutPromise])
  }, config)
}

// Usage example types
export type QueueManager<TPayload = unknown> = ReturnType<
  typeof createQueueManager<TPayload>
>
export type SpeechQueue = ReturnType<typeof createSpeechQueue>

// Re-export types for external use
export type {
  QueueItem,
  QueueState,
  QueueCommand,
  QueueConfig,
  QueueStrategy,
  EventProcessor,
}
