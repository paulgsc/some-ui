/**
 * Effect Executor - Runtime Effect Handler
 *
 * Executes side effects emitted by the FSM reducer.
 * Bridges FSM (pure state transitions) with impure runtime (I/O, timers, queries).
 */

import type { Message } from "@chat/lib/topik"
import { actions, getCurrentMessage } from "@chat/lib/topik"

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
    if (this.ttsHandler) this.ttsHandler.destroy()
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
          this._playAudio()
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
      console.error("[Executor] error executing effects", error, effect)
      if (this.config.onError)
        this.config.onError(
          error instanceof Error ? error : new Error(String(error)),
          effect
        )
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  // QUERY EFFECTS - Model 1: Await fetch, dispatch result
  // ═════════════════════════════════════════════════════════════════════════
  private async _triggerCatalogQuery(): Promise<void> {
    let effects: Array<SessionEffect> // trigger any effects
    const { queryBridge, machine } = this.config

    console.log("[Executor] Triggering catalog query")

    // Dispatch loading immediately
    effects = machine.dispatch({ type: "CATALOG_LOADING" })
    this.execute(effects)

    try {
      const data = await queryBridge.fetchCatalog()
      console.log("[Executor] Catalog query succeeded")
      effects = machine.dispatch({ type: "CATALOG_SUCCESS", data: data.topiks })
      this.execute(effects)
    } catch (error) {
      console.error("[Executor] Catalog query failed:", error)
      effects = machine.dispatch({
        type: "CATALOG_FAILURE",
        error: error instanceof Error ? error.message : String(error),
      })
      this.execute(effects)
    }
  }

  private async _triggerTopikQuery(key: string): Promise<void> {
    let effects: Array<SessionEffect> // trigger any effects
    const { queryBridge, machine } = this.config

    console.log(`[Executor] Triggering topik query for key: ${key}`)

    // Dispatch loading immediately
    effects = machine.dispatch({ type: "HYDRATION_STARTED", key })
    this.execute(effects)

    try {
      const batches = await queryBridge.fetchTopik(key)
      console.log(`[Executor] Topik query succeeded: ${key}`)
      effects = machine.dispatch({
        type: "HYDRATION_SUCCESS",
        key,
        batches,
      })

      console.info("[executor] effects", effects)
      this.execute(effects) // This triggers the PLAY_AUDIO and START_TIMER
    } catch (error) {
      console.error(`[Executor] Topik query failed: ${key}`, error)
      effects = machine.dispatch({
        type: "HYDRATION_FAILURE",
        key,
        error: error instanceof Error ? error.message : String(error),
      })
      this.execute(effects)
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

  private _playAudio(): void {
    if (!this.ttsHandler) {
      console.warn("[Executor] TTS not enabled, skipping audio")
      return
    }

    const message = getCurrentMessage(this.config.machine.getState())

    if (!message) {
      console.warn(`[Executor] Message not found`)
      return
    }

    console.log(`[Executor] Enqueuing audio for message: ${message.id}`)

    // ENQUEUE instead of direct speak
    this.ttsHandler.enqueue(message, true)
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
    if (this.config.onBatchComplete) this.config.onBatchComplete(batchIndex)
  }

  private _notifySessionComplete(): void {
    console.log("[Executor] Session complete")
    if (this.config.onSessionComplete) this.config.onSessionComplete()
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
