/**
 * Effect Executor - Runtime Effect Handler
 *
 * Executes side effects emitted by the FSM reducer.
 * Bridges FSM (pure state transitions) with impure runtime (I/O, timers, queries).
 */

import type { SpeechAdapter } from "@some-ui/speech"
import type { Message } from "@topik/lib/topik"
import { actions, getCurrentMessage } from "@topik/lib/topik"
import type {
  IQueryBridge,
  ISessionMachine,
  ITopikRepository,
  SessionEffect,
} from "@topik/lib/topik/core/session-types"
import type { TTSEffectHandler } from "@topik/lib/topik/core/tts-effect-handler"
import { createTTSEffectHandler } from "@topik/lib/topik/core/tts-effect-handler"

// ═══════════════════════════════════════════════════════════════════════════
// EXECUTOR CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

export type EffectExecutorConfig = {
  machine: ISessionMachine
  repository: ITopikRepository
  queryBridge: IQueryBridge

  // TTS configuration
  speechAdapter?: SpeechAdapter
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
    // Initialize TTS handler if enabled and speechAdapter provided
    if (
      config.enableTTS !== false &&
      config.speechAdapter &&
      config.componentId
    ) {
      this.ttsHandler = createTTSEffectHandler({
        speechAdapter: config.speechAdapter,
        componentId: config.componentId,
        machine: config.machine,

        onSpeechStart: (messageId) => {
          this.config.onSpeechStart?.(messageId)
        },

        onSpeechEnd: (messageId) => {
          // Dispatch ADVANCE_MESSAGE event to FSM
          const effects = this.config.machine.dispatch(actions.advanceMessage())
          this.execute(effects)
          if (this.config.onSpeechEnd) this.config.onSpeechEnd(messageId)
        },

        onError: (error, messageId) => {
          // eslint-disable-next-line no-console
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
      // eslint-disable-next-line no-console
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
      // eslint-disable-next-line no-console
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
        case "TRIGGER_CATALOG_QUERY": {
          void this._triggerCatalogQuery()
          break
        }

        case "TRIGGER_TOPIK_QUERY": {
          void this._triggerTopikQuery(effect.key)
          break
        }

        case "START_TIMER": {
          this._startTimer()
          break
        }

        case "STOP_TIMER": {
          this._stopTimer()
          break
        }

        case "PLAY_AUDIO": {
          this._playAudio()
          break
        }

        case "STOP_AUDIO": {
          this._stopAudio()
          break
        }

        case "NOTIFY_BATCH_COMPLETE": {
          this._notifyBatchComplete(effect.batchIndex)
          break
        }

        case "NOTIFY_SESSION_COMPLETE": {
          this._notifySessionComplete()
          break
        }

        case "NOTIFY_SESSION_RESET": {
          this._notifySessionReset()
          break
        }

        // eslint-disable-next-line switch-lint/require-fail-fast-default -- an unknown effect is logged, not thrown, so a stray effect never crashes a live study session
        default: {
          // Exhaustiveness check
          const _exhaustive: never = effect
          effect satisfies never
          // eslint-disable-next-line no-console
          console.warn("[Executor] Unknown effect type:", _exhaustive)
        }
      }
    } catch (error) {
      // eslint-disable-next-line no-console
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

    // Dispatch loading immediately
    effects = machine.dispatch({ type: "CATALOG_LOADING" })
    this.execute(effects)

    try {
      const data = await queryBridge.fetchCatalog()
      effects = machine.dispatch({ type: "CATALOG_SUCCESS", data: data.topiks })
      this.execute(effects)
    } catch (error) {
      // eslint-disable-next-line no-console
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

    // Dispatch loading immediately
    effects = machine.dispatch({ type: "HYDRATION_STARTED", key })
    this.execute(effects)

    try {
      const batches = await queryBridge.fetchTopik(key)
      effects = machine.dispatch({
        type: "HYDRATION_SUCCESS",
        key,
        batches,
      })

      this.execute(effects) // This triggers the PLAY_AUDIO and START_TIMER
    } catch (error) {
      // eslint-disable-next-line no-console
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
      return
    }

    const interval = this.config.timerInterval ?? 1000

    this.timerHandle = setInterval(() => {
      const effects = this.config.machine.dispatch({ type: "TIMER_TICK" })
      this.execute(effects)
    }, interval)
  }

  private _stopTimer(): void {
    if (this.timerHandle) {
      clearInterval(this.timerHandle)
      this.timerHandle = null
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  // TTS EFFECTS
  // ═════════════════════════════════════════════════════════════════════════

  private _playAudio(): void {
    if (!this.ttsHandler) {
      // eslint-disable-next-line no-console
      console.warn("[Executor] TTS not enabled, skipping audio")
      return
    }

    const message = getCurrentMessage(this.config.machine.getState())

    if (!message) {
      // eslint-disable-next-line no-console
      console.warn(`[Executor] Message not found`)
      return
    }

    // ENQUEUE instead of direct speak
    this.ttsHandler.enqueue(message, true)
  }

  private _stopAudio(): void {
    if (!this.ttsHandler) return
    this.ttsHandler.handleStopAudio()
  }

  // ═════════════════════════════════════════════════════════════════════════
  // NOTIFICATION EFFECTS
  // ═════════════════════════════════════════════════════════════════════════

  private _notifyBatchComplete(batchIndex: number): void {
    if (this.config.onBatchComplete) this.config.onBatchComplete(batchIndex)
  }

  private _notifySessionComplete(): void {
    if (this.config.onSessionComplete) this.config.onSessionComplete()
  }

  private _notifySessionReset(): void {
    this.destroy()
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
