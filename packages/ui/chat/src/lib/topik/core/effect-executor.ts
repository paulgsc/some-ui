/**
 * Effect Executor - Runtime Effect Handler
 *
 * Executes side effects emitted by the FSM reducer.
 * Bridges FSM (pure state transitions) with impure runtime (I/O, timers, queries).
 */

import type { Message } from "@chat/lib/topik"
import { actions, getCurrentMessage } from "@chat/lib/topik"
import type { QueryClient } from "@tanstack/react-query"

import type {
  IQueryBridge,
  ISessionMachine,
  ITopikRepository,
  SessionEffect,
} from "./session-types"
import type { SpeechQueueService, TTSEffectHandler } from "./tts-effect-handler"
import { createTTSEffectHandler } from "./tts-effect-handler"

// ═══════════════════════════════════════════════════════════════════════════
// EXECUTOR CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

export type EffectExecutorConfig = {
  machine: ISessionMachine
  repository: ITopikRepository
  queryBridge: IQueryBridge
  queryClient: QueryClient

  // TTS configuration
  speechQueue?: SpeechQueueService
  componentId?: string
  enableTTS?: boolean

  // Timer configuration
  timerInterval?: number

  // Callbacks
  onBatchComplete?: (batchIndex: number) => void
  onSessionComplete?: () => void
  onSpeechStart?: (messageId: string) => void
  onSpeechEnd?: (messageId: string) => void
  onError?: (error: Error, effect: SessionEffect) => void
}

// ═══════════════════════════════════════════════════════════════════════════
// EFFECT EXECUTOR
// ═══════════════════════════════════════════════════════════════════════════

export class EffectExecutor {
  // Timer state
  private timerHandle: ReturnType<typeof setInterval> | null = null

  // TTS state
  private ttsHandler: TTSEffectHandler | null = null

  // Query observation state
  private catalogObserver: ReturnType<typeof setInterval> | null = null
  private topikObserver: ReturnType<typeof setInterval> | null = null
  private observedTopikKey: string | null = null

  // Lifecycle state
  private destroyed = false

  constructor(private readonly config: EffectExecutorConfig) {
    // Initialize TTS handler if enabled and speech queue provided
    if (
      config.enableTTS !== false &&
      config.speechQueue &&
      config.componentId
    ) {
      this.ttsHandler = createTTSEffectHandler({
        speechQueue: config.speechQueue,
        componentId: config.componentId,
        machine: config.machine,

        onMessageComplete: (messageId) => {
          console.log(`[Executor] TTS complete for message: ${messageId}`)

          // Dispatch ADVANCE_MESSAGE event to FSM
          const effects = this.config.machine.dispatch(actions.advanceMessage())
          this.execute(effects)
        },

        onSpeechStart: (messageId) => {
          this.config.onSpeechStart && this.config.onSpeechStart(messageId)
        },

        onSpeechEnd: (messageId) => {
          this.config.onSpeechEnd && this.config.onSpeechEnd(messageId)
        },

        onError: (error, messageId) => {
          console.error(`[Executor] TTS error for message ${messageId}:`, error)
        },
      })
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * Execute array of effects
   */
  execute(effects: Array<SessionEffect>): void {
    if (this.destroyed) {
      console.warn("[Executor] Ignoring effects - executor destroyed")
      return
    }

    for (const effect of effects) {
      this._executeOne(effect)
    }
  }

  /**
   * Manual speak (for UI controls)
   */
  async speakMessage(message: Message): Promise<void> {
    if (!this.ttsHandler) {
      console.warn("[Executor] TTS not enabled")
      return
    }
    await this.ttsHandler.speakManually(message)
  }

  /**
   * Check if currently speaking
   */
  isSpeaking(): boolean {
    return this.ttsHandler?.isSpeaking() ?? false
  }

  /**
   * Get current speaking message ID
   */
  getCurrentSpeakingId(): string | null {
    return this.ttsHandler?.getCurrentMessageId() ?? null
  }

  /**
   * Destroy executor and cleanup all resources
   */
  destroy(): void {
    this.destroyed = true
    this._stopTimer()
    this._stopCatalogObserver()
    this._stopTopikObserver()
    this.ttsHandler?.destroy()
  }

  // ═════════════════════════════════════════════════════════════════════════
  // EFFECT DISPATCH
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * Execute single effect with error handling
   */
  private _executeOne(effect: SessionEffect): void {
    try {
      switch (effect.type) {
        case "TRIGGER_CATALOG_QUERY":
          this._triggerCatalogQuery()
          break

        case "TRIGGER_TOPIK_QUERY":
          this._triggerTopikQuery(effect.key)
          break

        case "START_TIMER":
          this._startTimer()
          break

        case "STOP_TIMER":
          this._stopTimer()
          break

        case "PLAY_AUDIO":
          this._playAudio(effect.messageId)
          break

        case "STOP_AUDIO":
          this._stopAudio()
          break

        case "NOTIFY_BATCH_COMPLETE":
          this._notifyBatchComplete(effect.batchIndex)
          break

        case "NOTIFY_SESSION_COMPLETE":
          this._notifySessionComplete()
          break

        default:
          // Exhaustiveness check
          const _exhaustive: never = effect
          console.warn("[Executor] Unknown effect type:", _exhaustive)
      }
    } catch (error) {
      this.config.onError &&
        this.config.onError(
          error instanceof Error ? error : new Error(String(error)),
          effect
        )
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  // QUERY EFFECTS
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * Trigger catalog query and observe state changes
   */
  private _triggerCatalogQuery(): void {
    const { queryBridge, machine } = this.config

    console.log("[Executor] Triggering catalog query")

    const state = queryBridge.triggerCatalogQuery()

    if (state.isLoading) {
      machine.dispatch({ type: "CATALOG_LOADING" })
    }

    if (!state.isLoading && !state.isError) {
      machine.dispatch({ type: "CATALOG_SUCCESS" })
      return
    }

    if (state.isError) {
      machine.dispatch({
        type: "CATALOG_FAILURE",
        error: state.error?.message ?? "Unknown error",
      })
      return
    }

    if (!this.catalogObserver) {
      this.catalogObserver = setInterval(() => {
        const currentState = queryBridge.triggerCatalogQuery()

        if (currentState.isError) {
          console.log("[Executor] Catalog query failed")
          machine.dispatch({
            type: "CATALOG_FAILURE",
            error: currentState.error?.message ?? "Unknown error",
          })
          this._stopCatalogObserver()
        } else if (!currentState.isLoading) {
          console.log("[Executor] Catalog query succeeded")
          machine.dispatch({ type: "CATALOG_SUCCESS" })
          this._stopCatalogObserver()
        }
      }, 100)
    }
  }

  /**
   * Trigger topik query and observe state changes
   */
  private _triggerTopikQuery(key: string): void {
    const { queryBridge, machine } = this.config

    console.log(`[Executor] Triggering topik query for key: ${key}`)

    if (this.observedTopikKey !== key) {
      this._stopTopikObserver()
      this.observedTopikKey = key
    }

    const state = queryBridge.triggerTopikQuery(key)

    if (state.isLoading) {
      machine.dispatch({ type: "HYDRATION_STARTED", key })
    }

    if (!state.isLoading && !state.isError && state.data) {
      console.log(`[Executor] Topik query succeeded (cached): ${key}`)
      machine.dispatch({
        type: "HYDRATION_SUCCESS",
        key,
        batchCount: state.data.length,
      })
      return
    }

    if (state.isError) {
      console.log(`[Executor] Topik query failed: ${key}`)
      machine.dispatch({
        type: "HYDRATION_FAILURE",
        key,
        error: state.error?.message ?? "Unknown error",
      })
      return
    }

    if (!this.topikObserver) {
      this.topikObserver = setInterval(() => {
        const currentState = queryBridge.triggerTopikQuery(key)

        if (currentState.isError) {
          console.log(`[Executor] Topik query failed: ${key}`)
          machine.dispatch({
            type: "HYDRATION_FAILURE",
            key,
            error: currentState.error?.message ?? "Unknown error",
          })
          this._stopTopikObserver()
        } else if (!currentState.isLoading && currentState.data) {
          console.log(`[Executor] Topik query succeeded: ${key}`)
          machine.dispatch({
            type: "HYDRATION_SUCCESS",
            key,
            batchCount: currentState.data.length,
          })
          this._stopTopikObserver()
        }
      }, 100)
    }
  }

  private _stopCatalogObserver(): void {
    if (this.catalogObserver) {
      clearInterval(this.catalogObserver)
      this.catalogObserver = null
      console.log("[Executor] Stopped catalog observer")
    }
  }

  private _stopTopikObserver(): void {
    if (this.topikObserver) {
      clearInterval(this.topikObserver)
      this.topikObserver = null
      this.observedTopikKey = null
      console.log("[Executor] Stopped topik observer")
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  // TIMER EFFECTS
  // ═════════════════════════════════════════════════════════════════════════

  private _startTimer(): void {
    if (this.timerHandle) {
      console.log("[Executor] Timer already running")
      return
    }

    const interval = this.config.timerInterval ?? 1000

    console.log(`[Executor] Starting timer (interval: ${interval}ms)`)

    this.timerHandle = setInterval(() => {
      const effects = this.config.machine.dispatch({ type: "TIMER_TICK" })
      this.execute(effects)
    }, interval)
  }

  private _stopTimer(): void {
    if (this.timerHandle) {
      clearInterval(this.timerHandle)
      this.timerHandle = null
      console.log("[Executor] Stopped timer")
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  // TTS EFFECTS
  // ═════════════════════════════════════════════════════════════════════════

  private _playAudio(messageId: string): void {
    if (!this.ttsHandler) {
      console.warn("[Executor] TTS not enabled, skipping audio")
      return
    }

    const message = getCurrentMessage(
      this.config.machine,
      this.config.queryClient
    )

    if (!message) {
      console.warn(`[Executor] Message not found: ${messageId}`)
      return
    }

    if (message.id !== messageId) {
      console.warn(
        `[Executor] Message ID mismatch: expected ${messageId}, got ${message.id}`
      )
      return
    }

    console.log(`[Executor] Playing audio for message: ${messageId}`)

    this.ttsHandler.handlePlayAudio(message, true)
  }

  private _stopAudio(): void {
    if (!this.ttsHandler) return

    console.log("[Executor] Stopping audio")
    this.ttsHandler.handleStopAudio()
  }

  // ═════════════════════════════════════════════════════════════════════════
  // NOTIFICATION EFFECTS
  // ═════════════════════════════════════════════════════════════════════════

  private _notifyBatchComplete(batchIndex: number): void {
    console.log(`[Executor] Batch complete: ${batchIndex}`)
    this.config.onBatchComplete && this.config.onBatchComplete(batchIndex)
  }

  private _notifySessionComplete(): void {
    console.log("[Executor] Session complete")
    this.config.onSessionComplete && this.config.onSessionComplete()
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// FACTORY
// ═══════════════════════════════════════════════════════════════════════════

export function createEffectExecutor(
  config: EffectExecutorConfig
): EffectExecutor {
  return new EffectExecutor(config)
}
