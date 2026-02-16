/**
 * TTS Effect Handler - Serial Queue with Deduplication
 *
 * Ensures:
 * - Messages speak one at a time (serial queue)
 * - No duplicate auto-play (Set-based deduplication)
 * - onEnd resolves before advancing
 * - Manual override clears deduplication
 * - Survives React Strict Mode (double effect calls)
 */

import type { Message } from "@chat/lib/topik"

import type { ISessionMachine } from "./session-types"

// ═══════════════════════════════════════════════════════════════════════════
// SPEECH QUEUE SERVICE TYPES
// ═══════════════════════════════════════════════════════════════════════════

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
  speechQueue: SpeechQueueService
  componentId: string
  machine: ISessionMachine
  onMessageComplete?: (messageId: string) => void
  onSpeechStart?: (messageId: string) => void
  onSpeechEnd?: (messageId: string) => void
  onError?: (error: Error, messageId: string) => void
}

// ═══════════════════════════════════════════════════════════════════════════
// TTS EFFECT HANDLER
// ═══════════════════════════════════════════════════════════════════════════

export class TTSEffectHandler {
  private currentMessageId: string | null = null
  private speaking: boolean = false
  private priorityCounter: number = 0

  // Deduplication tracking
  private spokenAutoIds: Set<string> = new Set()
  private completedIds: Set<string> = new Set() // Track completed messages

  // Serial queue
  private queue: Array<{ message: Message; isAuto: boolean }> = []
  private processing: boolean = false

  constructor(private readonly config: TTSEffectHandlerConfig) {}

  // ═════════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * Enqueue a message for speaking
   * Auto-play messages are deduplicated
   */
  enqueue(message: Message, isAuto: boolean = true): void {
    // Deduplicate auto-play
    if (isAuto && this.spokenAutoIds.has(message.id)) {
      console.log(`[TTS] Skipping already-spoken message: ${message.id}`)
      return
    }

    console.log(`[TTS] Enqueuing message: ${message.id} (auto: ${isAuto})`)
    this.queue.push({ message, isAuto })

    // Start processing if not already running
    if (!this.processing) {
      this.processQueue()
    }
  }

  /**
   * Manual speak (UI-triggered)
   * Clears deduplication for this message
   */
  async speakManually(message: Message): Promise<void> {
    console.log(`[TTS] Manual speak requested: ${message.id}`)

    // Clear deduplication for this message
    this.spokenAutoIds.delete(message.id)
    this.completedIds.delete(message.id)

    // Clear queue and cancel current speech
    this.queue = []
    this.config.speechQueue.cancel()

    // Speak immediately (not auto-play)
    await this._speak(message, false)
  }

  /**
   * Stop current speech and clear queue
   */
  handleStopAudio(): void {
    if (this.currentMessageId) {
      console.log(`[TTS] 🔇 Stopping speech for ${this.currentMessageId}`)
      this.config.speechQueue.cancel()
      this.speaking = false

      const stoppedId = this.currentMessageId
      this.currentMessageId = null

      this.config.onSpeechEnd?.(stoppedId)
    }

    // Clear queue
    this.queue = []
  }

  isSpeaking(): boolean {
    return this.speaking
  }

  getCurrentMessageId(): string | null {
    return this.currentMessageId
  }

  reset(): void {
    this.handleStopAudio()
    this.spokenAutoIds.clear()
    this.completedIds.clear()
    this.priorityCounter = 0
    this.processing = false
  }

  destroy(): void {
    this.handleStopAudio()
    this.config.speechQueue.clear()
    this.spokenAutoIds.clear()
    this.completedIds.clear()
  }

  // ═════════════════════════════════════════════════════════════════════════
  // PRIVATE QUEUE PROCESSOR
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * Process queue serially - one message at a time
   */
  private async processQueue(): Promise<void> {
    this.processing = true

    while (this.queue.length > 0) {
      const { message, isAuto } = this.queue.shift()!

      // Double-check deduplication (in case queue was filled before processing)
      if (isAuto && this.spokenAutoIds.has(message.id)) {
        console.log(`[TTS] Skipping (already spoken): ${message.id}`)
        continue
      }

      await this._speak(message, isAuto)
    }

    this.processing = false
  }

  /**
   * Speak a single message and wait for completion
   */
  private async _speak(message: Message, isAuto: boolean): Promise<void> {
    const priority = ++this.priorityCounter
    this.currentMessageId = message.id

    console.log(
      `[TTS] Speaking message: ${message.id} (priority: ${priority}, auto: ${isAuto})`
    )

    return new Promise<void>((resolve) => {
      let completionFired = false // Guard against double-firing

      this.config.speechQueue.speak(
        message.content,
        {
          volume: 1.0,
          rate: 1.0,
          lang: "ko-KR",

          onStart: () => {
            this.speaking = true
            console.log(`[TTS] 🔊 Speaking: ${message.id}`)
            this.config.onSpeechStart?.(message.id)
          },

          onEnd: () => {
            // Guard against duplicate onEnd calls (Strict Mode)
            if (completionFired) {
              console.log(`[TTS] ⚠️ Duplicate onEnd ignored: ${message.id}`)
              return
            }
            completionFired = true

            this.speaking = false
            console.log(`[TTS] ✅ Complete: ${message.id}`)

            // Mark as spoken for deduplication
            if (isAuto) {
              this.spokenAutoIds.add(message.id)
            }

            this.config.onSpeechEnd?.(message.id)

            // Fire completion callback ONLY ONCE per message
            if (isAuto && !this.completedIds.has(message.id)) {
              this.completedIds.add(message.id)
              this.config.onMessageComplete?.(message.id)
            }

            this.currentMessageId = null
            resolve()
          },

          onError: (error) => {
            // Guard against duplicate onError calls
            if (completionFired) {
              console.log(`[TTS] ⚠️ Duplicate onError ignored: ${message.id}`)
              return
            }
            completionFired = true

            this.speaking = false
            console.error(`[TTS] ❌ Error: ${message.id}`, error)

            this.config.onError?.(error, message.id)
            this.config.onSpeechEnd?.(message.id)

            this.currentMessageId = null
            resolve() // Still resolve to continue queue
          },
        },
        priority
      )
    })
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// FACTORY
// ═══════════════════════════════════════════════════════════════════════════

export function createTTSEffectHandler(
  config: TTSEffectHandlerConfig
): TTSEffectHandler {
  return new TTSEffectHandler(config)
}
