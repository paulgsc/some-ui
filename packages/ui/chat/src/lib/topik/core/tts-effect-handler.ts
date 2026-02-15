/**
 * TTS Effect Handler - Bridges FSM to Speech Queue Service
 *
 * Handles text-to-speech effects by delegating to the speech queue service.
 * Does NOT implement TTS - only coordinates between FSM and the service.
 *
 * RESPONSIBILITIES:
 * - Handle PLAY_AUDIO effects from FSM
 * - Handle STOP_AUDIO effects from FSM
 * - Track speaking state
 * - Fire callbacks to FSM on completion
 * - Deduplicate auto-play requests
 *
 * NON-RESPONSIBILITIES:
 * - TTS implementation (owned by speech queue service)
 * - Queue management (owned by speech queue service)
 * - Audio playback (owned by browser/service)
 */

import type { Message } from "@chat/lib/topik"

import type { ISessionMachine } from "./session-types"

// ═══════════════════════════════════════════════════════════════════════════
// SPEECH QUEUE SERVICE TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Speech queue service interface (from some-ui-utils)
 * This is what useSpeechQueue returns
 */
export type SpeechQueueService = {
  speak: (
    text: string,
    options?: {
      volume?: number
      rate?: number
      pitch?: number
      lang?: string
      onStart?: () => void
      onEnd?: () => void
      onError?: (error: Error) => void
    },
    priority?: number
  ) => void
  cancel: () => void
  pause: () => void
  resume: () => void
  clear: () => void
}

// ═══════════════════════════════════════════════════════════════════════════
// TTS EFFECT HANDLER CONFIG
// ═══════════════════════════════════════════════════════════════════════════

export type TTSEffectHandlerConfig = {
  /**
   * Speech queue service instance
   */
  speechQueue: SpeechQueueService

  /**
   * Component ID for queue isolation
   */
  componentId: string

  /**
   * FSM machine reference (for advanced usage)
   */
  machine: ISessionMachine

  /**
   * Called when message speech completes successfully
   * Typically dispatches ADVANCE_MESSAGE to FSM
   */
  onMessageComplete?: (messageId: string) => void

  /**
   * Called when speech starts
   */
  onSpeechStart?: (messageId: string) => void

  /**
   * Called when speech ends (success or error)
   */
  onSpeechEnd?: (messageId: string) => void

  /**
   * Called on TTS errors
   */
  onError?: (error: Error, messageId: string) => void
}

// ═══════════════════════════════════════════════════════════════════════════
// TTS EFFECT HANDLER
// ═══════════════════════════════════════════════════════════════════════════

export class TTSEffectHandler {
  private currentMessageId: string | null = null
  private lastAutoSpokenId: string | null = null
  private priorityCounter: number = 0
  private speaking: boolean = false

  constructor(private readonly config: TTSEffectHandlerConfig) {}

  /**
   * Handle PLAY_AUDIO effect from FSM
   *
   * @param messageId - Message identifier
   * @param text - Korean text to speak
   * @param isAuto - Whether this is auto-play (affects deduplication)
   */
  async handlePlayAudio(
    message: Message,
    isAuto: boolean = true
  ): Promise<void> {
    // Deduplicate: Skip if auto-play and already spoken
    if (isAuto && this.lastAutoSpokenId === message.id) {
      console.log(`[TTS] Skipping already-spoken message: ${message.id}`)
      return
    }

    // Cancel any in-flight speech
    this.handleStopAudio()

    // Increment priority for queue ordering
    const priority = ++this.priorityCounter

    // Track current message
    this.currentMessageId = message.id

    console.log(
      `[TTS] Speaking message: ${message.id} (priority: ${priority}, auto: ${isAuto})`
    )

    try {
      await this.config.speechQueue.speak(
        message.content,
        {
          volume: 1.0,
          rate: 1.0,
          lang: "ko-KR",

          onStart: () => {
            console.log(`[TTS] 🔊 Speaking: ${message.id}`)
            this.speaking = true
            this.config.onSpeechStart?.(message.id)
          },

          onEnd: () => {
            console.log(`[TTS] ✅ Complete: ${message.id}`)
            this.speaking = false

            // Mark as spoken for auto-play deduplication
            if (isAuto) {
              this.lastAutoSpokenId = message.id
            }

            this.config.onSpeechEnd?.(message.id)

            // Fire completion callback (advances to next message)
            // Only for auto-play, not manual UI-triggered speech
            if (isAuto) {
              this.config.onMessageComplete?.(message.id)
            }

            // Clear tracking
            this.currentMessageId = null
          },

          onError: (error) => {
            console.error(`[TTS] ❌ Error: ${message.id}`, error)
            this.speaking = false

            this.config.onError?.(error, message.id)
            this.config.onSpeechEnd?.(message.id)

            // Clear tracking
            this.currentMessageId = null
          },
        },
        priority
      )
    } catch (error) {
      console.error(`[TTS] speak() threw for ${message.id}:`, error)
      this.speaking = false

      this.config.onError?.(
        error instanceof Error ? error : new Error(String(error)),
        message.id
      )

      this.currentMessageId = null
    }
  }

  /**
   * Handle STOP_AUDIO effect from FSM
   *
   * Immediately cancels current speech
   */
  handleStopAudio(): void {
    if (this.currentMessageId) {
      console.log(`[TTS] 🔇 Stopping speech for ${this.currentMessageId}`)

      this.config.speechQueue.cancel()

      if (this.currentMessageId) {
        this.config.onSpeechEnd?.(this.currentMessageId)
      }

      this.speaking = false
      this.currentMessageId = null
    }
  }

  /**
   * Get current speaking message ID
   */
  getCurrentMessageId(): string | null {
    return this.currentMessageId
  }

  /**
   * Check if currently speaking
   */
  isSpeaking(): boolean {
    return this.speaking
  }

  /**
   * Manual speak (for UI controls)
   * Resets auto-play tracking to allow re-speaking
   *
   * @param messageId - Message identifier
   * @param text - Korean text to speak
   */
  async speakManually(message: Message): Promise<void> {
    // Cancel current speech
    this.config.speechQueue.cancel()

    // Allow re-speaking by clearing deduplication
    this.lastAutoSpokenId = null

    // Speak without auto-complete (isAuto = false)
    await this.handlePlayAudio(message, false)
  }

  /**
   * Reset handler state
   */
  reset(): void {
    this.handleStopAudio()
    this.lastAutoSpokenId = null
    this.priorityCounter = 0
  }

  /**
   * Destroy handler and cleanup
   */
  destroy(): void {
    this.handleStopAudio()
    this.config.speechQueue.clear()
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// FACTORY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create TTS effect handler
 *
 * @param config - Handler configuration with speech queue service
 */
export function createTTSEffectHandler(
  config: TTSEffectHandlerConfig
): TTSEffectHandler {
  return new TTSEffectHandler(config)
}
