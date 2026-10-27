/**
 * Runs the effects the FSM reducer emits: I/O, timers, queries, speech.
 *
 * A failure is reported once, through `reportFailure` (FT1,
 * docs/monorepo-boundaries.md); the machine hears it as an event and the
 * session shows what failed.
 */

import { reportFailure, toIntentError } from "@some-ui/intent-kit"
import type { Speaker } from "@some-ui/speech"
import {
  actions,
  getCurrentMessage,
} from "@topik/lib/topik/core/session-selectors"
import type {
  IQueryBridge,
  ISessionMachine,
  ITopikRepository,
  SessionEffect,
} from "@topik/lib/topik/core/session-types"
import type { TTSEffectHandler } from "@topik/lib/topik/core/tts-effect-handler"
import { createTTSEffectHandler } from "@topik/lib/topik/core/tts-effect-handler"
import type { Message } from "@topik/lib/topik/entity/topik-types"

// EXECUTOR CONFIGURATION

export type EffectExecutorConfig = {
  machine: ISessionMachine
  repository: ITopikRepository
  queryBridge: IQueryBridge

  // TTS configuration
  /** Absent or null both mean "no voice" - the TTS handler is not built. */
  speaker?: Speaker | null
  componentId?: string
  enableTTS?: boolean

  // Timer configuration
  timerInterval?: number

  // Callbacks
  onBatchComplete?: (batchIndex: number) => void
  onSessionComplete?: () => void
  onSpeechStart?: (messageId: string) => void
  onSpeechEnd?: (messageId: string) => void
  /** A line's audio stopped without it ending; see `TTSEffectHandlerConfig`. */
  onSpeechStopped?: (messageId: string) => void
}

// EFFECT EXECUTOR

export class EffectExecutor {
  // Timer state
  private timerHandle: ReturnType<typeof setInterval> | null = null

  // TTS state
  private ttsHandler: TTSEffectHandler | null = null

  // Lifecycle state
  private destroyed = false

  constructor(private readonly config: EffectExecutorConfig) {
    if (config.enableTTS !== false && config.speaker && config.componentId) {
      this.ttsHandler = createTTSEffectHandler({
        speaker: config.speaker,
        componentId: config.componentId,
        machine: config.machine,

        onSpeechStart: (messageId) => {
          this.config.onSpeechStart?.(messageId)
        },

        onSpeechEnd: (messageId) => {
          const effects = this.config.machine.dispatch(actions.advanceMessage())
          this.execute(effects)
          if (this.config.onSpeechEnd) this.config.onSpeechEnd(messageId)
        },

        onSpeechStopped: (messageId) => {
          this.config.onSpeechStopped?.(messageId)
        },
      })
    }
  }

  // PUBLIC API

  execute(effects: Array<SessionEffect>): void {
    // Effects that arrive after `destroy` (a query answering once the session
    // has gone) are late, and dropped on purpose: no failure, nothing to tell.
    if (this.destroyed) return

    for (const effect of effects) {
      this._executeOne(effect)
    }
  }

  async speakMessage(message: Message): Promise<void> {
    // No voice on this session (the host passed no speaker): nothing to say.
    if (!this.ttsHandler) return
    await this.ttsHandler.speakManually(message)
  }

  isSpeaking(): boolean {
    return this.ttsHandler?.isSpeaking() ?? false
  }

  getCurrentSpeakingId(): string | null {
    return this.ttsHandler?.getCurrentMessageId() ?? null
  }

  destroy(): void {
    this.destroyed = true
    this._stopTimer()
    if (this.ttsHandler) this.ttsHandler.destroy()
  }

  // EFFECT DISPATCH

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
          reportFailure({
            port: "topik session",
            error: toIntentError(
              new Error(`unknown effect: ${JSON.stringify(_exhaustive)}`)
            ),
          })
        }
      }
    } catch (error) {
      reportFailure({
        port: `topik session (${effect.type})`,
        error: toIntentError(error),
      })
    }
  }

  // QUERY EFFECTS: await the fetch, dispatch the result
  private async _triggerCatalogQuery(): Promise<void> {
    let effects: Array<SessionEffect> // trigger any effects
    const { queryBridge, machine } = this.config

    effects = machine.dispatch({ type: "CATALOG_LOADING" })
    this.execute(effects)

    try {
      const data = await queryBridge.fetchCatalog()
      effects = machine.dispatch({ type: "CATALOG_SUCCESS", data: data.topiks })
      this.execute(effects)
    } catch (error) {
      reportFailure({
        port: "topik catalog query",
        error: toIntentError(error),
      })
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
      reportFailure({
        port: `topik query (${key})`,
        error: toIntentError(error),
      })
      effects = machine.dispatch({
        type: "HYDRATION_FAILURE",
        key,
        error: error instanceof Error ? error.message : String(error),
      })
      this.execute(effects)
    }
  }

  // TIMER EFFECTS

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

  // TTS EFFECTS

  private _playAudio(): void {
    // No voice on this session: the lesson runs silent, as the host chose.
    if (!this.ttsHandler) return

    const message = getCurrentMessage(this.config.machine.getState())

    // The reducer asked for a line it holds none for: its state and its
    // effects disagree.
    if (!message) {
      reportFailure({
        port: "topik session (PLAY_AUDIO)",
        error: toIntentError(new Error("no current message to play")),
      })
      return
    }

    // ENQUEUE instead of direct speak
    this.ttsHandler.enqueue(message, true)
  }

  private _stopAudio(): void {
    if (!this.ttsHandler) return
    this.ttsHandler.handleStopAudio()
  }

  // NOTIFICATION EFFECTS

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

// FACTORY

export function createEffectExecutor(
  config: EffectExecutorConfig
): EffectExecutor {
  return new EffectExecutor(config)
}
